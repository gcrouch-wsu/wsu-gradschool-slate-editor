import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'
import EmbeddedPostgres from 'embedded-postgres'
import { afterAll, beforeAll, expect, test } from 'vitest'
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
import { DELETE as purgeRoute } from '@/app/api/newsletters/[id]/purge/route'
import { closePool, getPool } from '@/lib/db/pool'
import {
  acquireLease,
  archiveNewsletter,
  createNewsletter,
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
  takeoverLease,
} from '@/lib/newsletters/service'
import { migrateDatabase } from '../scripts/migrate.mjs'
import { renderExportedHtml } from '@/lib/export-html'
import type { NewsletterData } from '@/types/newsletter'

let server: EmbeddedPostgres
let databaseDir = ''
let databaseUrl = ''

function titled(content: NewsletterData, title: string): NewsletterData {
  return { ...content, masthead: { ...content.masthead, title } }
}

function purgeRequest(token: string, id: string) {
  return new Request(`http://localhost/api/newsletters/${id}/purge`, {
    method: 'DELETE',
    headers: { cookie: `${SESSION_COOKIE}=${token}`, origin: 'http://localhost' },
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
  databaseDir = await mkdtemp(join(tmpdir(), 'slate-editor-pg-'))
  server = new EmbeddedPostgres({
    databaseDir,
    port: 55432,
    user: 'postgres',
    password: 'password',
    persistent: true,
    onLog: () => undefined,
    onError: () => undefined,
  })
  await server.initialise()
  await server.start()
  await server.createDatabase('slate_editor_test')
  databaseUrl = 'postgresql://postgres:password@127.0.0.1:55432/slate_editor_test'
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
  expect(Number(applied.rows[0].count)).toBe(3)

  await server.createDatabase('slate_editor_race')
  const raceUrl = 'postgresql://postgres:password@127.0.0.1:55432/slate_editor_race'
  await Promise.all([migrateDatabase(raceUrl), migrateDatabase(raceUrl)])
  const client = new pg.Client({ connectionString: raceUrl })
  await client.connect()
  const raced = await client.query('SELECT count(*)::text AS count FROM schema_migrations')
  await client.end()
  expect(Number(raced.rows[0].count)).toBe(3)

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

  await discardNewsletter(created.id, ada)
  const editorSession = await createSession(ada)
  const forbidden = await purgeRoute(purgeRequest(editorSession.token, created.id), {
    params: Promise.resolve({ id: created.id }),
  })
  expect(forbidden.status).toBe(403)
  expect(await getNewsletter(created.id)).not.toBeNull()
  expect(await dependentCount(created.id)).toEqual({ receipts: 1, recovery: 1, revisions: expect.any(Number) })
  expect((await dependentCount(created.id)).revisions).toBeGreaterThan(0)
  expect(await auditCount(created.id)).toBe(0)

  const adminSession = await createSession(admin)
  const purged = await purgeRoute(purgeRequest(adminSession.token, created.id), {
    params: Promise.resolve({ id: created.id }),
  })
  expect(purged.status).toBe(200)
  expect(await getNewsletter(created.id)).toBeNull()
  expect(await dependentCount(created.id)).toEqual({ receipts: 0, recovery: 0, revisions: 0 })
  const audit = await getPool().query<{ title: string; actor_id: string }>(
    'SELECT title, actor_id FROM newsletter_purge_events WHERE newsletter_id = $1',
    [created.id],
  )
  expect(audit.rows).toEqual([{ title: 'Friday Focus Newsletter', actor_id: admin }])
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
})
