import { spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'
import EmbeddedPostgres from 'embedded-postgres'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { sha256 } from '@/lib/auth/crypto'
import {
  AccountConflictError,
  authenticateLocalUser,
  createLocalUser,
  createProvisionedUser,
  createSession,
  principalFromToken,
  revokeSession,
  SESSION_COOKIE,
  updateUserAccess,
} from '@/lib/auth/session-store'
import { POST as localSession } from '@/app/api/auth/local/session/route'
import { POST as aiRoute } from '@/app/api/newsletters/[id]/ai/route'
import { POST as progressRoute } from '@/app/api/newsletters/[id]/progress/route'
import { DELETE as purgeRoute } from '@/app/api/newsletters/[id]/purge/route'
import { releaseAiRequest, reserveAiRequest } from '@/lib/ai/limits'
import { closePool, getPool } from '@/lib/db/pool'
import {
  acquireLease,
  archiveNewsletter,
  assertEditingAuthority,
  createNewsletter,
  duplicateNewsletter,
  discardNewsletter,
  EditConflictError,
  getNewsletter,
  importNewsletterDraft,
  listNewsletters,
  listRevisions,
  purgeArchivedNewsletter,
  releaseLease,
  renewLease,
  resumeLease,
  restoreArchivedNewsletter,
  replaceTemplate,
  restoreRevision,
  saveNewsletter,
  setNewsletterProgress,
  getSentVersion,
  takeoverLease,
} from '@/lib/newsletters/service'
import { migrateDatabase } from '../scripts/migrate.mjs'
import { canonicalJson } from '@/lib/canonical-json'
import { renderExportedHtml } from '@/lib/export-html'
import type { NewsletterData } from '@/types/newsletter'

let server: EmbeddedPostgres
let databaseDir = ''
let databaseUrl = ''
let databasePort = 0

function titled(content: NewsletterData, title: string): NewsletterData {
  return { ...content, masthead: { ...content.masthead, title } }
}

function purgeRequest(token: string, id: string) {
  return new Request(`http://localhost/api/newsletters/${id}/purge`, {
    method: 'DELETE',
    headers: {
      cookie: `${SESSION_COOKIE}=${token}`,
      origin: 'http://localhost',
    },
  })
}

async function dependentCount(id: string) {
  const receipts = await getPool().query<{ count: string }>(
    'SELECT count(*)::text AS count FROM newsletter_save_receipts WHERE newsletter_id = $1',
    [id],
  )
  const recovery = await getPool().query<{ count: string }>(
    'SELECT count(*)::text AS count FROM newsletter_recovery_drafts WHERE newsletter_id = $1',
    [id],
  )
  const revisions = await getPool().query<{ count: string }>(
    'SELECT count(*)::text AS count FROM newsletter_revisions WHERE newsletter_id = $1',
    [id],
  )
  return {
    receipts: Number(receipts.rows[0].count),
    recovery: Number(recovery.rows[0].count),
    revisions: Number(revisions.rows[0].count),
  }
}

async function auditCount(id: string) {
  const result = await getPool().query<{ count: string }>(
    'SELECT count(*)::text AS count FROM newsletter_purge_events WHERE newsletter_id = $1',
    [id],
  )
  return Number(result.rows[0].count)
}

async function editor(name: string, email: string | null = null) {
  return createProvisionedUser({
    displayName: name,
    email,
    role: 'editor',
    issuer: 'https://issuer.test',
    subject: `${name}-${crypto.randomUUID()}`,
  })
}

async function saveCount(id: string) {
  const result = await getPool().query<{ count: string }>(
    `SELECT count(*)::text AS count FROM newsletter_revisions WHERE newsletter_id = $1 AND action = 'save'`,
    [id],
  )
  return Number(result.rows[0].count)
}

beforeAll(async () => {
  const listener = createServer()
  await new Promise<void>((resolve, reject) => {
    listener.once('error', reject)
    listener.listen(0, '127.0.0.1', resolve)
  })
  databasePort = (listener.address() as { port: number }).port
  await new Promise<void>((resolve, reject) => listener.close((error) => (error ? reject(error) : resolve())))
  databaseDir = await mkdtemp(join(tmpdir(), 'slate-editor-pg-'))
  server = new EmbeddedPostgres({
    databaseDir,
    port: databasePort,
    user: 'postgres',
    password: 'password',
    persistent: true,
    onLog: () => undefined,
    onError: () => undefined,
  })
  await server.initialise()
  await server.start()
  await server.createDatabase('slate_editor_test')
  databaseUrl = `postgresql://postgres:password@127.0.0.1:${databasePort}/slate_editor_test`
  process.env.DATABASE_URL = databaseUrl
  process.env.AUTH_MODE = 'development'
  process.env.SESSION_SECRET = 'test-session-secret-with-32-characters'
  await migrateDatabase(databaseUrl)
})

afterAll(async () => {
  await closePool()
  if (server) await server.stop()
  if (databaseDir) await rm(databaseDir, { recursive: true, force: true })
})

test('migrations apply once, fail closed, and serialize', async () => {
  await migrateDatabase(databaseUrl)
  const applied = await getPool().query('SELECT count(*)::text AS count FROM schema_migrations')
  expect(Number(applied.rows[0].count)).toBe(4)

  await server.createDatabase('slate_editor_race')
  const raceUrl = `postgresql://postgres:password@127.0.0.1:${databasePort}/slate_editor_race`
  await Promise.all([migrateDatabase(raceUrl), migrateDatabase(raceUrl)])
  const client = new pg.Client({ connectionString: raceUrl })
  await client.connect()
  const raced = await client.query('SELECT count(*)::text AS count FROM schema_migrations')
  await client.end()
  expect(Number(raced.rows[0].count)).toBe(4)

  const missing = spawnSync(process.execPath, ['scripts/migrate.mjs'], {
    env: { ...process.env, DATABASE_URL: '' },
    encoding: 'utf8',
  })
  expect(missing.status).not.toBe(0)
})

test('a changed applied migration is rejected', async () => {
  const file = join(process.cwd(), 'migrations', '001_initial.sql')
  const original = await readFile(file, 'utf8')
  try {
    await writeFile(file, `${original}\n-- mutated\n`)
    await expect(migrateDatabase(databaseUrl)).rejects.toThrow(/changed after it was applied/)
  } finally {
    await writeFile(file, original)
  }
})

test('Windows and Linux migration checksums are compatible without rewriting the ledger', async () => {
  const file = join(process.cwd(), 'migrations', '001_initial.sql')
  const original = await readFile(file, 'utf8')
  const lf = original.replace(/\r\n/g, '\n')
  const crlf = lf.replace(/\n/g, '\r\n')
  const checksum = (sql: string) => createHash('sha256').update(sql).digest('hex')
  const recorded = await getPool().query<{ sql_sha256: string }>(
    "SELECT sql_sha256 FROM schema_migrations WHERE id = '001_initial.sql'",
  )
  try {
    for (const [storedSql, checkedOutSql] of [
      [crlf, lf],
      [lf, crlf],
    ]) {
      const storedHash = checksum(storedSql)
      await getPool().query("UPDATE schema_migrations SET sql_sha256 = $1 WHERE id = '001_initial.sql'", [storedHash])
      await writeFile(file, checkedOutSql)
      await migrateDatabase(databaseUrl)
      const unchanged = await getPool().query<{ sql_sha256: string }>(
        "SELECT sql_sha256 FROM schema_migrations WHERE id = '001_initial.sql'",
      )
      expect(unchanged.rows[0].sql_sha256).toBe(storedHash)
      await writeFile(file, `${checkedOutSql}\n-- real SQL change\n`)
      await expect(migrateDatabase(databaseUrl)).rejects.toThrow(/changed after it was applied/)
    }
  } finally {
    await writeFile(file, original)
    await getPool().query("UPDATE schema_migrations SET sql_sha256 = $1 WHERE id = '001_initial.sql'", [
      recorded.rows[0].sql_sha256,
    ])
  }
})

test('identities are unique and email is not', async () => {
  const first = await editor('Ada', 'same@example.edu')
  const second = await editor('Grace', 'same@example.edu')
  expect(first).not.toBe(second)
  await expect(
    createProvisionedUser({
      displayName: 'Duplicate',
      email: 'other@example.edu',
      role: 'editor',
      issuer: 'https://issuer.test',
      subject: 'fixed-subject',
    }),
  ).resolves.toEqual(expect.any(String))
  await expect(
    createProvisionedUser({
      displayName: 'Duplicate again',
      email: null,
      role: 'editor',
      issuer: 'https://issuer.test',
      subject: 'fixed-subject',
    }),
  ).rejects.toThrow()
})

test('sessions are revocable and follow authorization changes', async () => {
  const userId = await editor('Session')
  const session = await createSession(userId)
  const stored = await getPool().query<{ token_hash: string }>('SELECT token_hash FROM sessions WHERE user_id = $1', [
    userId,
  ])
  expect(stored.rows[0].token_hash).toBe(sha256(session.token))
  expect(stored.rows[0].token_hash).not.toBe(session.token)
  expect(await principalFromToken(session.token)).toMatchObject({
    userId,
    role: 'editor',
  })

  await updateUserAccess({ userId, role: 'administrator' })
  expect(await principalFromToken(session.token)).toBeNull()

  const replacement = await createSession(userId)
  await revokeSession(replacement.token)
  expect(await principalFromToken(replacement.token)).toBeNull()

  await updateUserAccess({ userId, active: false })
  await expect(createSession(userId)).rejects.toThrow(/not found/)
})

test('two users and two tokens cannot share one lease', async () => {
  const ada = await editor('Ada Lease')
  const grace = await editor('Grace Lease')
  const created = await createNewsletter(ada, 'ff')
  const first = await acquireLease(created.id, ada)
  await expect(acquireLease(created.id, grace)).rejects.toMatchObject({
    code: 'lease',
  })
  await expect(acquireLease(created.id, ada)).rejects.toMatchObject({
    code: 'lease',
  })
  const taken = await takeoverLease(created.id, ada)
  expect(taken.content.masthead.title).toBe(first.content.masthead.title)
  expect(taken.saveVersion).toBe(first.saveVersion)
  await expect(
    saveNewsletter(created.id, {
      userId: ada,
      token: first.token,
      expectedVersion: first.saveVersion,
      saveId: crypto.randomUUID(),
      snapshot: titled(created.content, 'Old token'),
    }),
  ).rejects.toBeInstanceOf(EditConflictError)
  const saved = await saveNewsletter(created.id, {
    userId: ada,
    token: taken.token,
    expectedVersion: taken.saveVersion,
    saveId: crypto.randomUUID(),
    snapshot: titled(created.content, 'New token'),
  })
  expect(saved.saveVersion).toBe(taken.saveVersion + 1)
})

test('saves are versioned, idempotent, and isolated from lease release', async () => {
  const userId = await editor('Saver')
  const created = await createNewsletter(userId, 'ff')
  const lease = await acquireLease(created.id, userId)
  const before = await saveCount(created.id)
  await expect(
    saveNewsletter(created.id, {
      userId,
      token: lease.token,
      expectedVersion: 99,
      saveId: 'stale',
      snapshot: titled(created.content, 'Stale'),
    }),
  ).rejects.toMatchObject({ code: 'version' })
  expect(await saveCount(created.id)).toBe(before)

  const first = await saveNewsletter(created.id, {
    userId,
    token: lease.token,
    expectedVersion: 1,
    saveId: 'save-1',
    snapshot: titled(created.content, 'First'),
  })
  const second = await saveNewsletter(created.id, {
    userId,
    token: lease.token,
    expectedVersion: first.saveVersion,
    saveId: 'save-2',
    snapshot: titled(created.content, 'Second'),
  })
  const retry = await saveNewsletter(created.id, {
    userId,
    token: lease.token,
    expectedVersion: 1,
    saveId: 'save-1',
    snapshot: titled(created.content, 'First'),
  })
  expect(retry).toMatchObject({
    idempotent: true,
    saveVersion: first.saveVersion,
    currentVersion: second.saveVersion,
  })
  expect((await getNewsletter(created.id))?.content.masthead.title).toBe('Second')
  expect(await saveCount(created.id)).toBe(2)

  await expect(
    saveNewsletter(created.id, {
      userId,
      token: lease.token,
      expectedVersion: 1,
      saveId: 'save-1',
      snapshot: titled(created.content, 'Different'),
    }),
  ).rejects.toMatchObject({ code: 'fingerprint' })
  expect(await saveCount(created.id)).toBe(2)

  const same = titled(created.content, 'Race')
  const raced = await Promise.all([
    saveNewsletter(created.id, {
      userId,
      token: lease.token,
      expectedVersion: second.saveVersion,
      saveId: 'race',
      snapshot: same,
    }),
    saveNewsletter(created.id, {
      userId,
      token: lease.token,
      expectedVersion: second.saveVersion,
      saveId: 'race',
      snapshot: same,
    }),
  ])
  expect(raced.filter((result) => result.idempotent)).toHaveLength(1)
  expect(new Set(raced.map((result) => result.saveVersion)).size).toBe(1)

  const mismatched = await Promise.allSettled([
    saveNewsletter(created.id, {
      userId,
      token: lease.token,
      expectedVersion: raced[0].saveVersion,
      saveId: 'mismatch',
      snapshot: titled(created.content, 'Left'),
    }),
    saveNewsletter(created.id, {
      userId,
      token: lease.token,
      expectedVersion: raced[0].saveVersion,
      saveId: 'mismatch',
      snapshot: titled(created.content, 'Right'),
    }),
  ])
  expect(mismatched.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  expect(mismatched.filter((result) => result.status === 'rejected')).toHaveLength(1)

  const release = await releaseLease(created.id, userId, 'not-the-token')
  expect(release).toEqual({ released: false, superseded: true })
  await expect(renewLease(created.id, userId, lease.token)).resolves.toMatchObject({ renewed: true })
  const finished = await releaseLease(created.id, userId, lease.token)
  expect(finished.released).toBe(true)
  expect((await getNewsletter(created.id))?.content.masthead.title).toBeTruthy()
})

test('an expired clean lease cannot be renewed or saved', async () => {
  const userId = await editor('Expiry')
  const created = await createNewsletter(userId, 'briefing')
  const lease = await acquireLease(created.id, userId)
  await getPool().query(`UPDATE newsletters SET lease_expires_at = now() - interval '5 minutes' WHERE id = $1`, [
    created.id,
  ])
  await expect(renewLease(created.id, userId, lease.token)).rejects.toMatchObject({ code: 'lease' })
  await expect(
    saveNewsletter(created.id, {
      userId,
      token: lease.token,
      expectedVersion: 1,
      saveId: 'expired',
      snapshot: titled(created.content, 'Too late'),
    }),
  ).rejects.toMatchObject({ code: 'lease' })
  expect((await getNewsletter(created.id))?.content.masthead.title).toBe(created.content.masthead.title)
})

test('takeover and stale release do not publish the previous editor content', async () => {
  const ada = await editor('Ada Take')
  const grace = await editor('Grace Take')
  const created = await createNewsletter(ada, 'letter')
  const adaLease = await acquireLease(created.id, ada)
  const graceLease = await takeoverLease(created.id, grace)
  expect(graceLease.content).toEqual(created.content)
  const stale = await releaseLease(created.id, ada, adaLease.token)
  expect(stale).toEqual({ released: false, superseded: true })
  await expect(renewLease(created.id, grace, graceLease.token)).resolves.toMatchObject({ renewed: true })
  const saved = await saveNewsletter(created.id, {
    userId: grace,
    token: graceLease.token,
    expectedVersion: graceLease.saveVersion,
    saveId: 'grace-save',
    snapshot: titled(created.content, 'Grace saved'),
  })
  expect(saved.idempotent).toBe(false)
  expect((await getNewsletter(created.id))?.summary.updatedByName).toBe('Grace Take')
})

test('lifecycle operations rotate or clear lease authority and keep history', async () => {
  const userId = await editor('Lifecycle')
  const created = await createNewsletter(userId, 'ff')
  const lease = await acquireLease(created.id, userId)
  const replaced = await replaceTemplate(created.id, {
    userId,
    token: lease.token,
    expectedVersion: lease.saveVersion,
    template: 'briefing',
  })
  expect(replaced.content.template).toBe('briefing')
  expect(replaced.token).toBeTruthy()
  expect(replaced.token).not.toBe(lease.token)
  await expect(renewLease(created.id, userId, lease.token)).rejects.toMatchObject({ code: 'lease' })
  const revisions = await listRevisions(created.id)
  const original = revisions.find((revision) => revision.action === 'create')
  expect(original?.actorName).toBe('Lifecycle')
  const restored = await restoreRevision(created.id, {
    userId,
    token: replaced.token!,
    expectedVersion: replaced.saveVersion,
    revisionId: original!.id,
  })
  expect(restored.content.template).toBe('ff')
  expect(restored.saveVersion).toBe(replaced.saveVersion + 1)
  const archived = await archiveNewsletter(created.id, {
    userId,
    token: restored.token!,
    expectedVersion: restored.saveVersion,
  })
  expect(archived.token).toBeNull()
  const row = await getPool().query<{
    lease_token_hash: string | null
    archived_at: Date | null
  }>('SELECT lease_token_hash, archived_at FROM newsletters WHERE id = $1', [created.id])
  expect(row.rows[0].lease_token_hash).toBeNull()
  expect(row.rows[0].archived_at).toBeTruthy()
  const history = await listRevisions(created.id)
  expect(history.map((revision) => revision.action)).toEqual(
    expect.arrayContaining(['create', 'template_replacement', 'restore', 'archive']),
  )
})

test('a library delete removes a draft and leaves one another editor is using', async () => {
  const ada = await editor('Ada Delete')
  const grace = await editor('Grace Delete')
  const created = await createNewsletter(ada, 'ff')
  const held = await createNewsletter(ada, 'briefing')
  const owned = await createNewsletter(ada, 'letter')
  await acquireLease(held.id, grace)
  await acquireLease(owned.id, ada)
  await expect(discardNewsletter(held.id, ada)).rejects.toBeInstanceOf(EditConflictError)
  expect((await listNewsletters()).map((item) => item.id)).toContain(held.id)
  await discardNewsletter(created.id, ada)
  await discardNewsletter(owned.id, ada)
  const visible = (await listNewsletters()).map((item) => item.id)
  expect(visible).not.toContain(created.id)
  expect(visible).not.toContain(owned.id)
  expect((await getNewsletter(created.id))?.summary.archived).toBe(true)
  expect((await listNewsletters(undefined, true)).map((item) => item.id)).toContain(created.id)
  expect((await getNewsletter(owned.id))?.summary.leaseHeld).toBe(false)
  expect((await listRevisions(created.id)).map((item) => item.action)).toEqual(
    expect.arrayContaining(['create', 'archive']),
  )
  const archivedVersion = (await getNewsletter(created.id))!.summary.saveVersion
  await restoreArchivedNewsletter(created.id, ada)
  expect((await getNewsletter(created.id))?.summary).toMatchObject({
    archived: false,
    leaseHeld: false,
    saveVersion: archivedVersion + 1,
  })
  expect((await listNewsletters()).map((item) => item.id)).toContain(created.id)
  const lease = await acquireLease(created.id, grace)
  await restoreArchivedNewsletter(created.id, ada)
  await expect(renewLease(created.id, grace, lease.token)).resolves.toMatchObject({ renewed: true })
  expect((await listRevisions(created.id)).filter((item) => item.action === 'unarchive')).toHaveLength(1)
})

test('permanent deletion only purges archived newsletters and their history', async () => {
  const ada = await editor('Ada Purge')
  const admin = await createProvisionedUser({
    displayName: 'Admin Purge',
    email: null,
    role: 'administrator',
    issuer: 'https://issuer.test',
    subject: `admin-purge-${crypto.randomUUID()}`,
  })
  const created = await createNewsletter(ada, 'ff')
  const preservedTitle = (await getNewsletter(created.id))!.summary.title
  await getPool().query(
    `INSERT INTO newsletter_save_receipts (
       id, newsletter_id, client_save_id, actor_id, base_version, request_fingerprint, committed_version
     ) VALUES ($1, $2, 'seed-save', $3, 1, 'seed-fingerprint', 1)`,
    [crypto.randomUUID(), created.id, ada],
  )
  await getPool().query(
    `INSERT INTO newsletter_recovery_drafts (newsletter_id, user_id, snapshot, base_version)
     VALUES ($1, $2, '{"seed":true}'::jsonb, 1)`,
    [created.id, ada],
  )
  await expect(purgeArchivedNewsletter(created.id, admin)).rejects.toMatchObject({ code: 'not_archived' })
  expect(await getNewsletter(created.id)).not.toBeNull()
  expect(await auditCount(created.id)).toBe(0)

  const lease = await acquireLease(created.id, ada)
  await setNewsletterProgress(created.id, {
    userId: ada,
    token: lease.token,
    expectedVersion: 1,
    progress: 'sent',
  })
  expect(
    (await getPool().query('SELECT 1 FROM newsletter_progress_receipts WHERE newsletter_id = $1', [created.id]))
      .rowCount,
  ).toBe(1)
  expect(
    (await getPool().query('SELECT 1 FROM newsletter_sent_marks WHERE newsletter_id = $1', [created.id])).rowCount,
  ).toBe(1)
  await discardNewsletter(created.id, ada)
  const editorSession = await createSession(ada)
  const forbidden = await purgeRoute(purgeRequest(editorSession.token, created.id), {
    params: Promise.resolve({ id: created.id }),
  })
  expect(forbidden.status).toBe(403)
  expect(await getNewsletter(created.id)).not.toBeNull()
  expect(await dependentCount(created.id)).toEqual({
    receipts: 1,
    recovery: 1,
    revisions: expect.any(Number),
  })
  expect((await dependentCount(created.id)).revisions).toBeGreaterThan(0)
  expect(await auditCount(created.id)).toBe(0)

  const adminSession = await createSession(admin)
  const purged = await purgeRoute(purgeRequest(adminSession.token, created.id), {
    params: Promise.resolve({ id: created.id }),
  })
  expect(purged.status).toBe(200)
  expect(await getNewsletter(created.id)).toBeNull()
  expect(await dependentCount(created.id)).toEqual({
    receipts: 0,
    recovery: 0,
    revisions: 0,
  })
  expect(
    (await getPool().query('SELECT 1 FROM newsletter_progress_receipts WHERE newsletter_id = $1', [created.id]))
      .rowCount,
  ).toBe(0)
  expect(
    (await getPool().query('SELECT 1 FROM newsletter_sent_marks WHERE newsletter_id = $1', [created.id])).rowCount,
  ).toBe(0)
  const audit = await getPool().query<{ title: string; actor_id: string }>(
    'SELECT title, actor_id FROM newsletter_purge_events WHERE newsletter_id = $1',
    [created.id],
  )
  expect(audit.rows).toEqual([{ title: preservedTitle, actor_id: admin }])
  const missing = await purgeRoute(purgeRequest(adminSession.token, created.id), {
    params: Promise.resolve({ id: created.id }),
  })
  expect(missing.status).toBe(404)
  expect(await auditCount(created.id)).toBe(1)
})

test('resuming a tab revalidates its lease and returns the current version and content', async () => {
  const userId = await editor('Resume')
  const created = await createNewsletter(userId, 'ff')
  const lease = await acquireLease(created.id, userId)
  const saved = await saveNewsletter(created.id, {
    userId,
    token: lease.token,
    expectedVersion: lease.saveVersion,
    saveId: 'resume-save',
    snapshot: titled(created.content, 'Latest saved'),
  })
  expect(await resumeLease(created.id, userId, lease.token)).toMatchObject({
    saveVersion: saved.saveVersion,
    content: { masthead: { title: 'Latest saved' } },
  })
  await getPool().query(`UPDATE newsletters SET lease_expires_at = now() - interval '1 second' WHERE id = $1`, [
    created.id,
  ])
  await expect(resumeLease(created.id, userId, lease.token)).rejects.toMatchObject({ code: 'lease' })
  const reacquired = await acquireLease(created.id, userId)
  expect(reacquired.token).not.toBe(lease.token)
  expect(reacquired.saveVersion).toBe(saved.saveVersion)
})

test('local accounts sign in with a password and keep the hash', async () => {
  const previous = process.env.AUTH_MODE
  process.env.AUTH_MODE = 'local'
  try {
    const userId = await createLocalUser({
      displayName: 'Local Ada',
      email: 'Local-Ada@example.edu',
      password: 'correct-horse-12',
      role: 'editor',
    })
    const stored = await getPool().query<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = $1', [
      userId,
    ])
    expect(stored.rows[0].password_hash.startsWith('scrypt:')).toBe(true)
    expect(stored.rows[0].password_hash).not.toContain('correct-horse')
    expect(await authenticateLocalUser('local-ada@example.edu', 'wrong-password-1')).toBeNull()
    await expect(
      createLocalUser({
        displayName: 'Again',
        email: 'local-ada@example.edu',
        password: 'another-password',
        role: 'editor',
      }),
    ).rejects.toBeInstanceOf(AccountConflictError)
    const response = await localSession(
      new Request('http://127.0.0.1:3000/api/auth/local/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://127.0.0.1:3000',
        },
        body: JSON.stringify({
          email: 'local-ada@example.edu',
          password: 'correct-horse-12',
        }),
      }),
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toContain('wsu_slate_session')
    await updateUserAccess({ userId, active: false })
    expect(await authenticateLocalUser('local-ada@example.edu', 'correct-horse-12')).toBeNull()
    await expect(
      createLocalUser({
        displayName: 'Short',
        email: 'short@example.edu',
        password: 'too-short',
        role: 'editor',
      }),
    ).rejects.toThrow(/12/)
  } finally {
    process.env.AUTH_MODE = previous
  }
})

test('import creates a new draft and export keeps the Slate browser link', async () => {
  const userId = await editor('Importer')
  const source = await createNewsletter(userId, 'letter')
  const exported = renderExportedHtml(source.content)
  expect(exported.html).toContain('href="browser"')
  const imported = await importNewsletterDraft(userId, source.content)
  expect(imported.id).not.toBe(source.id)
  expect(imported.saveVersion).toBe(1)
  const revisions = await listRevisions(imported.id)
  expect(revisions[0].action).toBe('import')
  const legacy = await importNewsletterDraft(userId, {
    ...source.content,
    issue: undefined,
    progress: 'sent',
  })
  const legacyRow = await getNewsletter(legacy.id)
  expect(legacyRow?.summary.title).toBe(source.content.masthead.title)
  expect(legacyRow?.summary.issueDate).toBeNull()
  expect(legacyRow?.summary.progress).toBe('draft')
  expect(legacyRow?.summary.sentMarkId).toBeNull()
})

test('new issues get an editable title while older titles stay untouched', async () => {
  const userId = await editor('Issue Namer')
  const created = await createNewsletter(userId, 'ff')
  expect(created.content.masthead.title).toBe('Friday Focus Newsletter')
  expect(created.content.issue?.title).toBeTruthy()
  expect(created.content.issue?.title).not.toBe('Friday Focus Newsletter')
  expect((await getNewsletter(created.id))?.summary.title).toBe(created.content.issue?.title)
  await getPool().query(`UPDATE newsletters SET title = 'Friday Focus Newsletter', issue_date = NULL WHERE id = $1`, [
    created.id,
  ])
  expect((await getNewsletter(created.id))?.summary).toMatchObject({
    title: 'Friday Focus Newsletter',
    issueDate: null,
    progress: 'draft',
  })
})

test('library filters combine template, title search, and archive state', async () => {
  const userId = await editor('Filter Editor')
  const focus = await createNewsletter(userId, 'ff')
  const briefing = await createNewsletter(userId, 'briefing')
  await discardNewsletter(briefing.id, userId)
  const activeFocus = await listNewsletters(undefined, {
    archived: false,
    template: 'ff',
    query: focus.content.issue?.title,
  })
  expect(activeFocus.map((item) => item.id)).toContain(focus.id)
  expect(activeFocus.map((item) => item.id)).not.toContain(briefing.id)
  const archivedBriefing = await listNewsletters(undefined, {
    archived: true,
    template: 'briefing',
  })
  expect(archivedBriefing.map((item) => item.id)).toContain(briefing.id)
  expect(await listNewsletters(undefined, { query: 'zzzz-no-such-issue' })).toEqual([])
  await getPool().query('UPDATE newsletters SET title = $2 WHERE id = $1', [focus.id, 'Progress_100% Newsletter'])
  expect((await listNewsletters(undefined, { query: '_100%' })).map((item) => item.id)).toContain(focus.id)
})

test('progress records a sent version without treating later edits as the sent copy', async () => {
  const ada = await editor('Ada Progress')
  const grace = await editor('Grace Progress')
  const created = await createNewsletter(ada, 'ff')
  const lease = await acquireLease(created.id, ada)
  await expect(
    setNewsletterProgress(created.id, {
      userId: grace,
      token: 'missing',
      expectedVersion: lease.saveVersion,
      progress: 'ready',
    }),
  ).rejects.toMatchObject({ code: 'lease' })
  await expect(
    setNewsletterProgress(created.id, {
      userId: ada,
      token: lease.token,
      expectedVersion: lease.saveVersion - 1,
      progress: 'ready',
    }),
  ).rejects.toMatchObject({ code: 'version' })
  expect((await getNewsletter(created.id))?.summary.progress).toBe('draft')
  const ready = await setNewsletterProgress(created.id, {
    userId: ada,
    token: lease.token,
    expectedVersion: lease.saveVersion,
    progress: 'ready',
  })
  expect(ready.progress).toBe('ready')
  const sent = await setNewsletterProgress(created.id, {
    userId: ada,
    token: lease.token,
    expectedVersion: ready.saveVersion,
    progress: 'sent',
  })
  const recorded = await getSentVersion(created.id)
  const retried = await setNewsletterProgress(created.id, {
    userId: ada,
    token: lease.token,
    expectedVersion: ready.saveVersion,
    progress: 'sent',
  })
  expect(retried.saveVersion).toBe(sent.saveVersion)
  expect(
    (await getPool().query('SELECT id FROM newsletter_sent_marks WHERE newsletter_id = $1', [created.id])).rows,
  ).toHaveLength(1)
  expect(recorded?.saveVersion).toBe(sent.saveVersion)
  expect(recorded?.changedSinceSent).toBe(false)
  const saved = await saveNewsletter(created.id, {
    userId: ada,
    token: lease.token,
    expectedVersion: sent.saveVersion,
    saveId: 'after-sent',
    snapshot: titled(created.content, 'Changed after sending'),
  })
  expect((await getNewsletter(created.id))?.summary.changedSinceSent).toBe(true)
  expect((await getNewsletter(created.id))?.summary.progress).toBe('sent')
  const stillRecorded = await getSentVersion(created.id)
  expect(stillRecorded?.snapshot.masthead.title).toBe(created.content.masthead.title)
  expect(stillRecorded?.snapshot.masthead.title).not.toBe('Changed after sending')
  expect(saved.saveVersion).toBeGreaterThan(sent.saveVersion)
  expect(saved.changedSinceSent).toBe(true)
  const reverted = await saveNewsletter(created.id, {
    userId: ada,
    token: lease.token,
    expectedVersion: saved.saveVersion,
    saveId: 'restore-sent-content',
    snapshot: created.content,
  })
  expect(reverted.changedSinceSent).toBe(false)
  const resumed = await resumeLease(created.id, ada, lease.token)
  expect(resumed.summary).toMatchObject({
    progress: 'sent',
    changedSinceSent: false,
    sentMarkId: recorded!.id,
  })
  expect(resumed.sentCanonical).toBe(canonicalJson(recorded!.snapshot))
  const taken = await takeoverLease(created.id, ada)
  expect(taken.summary).toMatchObject({
    progress: 'sent',
    changedSinceSent: false,
    sentMarkId: recorded!.id,
  })
  expect(taken.sentCanonical).toBe(resumed.sentCanonical)
})

test('AI reservations enforce concurrency and stale releases cannot delete a newer reservation', async () => {
  const userId = await editor('AI Limits')
  const first = await reserveAiRequest(userId)
  await expect(reserveAiRequest(userId)).rejects.toThrow(/already being prepared/)
  await getPool().query("UPDATE ai_inflight SET started_at = now() - interval '1 minute' WHERE actor_id = $1", [userId])
  const second = await reserveAiRequest(userId)
  await releaseAiRequest(userId, first)
  await expect(reserveAiRequest(userId)).rejects.toThrow(/already being prepared/)
  await releaseAiRequest(userId, second)
  await getPool().query(
    'INSERT INTO ai_usage_events (id, actor_id) SELECT gen_random_uuid(), $1 FROM generate_series(1, 30)',
    [userId],
  )
  await expect(reserveAiRequest(userId)).rejects.toThrow(/limit/)
})

test('duplicating starts a draft and retries return the same copy', async () => {
  const userId = await editor('Duplicator')
  const source = await createNewsletter(userId, 'briefing')
  const lease = await acquireLease(source.id, userId)
  await setNewsletterProgress(source.id, {
    userId,
    token: lease.token,
    expectedVersion: lease.saveVersion,
    progress: 'sent',
  })
  const first = await duplicateNewsletter(source.id, userId, {
    requestId: 'duplicate-request-1',
    issueTitle: 'November 7, 2026',
    issueDate: 'November 7, 2026',
  })
  const second = await duplicateNewsletter(source.id, userId, {
    requestId: 'duplicate-request-1',
    issueTitle: 'November 7, 2026',
  })
  expect(second).toMatchObject({ id: first.id, idempotent: true })
  const copy = await getNewsletter(first.id)
  expect(copy?.summary).toMatchObject({
    progress: 'draft',
    title: 'November 7, 2026',
    sourceNewsletterId: source.id,
    sentMarkId: null,
    archived: false,
  })
  expect(copy?.content.template).toBe('briefing')
  expect((await listRevisions(first.id)).map((item) => item.action)).toEqual(['duplicate'])
  expect((await getNewsletter(source.id))?.summary.progress).toBe('sent')
  expect((await listRevisions(source.id)).some((item) => item.action === 'duplicate')).toBe(false)
  const receipts = await getPool().query(
    'SELECT count(*)::text AS count FROM newsletter_save_receipts WHERE newsletter_id = $1',
    [first.id],
  )
  const recovery = await getPool().query(
    'SELECT count(*)::text AS count FROM newsletter_recovery_drafts WHERE newsletter_id = $1',
    [first.id],
  )
  expect(receipts.rows[0].count).toBe('0')
  expect(recovery.rows[0].count).toBe('0')
})

test('configured AI requests do not save content and reject takeover during generation', async () => {
  const userId = await editor('AI Happy Path')
  const other = await editor('AI Takeover')
  const created = await createNewsletter(userId, 'ff')
  const session = await createSession(userId)
  const lease = await acquireLease(created.id, userId)
  const target = {
    kind: 'card',
    sectionKey: 'deadlines',
    cardIndex: 0,
    field: 'body_html',
    originalText: created.content.sections[0].cards![0].body_html,
    label: 'Sample Announcement',
  }
  const request = (selected = target) =>
    new Request(`http://localhost/api/newsletters/${created.id}/ai`, {
      method: 'POST',
      headers: {
        origin: 'http://localhost',
        cookie: `${SESSION_COOKIE}=${session.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        action: 'edit',
        token: lease.token,
        expectedVersion: lease.saveVersion,
        target: selected,
      }),
    })
  const fetchMock = vi.spyOn(globalThis, 'fetch')
  vi.stubEnv('AI_GATEWAY_API_KEY', 'test-key')
  vi.stubEnv('AI_GATEWAY_MODEL', 'test/model')
  const output = () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                proposed: '<p>Clear copy.</p>',
                reasons: [{ guide: 'Section 3', text: 'Lead with the subject.' }],
              }),
            },
          },
        ],
      }),
    )
  try {
    fetchMock.mockImplementation(async () => output())
    const valid = await aiRoute(request(), {
      params: Promise.resolve({ id: created.id }),
    })
    expect(valid.status).toBe(200)
    expect((await valid.json()).base.saveVersion).toBe(lease.saveVersion)
    expect((await getNewsletter(created.id))?.summary.saveVersion).toBe(lease.saveVersion)
    const invalid = await aiRoute(request({ ...target, field: 'preheader' }), {
      params: Promise.resolve({ id: created.id }),
    })
    expect(invalid.status).toBe(400)
    fetchMock.mockImplementation(async () => {
      await takeoverLease(created.id, other)
      return output()
    })
    const lost = await aiRoute(request(), {
      params: Promise.resolve({ id: created.id }),
    })
    expect(lost.status).toBe(409)
    expect((await getNewsletter(created.id))?.content.sections[0].cards![0].body_html).toBe(target.originalText)
  } finally {
    fetchMock.mockRestore()
    vi.unstubAllEnvs()
  }
})

test('AI requests require editing authority and do not invent output when unconfigured', async () => {
  const userId = await editor('AI Editor')
  const created = await createNewsletter(userId, 'ff')
  const session = await createSession(userId)
  const denied = await aiRoute(
    new Request(`http://localhost/api/newsletters/${created.id}/ai`, {
      method: 'POST',
      headers: {
        origin: 'http://localhost',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ action: 'edit' }),
    }),
    { params: Promise.resolve({ id: created.id }) },
  )
  expect(denied.status).toBe(401)
  const viewOnly = await aiRoute(
    new Request(`http://localhost/api/newsletters/${created.id}/ai`, {
      method: 'POST',
      headers: {
        origin: 'http://localhost',
        cookie: `${SESSION_COOKIE}=${session.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        action: 'edit',
        token: 'lost-lease',
        expectedVersion: 1,
        target: {
          kind: 'card',
          sectionKey: 'deadlines',
          cardIndex: 0,
          field: 'body_html',
          originalText: created.content.sections[0].cards?.[0].body_html,
          label: 'Sample Announcement',
        },
      }),
    }),
    { params: Promise.resolve({ id: created.id }) },
  )
  expect(viewOnly.status).toBe(409)
  const lease = await acquireLease(created.id, userId)
  const previousKey = process.env.AI_GATEWAY_API_KEY
  const previousModel = process.env.AI_GATEWAY_MODEL
  delete process.env.AI_GATEWAY_API_KEY
  delete process.env.AI_GATEWAY_MODEL
  try {
    const unconfigured = await aiRoute(
      new Request(`http://localhost/api/newsletters/${created.id}/ai`, {
        method: 'POST',
        headers: {
          origin: 'http://localhost',
          cookie: `${SESSION_COOKIE}=${session.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          action: 'edit',
          token: lease.token,
          expectedVersion: lease.saveVersion,
          target: {
            kind: 'card',
            sectionKey: created.content.sections[0].key,
            cardIndex: 0,
            field: 'body_html',
            originalText: created.content.sections[0].cards?.[0].body_html,
            label: 'Sample Announcement',
          },
        }),
      }),
      { params: Promise.resolve({ id: created.id }) },
    )
    expect(unconfigured.status).toBe(503)
    expect(await unconfigured.json()).toMatchObject({
      error: expect.stringMatching(/not configured/),
    })
  } finally {
    if (previousKey === undefined) delete process.env.AI_GATEWAY_API_KEY
    else process.env.AI_GATEWAY_API_KEY = previousKey
    if (previousModel === undefined) delete process.env.AI_GATEWAY_MODEL
    else process.env.AI_GATEWAY_MODEL = previousModel
  }
  expect((await getNewsletter(created.id))?.summary.saveVersion).toBe(lease.saveVersion)
  await expect(assertEditingAuthority(created.id, userId, 'lost-lease', lease.saveVersion)).rejects.toMatchObject({
    code: 'lease',
  })
  const blocked = await progressRoute(
    new Request(`http://localhost/api/newsletters/${created.id}/progress`, {
      method: 'POST',
      headers: {
        origin: 'http://localhost',
        cookie: `${SESSION_COOKIE}=${session.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        progress: 'sent',
        token: 'lost-lease',
        expectedVersion: lease.saveVersion,
      }),
    }),
    { params: Promise.resolve({ id: created.id }) },
  )
  expect(blocked.status).toBe(409)
})
