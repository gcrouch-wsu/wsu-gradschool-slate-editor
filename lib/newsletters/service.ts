import type { Pool, PoolClient } from 'pg'
import { getPool } from '@/lib/db/pool'
import { sha256, randomToken } from '@/lib/auth/crypto'
import type { UserRole } from '@/lib/auth/session-store'
import { defaultBriefingModel, defaultFFModel, defaultLetterModel } from '@/lib/defaults'
import { issueDateOf, issueTitleOf, withNewIssue } from '@/lib/issue'
import { canonicalJson } from '@/lib/canonical-json'
import { DOCUMENT_SCHEMA_VERSION, documentFingerprint, normalizeNewsletter } from '@/lib/newsletter-document'
import type { NewsletterData, NewsletterProgress, TemplateType } from '@/types/newsletter'

const LEASE_SECONDS = 180

export class EditConflictError extends Error {
  constructor(
    public code: 'version' | 'lease' | 'fingerprint' | 'archived' | 'not_archived' | 'not_found',
    message: string,
  ) {
    super(message)
    this.name = 'EditConflictError'
  }
}

export interface NewsletterSummary {
  id: string
  title: string
  template: TemplateType
  saveVersion: number
  updatedAt: string
  updatedByName: string
  leaseHeld: boolean
  leaseHolderName: string | null
  leaseHolderUserId: string | null
  leaseExpiresAt: string | null
  archived: boolean
  progress: NewsletterProgress
  issueDate: string | null
  sourceNewsletterId: string | null
  sentMarkId: string | null
  sentSaveVersion: number | null
  sentAt: string | null
  sentByName: string | null
  changedSinceSent: boolean
}

export interface LibraryQuery {
  archived?: boolean
  template?: TemplateType | 'all'
  query?: string
}

interface NewsletterRow {
  id: string
  title: string
  template: TemplateType
  content: NewsletterData
  document_schema_version: number
  save_version: number
  archived_at: string | null
  updated_at: string
  updated_by_name: string
  progress: NewsletterProgress
  issue_date: string | null
  source_newsletter_id: string | null
  lease_token_hash: string | null
  lease_holder_user_id: string | null
  lease_holder_name: string | null
  lease_expires_at: string | null
  sent_id?: string | null
  sent_save_version?: number | null
  sent_marked_at?: string | null
  sent_actor_name?: string | null
  sent_snapshot?: NewsletterData | null
}

function modelFor(template: TemplateType): NewsletterData {
  if (template === 'briefing') return defaultBriefingModel()
  if (template === 'letter') return defaultLetterModel()
  return defaultFFModel()
}

function titleOf(data: NewsletterData): string {
  return issueTitleOf(data)
}

const NEWSLETTER_COLUMNS = `n.id, n.title, n.template, n.content, n.document_schema_version, n.save_version,
            n.archived_at, n.updated_at, n.progress, n.issue_date, n.source_newsletter_id,
            updater.display_name AS updated_by_name,
            n.lease_token_hash, n.lease_holder_user_id, holder.display_name AS lease_holder_name,
            n.lease_expires_at`

const SENT_JOIN = `LEFT JOIN LATERAL (
       SELECT m.id AS sent_id, m.save_version AS sent_save_version, m.marked_at AS sent_marked_at,
              m.snapshot AS sent_snapshot, actor.display_name AS sent_actor_name
       FROM newsletter_sent_marks m
       JOIN users actor ON actor.id = m.actor_id
       WHERE m.newsletter_id = n.id
       ORDER BY m.save_version DESC, m.marked_at DESC
       LIMIT 1
     ) sent ON true`

async function withNewsletterLock<T>(
  newsletterId: string,
  work: (client: PoolClient) => Promise<T>,
  pool: Pool,
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(8142, hashtext($1))', [newsletterId])
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // Ignore a rollback after a failed connection.
    }
    throw error
  } finally {
    client.release()
  }
}

async function loadRow(client: PoolClient, id: string): Promise<NewsletterRow | null> {
  const result = await client.query<NewsletterRow>(
    `SELECT ${NEWSLETTER_COLUMNS},
            sent.sent_id, sent.sent_save_version, sent.sent_marked_at, sent.sent_actor_name, sent.sent_snapshot
     FROM newsletters n
     JOIN users updater ON updater.id = n.updated_by
     LEFT JOIN users holder ON holder.id = n.lease_holder_user_id
     ${SENT_JOIN}
     WHERE n.id = $1
     FOR UPDATE OF n`,
    [id],
  )
  return result.rows[0] ?? null
}

function leaseActive(row: NewsletterRow, now = Date.now()): boolean {
  if (!row.lease_token_hash || !row.lease_expires_at) return false
  return new Date(row.lease_expires_at).getTime() > now
}

function assertHolder(row: NewsletterRow, userId: string, token: string) {
  if (row.archived_at) throw new EditConflictError('archived', 'This newsletter is archived.')
  if (!leaseActive(row) || row.lease_holder_user_id !== userId || row.lease_token_hash !== sha256(token)) {
    throw new EditConflictError('lease', 'Editing lease lost')
  }
}

export async function listNewsletters(
  pool: Pool = getPool(),
  archivedOrQuery: boolean | LibraryQuery = false,
): Promise<NewsletterSummary[]> {
  const query = typeof archivedOrQuery === 'boolean' ? { archived: archivedOrQuery } : archivedOrQuery
  const template = query.template && query.template !== 'all' ? query.template : null
  const text = (query.query ?? '').trim().slice(0, 200)
  const result = await pool.query<NewsletterRow>(
    `SELECT ${NEWSLETTER_COLUMNS},
            sent.sent_id, sent.sent_save_version, sent.sent_marked_at, sent.sent_actor_name, sent.sent_snapshot
     FROM newsletters n
     JOIN users updater ON updater.id = n.updated_by
     LEFT JOIN users holder ON holder.id = n.lease_holder_user_id
     ${SENT_JOIN}
     WHERE (n.archived_at IS NOT NULL) = $1
       AND ($2::text IS NULL OR n.template = $2)
       AND ($3::text IS NULL OR strpos(lower(n.title), lower($3)) > 0 OR strpos(lower(COALESCE(n.issue_date, '')), lower($3)) > 0)
     ORDER BY n.updated_at DESC`,
    [Boolean(query.archived), template, text || null],
  )
  return result.rows.map(toSummary)
}

function changedSinceSent(row: NewsletterRow): boolean {
  if (!row.sent_snapshot) return false
  const current = documentFingerprint(normalizeNewsletter(row.content))
  const sent = documentFingerprint(normalizeNewsletter(row.sent_snapshot))
  return current !== sent
}

function sentCanonical(row: NewsletterRow): string | null {
  if (!row.sent_snapshot) return null
  return canonicalJson(normalizeNewsletter(row.sent_snapshot))
}

function toSummary(row: NewsletterRow): NewsletterSummary {
  const held = leaseActive(row)
  return {
    id: row.id,
    title: row.title,
    template: row.template,
    saveVersion: row.save_version,
    updatedAt: new Date(row.updated_at).toISOString(),
    updatedByName: row.updated_by_name,
    leaseHeld: held,
    leaseHolderName: held ? row.lease_holder_name : null,
    leaseHolderUserId: held ? row.lease_holder_user_id : null,
    leaseExpiresAt: held && row.lease_expires_at ? new Date(row.lease_expires_at).toISOString() : null,
    archived: Boolean(row.archived_at),
    progress: row.progress ?? 'draft',
    issueDate: row.issue_date,
    sourceNewsletterId: row.source_newsletter_id,
    sentMarkId: row.sent_id ?? null,
    sentSaveVersion: row.sent_save_version ?? null,
    sentAt: row.sent_marked_at ? new Date(row.sent_marked_at).toISOString() : null,
    sentByName: row.sent_actor_name ?? null,
    changedSinceSent: changedSinceSent(row),
  }
}

export async function getNewsletter(id: string, pool: Pool = getPool()) {
  const result = await pool.query<NewsletterRow>(
    `SELECT ${NEWSLETTER_COLUMNS},
            sent.sent_id, sent.sent_save_version, sent.sent_marked_at, sent.sent_actor_name, sent.sent_snapshot
     FROM newsletters n
     JOIN users updater ON updater.id = n.updated_by
     LEFT JOIN users holder ON holder.id = n.lease_holder_user_id
     ${SENT_JOIN}
     WHERE n.id = $1`,
    [id],
  )
  const row = result.rows[0]
  if (!row) return null
  const content = normalizeNewsletter(row.content)
  return { summary: toSummary(row), content, sentCanonical: sentCanonical(row) }
}

export async function createNewsletter(
  userId: string,
  template: TemplateType,
  pool: Pool = getPool(),
  issue?: { title?: string; date?: string },
) {
  const fresh = withNewIssue(
    normalizeNewsletter(modelFor(template), {
      requireShape: true,
    }),
  )
  const issueTitle = issue?.title?.trim().slice(0, 200)
  const issueDate = issue?.date?.trim().slice(0, 80)
  const content =
    issueTitle || issueDate
      ? normalizeNewsletter({
          ...fresh,
          issue: { title: issueTitle || fresh.issue?.title || '', date: issueDate ?? fresh.issue?.date ?? '' },
        })
      : fresh
  const id = crypto.randomUUID()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `INSERT INTO newsletters (
         id, title, template, content, document_schema_version, save_version, created_by, updated_by, issue_date, progress
       ) VALUES ($1, $2, $3, $4::jsonb, $5, 1, $6, $6, $7, 'draft')`,
      [
        id,
        titleOf(content),
        content.template,
        JSON.stringify(content),
        DOCUMENT_SCHEMA_VERSION,
        userId,
        issueDateOf(content),
      ],
    )
    await client.query(
      `INSERT INTO newsletter_revisions (id, newsletter_id, revision_number, snapshot, actor_id, action)
       VALUES ($1, $2, 1, $3::jsonb, $4, 'create')`,
      [crypto.randomUUID(), id, JSON.stringify(content), userId],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
  return { id, saveVersion: 1, content }
}

export async function importNewsletterDraft(userId: string, snapshot: unknown, pool: Pool = getPool()) {
  const content = normalizeNewsletter(snapshot, { requireShape: true })
  const id = crypto.randomUUID()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `INSERT INTO newsletters (
         id, title, template, content, document_schema_version, save_version, created_by, updated_by, issue_date, progress
       ) VALUES ($1, $2, $3, $4::jsonb, $5, 1, $6, $6, $7, 'draft')`,
      [
        id,
        titleOf(content),
        content.template,
        JSON.stringify(content),
        DOCUMENT_SCHEMA_VERSION,
        userId,
        issueDateOf(content),
      ],
    )
    await client.query(
      `INSERT INTO newsletter_revisions (id, newsletter_id, revision_number, snapshot, actor_id, action)
       VALUES ($1, $2, 1, $3::jsonb, $4, 'import')`,
      [crypto.randomUUID(), id, JSON.stringify(content), userId],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
  return { id, saveVersion: 1, content }
}

export async function acquireLease(id: string, userId: string, pool: Pool = getPool()) {
  const token = randomToken()
  return withNewsletterLock(
    id,
    async (client) => {
      const row = await loadRow(client, id)
      if (!row) throw new EditConflictError('not_found', 'Newsletter not found.')
      if (row.archived_at) throw new EditConflictError('archived', 'This newsletter is archived.')
      if (leaseActive(row)) {
        throw new EditConflictError('lease', 'Another editing session holds this newsletter.')
      }
      await client.query(
        `UPDATE newsletters
       SET lease_token_hash = $2, lease_holder_user_id = $3, lease_expires_at = now() + ($4 || ' seconds')::interval
       WHERE id = $1`,
        [id, sha256(token), userId, String(LEASE_SECONDS)],
      )
      const acquired = (await loadRow(client, id))!
      return {
        token,
        saveVersion: acquired.save_version,
        content: normalizeNewsletter(acquired.content),
        summary: toSummary(acquired),
        sentCanonical: sentCanonical(acquired),
      }
    },
    pool,
  )
}

// A token retained by a tab is only a hint. Revalidate it and reload the canonical
// document before making a remounted editor writable.
export async function resumeLease(id: string, userId: string, token: string, pool: Pool = getPool()) {
  return withNewsletterLock(
    id,
    async (client) => {
      const row = await loadRow(client, id)
      if (!row) throw new EditConflictError('not_found', 'Newsletter not found.')
      assertHolder(row, userId, token)
      await client.query(
        `UPDATE newsletters SET lease_expires_at = now() + ($2 || ' seconds')::interval WHERE id = $1`,
        [id, String(LEASE_SECONDS)],
      )
      return {
        token,
        saveVersion: row.save_version,
        content: normalizeNewsletter(row.content),
        summary: toSummary(row),
        sentCanonical: sentCanonical(row),
      }
    },
    pool,
  )
}

export async function renewLease(id: string, userId: string, token: string, pool: Pool = getPool()) {
  return withNewsletterLock(
    id,
    async (client) => {
      const row = await loadRow(client, id)
      if (!row) throw new EditConflictError('not_found', 'Newsletter not found.')
      assertHolder(row, userId, token)
      await client.query(
        `UPDATE newsletters
       SET lease_expires_at = now() + ($2 || ' seconds')::interval
       WHERE id = $1`,
        [id, String(LEASE_SECONDS)],
      )
      return { renewed: true, saveVersion: row.save_version }
    },
    pool,
  )
}

export async function takeoverLease(id: string, userId: string, pool: Pool = getPool()) {
  const token = randomToken()
  return withNewsletterLock(
    id,
    async (client) => {
      const row = await loadRow(client, id)
      if (!row) throw new EditConflictError('not_found', 'Newsletter not found.')
      if (row.archived_at) throw new EditConflictError('archived', 'This newsletter is archived.')
      await client.query(
        `UPDATE newsletters
       SET lease_token_hash = $2, lease_holder_user_id = $3, lease_expires_at = now() + ($4 || ' seconds')::interval
       WHERE id = $1`,
        [id, sha256(token), userId, String(LEASE_SECONDS)],
      )
      const current = (await loadRow(client, id))!
      return {
        token,
        saveVersion: row.save_version,
        content: normalizeNewsletter(row.content),
        summary: toSummary(current),
        sentCanonical: sentCanonical(current),
      }
    },
    pool,
  )
}

export async function releaseLease(id: string, userId: string, token: string, pool: Pool = getPool()) {
  return withNewsletterLock(
    id,
    async (client) => {
      const row = await loadRow(client, id)
      if (!row) throw new EditConflictError('not_found', 'Newsletter not found.')
      if (!row.lease_token_hash) return { released: true, alreadyReleased: true }
      if (row.lease_holder_user_id !== userId || row.lease_token_hash !== sha256(token)) {
        return { released: false, superseded: true }
      }
      await client.query(
        `UPDATE newsletters
       SET lease_token_hash = NULL, lease_holder_user_id = NULL, lease_expires_at = NULL
       WHERE id = $1`,
        [id],
      )
      return { released: true, alreadyReleased: false }
    },
    pool,
  )
}

export interface SaveInput {
  userId: string
  token: string
  expectedVersion: number
  saveId: string
  snapshot: unknown
}

export async function saveNewsletter(id: string, input: SaveInput, pool: Pool = getPool()) {
  const content = normalizeNewsletter(input.snapshot, { requireShape: true })
  const fingerprint = documentFingerprint(content)
  return withNewsletterLock(
    id,
    async (client) => {
      const receipt = await client.query<{
        actor_id: string
        base_version: number
        request_fingerprint: string
        committed_version: number
      }>(
        `SELECT actor_id, base_version, request_fingerprint, committed_version
       FROM newsletter_save_receipts
       WHERE newsletter_id = $1 AND client_save_id = $2`,
        [id, input.saveId],
      )
      const existing = receipt.rows[0]
      if (existing) {
        if (
          existing.actor_id !== input.userId ||
          existing.base_version !== input.expectedVersion ||
          existing.request_fingerprint !== fingerprint
        ) {
          throw new EditConflictError('fingerprint', 'Save id was reused for a different request.')
        }
        const row = await loadRow(client, id)
        return {
          saveVersion: existing.committed_version,
          idempotent: true,
          currentVersion: row?.save_version ?? existing.committed_version,
          content,
          changedSinceSent: row ? changedSinceSent(row) : false,
        }
      }

      const row = await loadRow(client, id)
      if (!row) throw new EditConflictError('not_found', 'Newsletter not found.')
      assertHolder(row, input.userId, input.token)
      if (row.save_version !== input.expectedVersion) {
        throw new EditConflictError('version', 'Stale newsletter version.')
      }

      const updated = await client.query<{ save_version: number }>(
        `UPDATE newsletters
       SET content = $2::jsonb,
           template = $3,
           title = $4,
           document_schema_version = $5,
           issue_date = $11,
           save_version = save_version + 1,
           updated_by = $6,
           updated_at = now(),
           last_save_id = $7,
           lease_expires_at = now() + ($8 || ' seconds')::interval
       WHERE id = $1
         AND save_version = $9
         AND lease_holder_user_id = $6
         AND lease_token_hash = $10
         AND lease_expires_at > now()
         AND archived_at IS NULL
       RETURNING save_version`,
        [
          id,
          JSON.stringify(content),
          content.template,
          titleOf(content),
          DOCUMENT_SCHEMA_VERSION,
          input.userId,
          input.saveId,
          String(LEASE_SECONDS),
          input.expectedVersion,
          sha256(input.token),
          issueDateOf(content),
        ],
      )
      const committed = updated.rows[0]?.save_version
      if (!committed) throw new EditConflictError('version', 'Stale newsletter version.')
      await appendRevision(client, id, content, input.userId, 'save')
      await client.query(
        `INSERT INTO newsletter_save_receipts (
         id, newsletter_id, client_save_id, actor_id, base_version, request_fingerprint, committed_version
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [crypto.randomUUID(), id, input.saveId, input.userId, input.expectedVersion, fingerprint, committed],
      )
      return {
        saveVersion: committed,
        idempotent: false,
        currentVersion: committed,
        content,
        changedSinceSent: changedSinceSent({ ...row, content }),
      }
    },
    pool,
  )
}

async function appendRevision(
  client: PoolClient,
  id: string,
  snapshot: NewsletterData,
  actorId: string,
  action: string,
) {
  await client.query(
    `INSERT INTO newsletter_revisions (id, newsletter_id, revision_number, snapshot, actor_id, action)
     VALUES (
       $1, $2,
       COALESCE((SELECT MAX(revision_number) FROM newsletter_revisions WHERE newsletter_id = $2), 0) + 1,
       $3::jsonb, $4, $5
     )`,
    [crypto.randomUUID(), id, JSON.stringify(snapshot), actorId, action],
  )
}

async function mutateWithLease(
  id: string,
  input: {
    userId: string
    token: string
    expectedVersion: number
    action: string
    next: NewsletterData
    archive?: boolean
  },
  pool: Pool,
) {
  const content = normalizeNewsletter(input.next, { requireShape: true })
  const token = input.archive ? null : randomToken()
  return withNewsletterLock(
    id,
    async (client) => {
      const row = await loadRow(client, id)
      if (!row) throw new EditConflictError('not_found', 'Newsletter not found.')
      assertHolder(row, input.userId, input.token)
      if (row.save_version !== input.expectedVersion) {
        throw new EditConflictError('version', 'Stale newsletter version.')
      }
      const updated = await client.query(
        `UPDATE newsletters
       SET content = $2::jsonb,
           template = $3,
           title = $4,
           issue_date = $11,
           save_version = save_version + 1,
           updated_by = $5::uuid,
           updated_at = now(),
           archived_at = CASE WHEN $6::boolean THEN now() ELSE archived_at END,
           lease_token_hash = $7::text,
           lease_holder_user_id = CASE WHEN $7::text IS NULL THEN NULL::uuid ELSE $5::uuid END,
           lease_expires_at = CASE WHEN $7::text IS NULL THEN NULL ELSE now() + ($8::text || ' seconds')::interval END
       WHERE id = $1 AND save_version = $9::int AND lease_token_hash = $10::text`,
        [
          id,
          JSON.stringify(content),
          content.template,
          titleOf(content),
          input.userId,
          Boolean(input.archive),
          token ? sha256(token) : null,
          String(LEASE_SECONDS),
          input.expectedVersion,
          sha256(input.token),
          issueDateOf(content),
        ],
      )
      if (updated.rowCount !== 1) throw new EditConflictError('version', 'Stale newsletter version.')
      await appendRevision(client, id, content, input.userId, input.action)
      return { saveVersion: input.expectedVersion + 1, token, content }
    },
    pool,
  )
}

export async function replaceTemplate(
  id: string,
  input: {
    userId: string
    token: string
    expectedVersion: number
    template: TemplateType
  },
  pool: Pool = getPool(),
) {
  return mutateWithLease(
    id,
    {
      ...input,
      action: 'template_replacement',
      next: modelFor(input.template),
    },
    pool,
  )
}

export async function restoreRevision(
  id: string,
  input: {
    userId: string
    token: string
    expectedVersion: number
    revisionId: string
  },
  pool: Pool = getPool(),
) {
  const revision = await pool.query<{ snapshot: NewsletterData }>(
    'SELECT snapshot FROM newsletter_revisions WHERE id = $1 AND newsletter_id = $2',
    [input.revisionId, id],
  )
  const snapshot = revision.rows[0]?.snapshot
  if (!snapshot) throw new EditConflictError('not_found', 'Revision not found.')
  return mutateWithLease(id, { ...input, action: 'restore', next: snapshot }, pool)
}

export async function getRevisionSnapshot(id: string, revisionId: string, pool: Pool = getPool()) {
  const result = await pool.query<{ snapshot: NewsletterData }>(
    'SELECT snapshot FROM newsletter_revisions WHERE id = $1 AND newsletter_id = $2',
    [revisionId, id],
  )
  const snapshot = result.rows[0]?.snapshot
  return snapshot ? normalizeNewsletter(snapshot) : null
}

export async function archiveNewsletter(
  id: string,
  input: { userId: string; token: string; expectedVersion: number },
  pool: Pool = getPool(),
) {
  const current = await getNewsletter(id, pool)
  if (!current) throw new EditConflictError('not_found', 'Newsletter not found.')
  return mutateWithLease(id, { ...input, action: 'archive', next: current.content, archive: true }, pool)
}

export async function discardNewsletter(id: string, userId: string, pool: Pool = getPool()) {
  return withNewsletterLock(
    id,
    async (client) => {
      const row = await loadRow(client, id)
      if (!row) throw new EditConflictError('not_found', 'Newsletter not found.')
      if (row.archived_at) throw new EditConflictError('archived', 'This newsletter is archived.')
      if (leaseActive(row) && row.lease_holder_user_id !== userId) {
        const holder = row.lease_holder_name ?? 'another editor'
        throw new EditConflictError('lease', `This draft is being edited by ${holder}.`)
      }
      const content = normalizeNewsletter(row.content)
      const updated = await client.query(
        `UPDATE newsletters
       SET archived_at = now(),
           save_version = save_version + 1,
           updated_by = $2::uuid,
           updated_at = now(),
           lease_token_hash = NULL,
           lease_holder_user_id = NULL,
           lease_expires_at = NULL
       WHERE id = $1 AND archived_at IS NULL`,
        [id, userId],
      )
      if (updated.rowCount !== 1) throw new EditConflictError('version', 'This draft could not be deleted.')
      await appendRevision(client, id, content, userId, 'archive')
      return { id, archived: true }
    },
    pool,
  )
}

export async function restoreArchivedNewsletter(id: string, userId: string, pool: Pool = getPool()) {
  return withNewsletterLock(
    id,
    async (client) => {
      const row = await loadRow(client, id)
      if (!row) throw new EditConflictError('not_found', 'Newsletter not found.')
      // A lost response can be retried without replacing content or disturbing a
      // lease acquired after the original restore.
      if (!row.archived_at) return { id, archived: false, alreadyRestored: true }
      await client.query(
        `UPDATE newsletters SET archived_at = NULL, save_version = save_version + 1,
       updated_by = $2, updated_at = now(), lease_token_hash = NULL,
       lease_holder_user_id = NULL, lease_expires_at = NULL WHERE id = $1`,
        [id, userId],
      )
      await appendRevision(client, id, normalizeNewsletter(row.content), userId, 'unarchive')
      return { id, archived: false, alreadyRestored: false }
    },
    pool,
  )
}

export async function purgeArchivedNewsletter(id: string, userId: string, pool: Pool = getPool()) {
  return withNewsletterLock(
    id,
    async (client) => {
      const row = await loadRow(client, id)
      if (!row) throw new EditConflictError('not_found', 'Newsletter not found.')
      if (!row.archived_at) {
        throw new EditConflictError('not_archived', 'Only archived drafts can be permanently deleted.')
      }
      // Revisions and retry/recovery records intentionally survive soft archive,
      // but must be removed in this transaction before their parent row.
      await client.query('DELETE FROM newsletter_recovery_drafts WHERE newsletter_id = $1', [id])
      await client.query('DELETE FROM newsletter_save_receipts WHERE newsletter_id = $1', [id])
      await client.query('DELETE FROM newsletter_revisions WHERE newsletter_id = $1', [id])
      await client.query('DELETE FROM newsletter_sent_marks WHERE newsletter_id = $1', [id])
      await client.query('DELETE FROM newsletter_progress_receipts WHERE newsletter_id = $1', [id])
      await client.query(
        'DELETE FROM newsletter_duplicate_receipts WHERE source_newsletter_id = $1 OR created_newsletter_id = $1',
        [id],
      )
      const deleted = await client.query('DELETE FROM newsletters WHERE id = $1 AND archived_at IS NOT NULL', [id])
      if (deleted.rowCount !== 1) throw new EditConflictError('version', 'This draft could not be deleted.')
      await client.query(
        `INSERT INTO newsletter_purge_events (id, newsletter_id, title, actor_id)
         VALUES ($1, $2, $3, $4)`,
        [crypto.randomUUID(), id, row.title, userId],
      )
      return { id, deleted: true }
    },
    pool,
  )
}

export async function duplicateNewsletter(
  id: string,
  userId: string,
  input: { requestId: string; issueTitle: string; issueDate?: string },
  pool: Pool = getPool(),
) {
  const requestId = input.requestId.trim()
  const issueTitle = input.issueTitle.trim()
  if (!/^[A-Za-z0-9-]{8,80}$/.test(requestId)) {
    throw new EditConflictError('fingerprint', 'A duplicate request id is required.')
  }
  if (!issueTitle || issueTitle.length > 200) {
    throw new EditConflictError('fingerprint', 'Enter an issue title or date for the new draft.')
  }
  const issueDate = (input.issueDate ?? '').trim().slice(0, 80)
  return withNewsletterLock(
    id,
    async (client) => {
      const existing = await client.query<{
        created_newsletter_id: string
        actor_id: string
      }>(
        `SELECT created_newsletter_id, actor_id
         FROM newsletter_duplicate_receipts
         WHERE source_newsletter_id = $1 AND client_request_id = $2`,
        [id, requestId],
      )
      const prior = existing.rows[0]
      if (prior) {
        if (prior.actor_id !== userId) {
          throw new EditConflictError('fingerprint', 'This duplicate request was already used.')
        }
        const copy = await client.query('SELECT id FROM newsletters WHERE id = $1', [prior.created_newsletter_id])
        if (!copy.rows[0]) {
          throw new EditConflictError('not_found', 'The duplicated draft from this request no longer exists.')
        }
        return {
          id: prior.created_newsletter_id,
          saveVersion: 1,
          idempotent: true,
        }
      }
      const row = await loadRow(client, id)
      if (!row) throw new EditConflictError('not_found', 'Newsletter not found.')
      const source = normalizeNewsletter(row.content)
      const content = normalizeNewsletter({
        ...source,
        issue: { title: issueTitle, date: issueDate },
      })
      const copyId = crypto.randomUUID()
      await client.query(
        `INSERT INTO newsletters (
           id, title, template, content, document_schema_version, save_version, created_by, updated_by,
           issue_date, progress, source_newsletter_id
         ) VALUES ($1, $2, $3, $4::jsonb, $5, 1, $6, $6, $7, 'draft', $8)`,
        [
          copyId,
          titleOf(content),
          content.template,
          JSON.stringify(content),
          DOCUMENT_SCHEMA_VERSION,
          userId,
          issueDateOf(content),
          id,
        ],
      )
      await appendRevision(client, copyId, content, userId, 'duplicate')
      await client.query(
        `INSERT INTO newsletter_duplicate_receipts (
           source_newsletter_id, client_request_id, actor_id, created_newsletter_id
         ) VALUES ($1, $2, $3, $4)`,
        [id, requestId, userId, copyId],
      )
      return { id: copyId, saveVersion: 1, idempotent: false, content }
    },
    pool,
  )
}

export async function setNewsletterProgress(
  id: string,
  input: {
    userId: string
    token: string
    expectedVersion: number
    progress: NewsletterProgress
  },
  pool: Pool = getPool(),
) {
  if (input.progress !== 'draft' && input.progress !== 'ready' && input.progress !== 'sent') {
    throw new EditConflictError('fingerprint', 'Choose Draft, Ready for Slate, or Sent via Slate.')
  }
  return withNewsletterLock(
    id,
    async (client) => {
      const row = await loadRow(client, id)
      if (!row) throw new EditConflictError('not_found', 'Newsletter not found.')
      assertHolder(row, input.userId, input.token)
      const prior = await client.query<{
        progress: NewsletterProgress
        committed_version: number
      }>(
        `SELECT progress, committed_version FROM newsletter_progress_receipts
         WHERE newsletter_id = $1 AND actor_id = $2 AND base_version = $3`,
        [id, input.userId, input.expectedVersion],
      )
      if (prior.rows[0]) {
        if (prior.rows[0].progress !== input.progress)
          throw new EditConflictError('fingerprint', 'Progress request was reused for a different update.')
        return {
          id,
          progress: input.progress,
          saveVersion: prior.rows[0].committed_version,
          currentVersion: row.save_version,
        }
      }
      if (row.save_version !== input.expectedVersion) {
        throw new EditConflictError('version', 'Stale newsletter version.')
      }
      const content = normalizeNewsletter(row.content)
      const updated = await client.query<{ save_version: number }>(
        `UPDATE newsletters
         SET progress = $2,
             save_version = save_version + 1,
             updated_by = $3,
             updated_at = now(),
             lease_expires_at = now() + ($4 || ' seconds')::interval
         WHERE id = $1 AND save_version = $5 AND lease_holder_user_id = $3
           AND lease_token_hash = $6 AND lease_expires_at > now() AND archived_at IS NULL
         RETURNING save_version`,
        [id, input.progress, input.userId, String(LEASE_SECONDS), input.expectedVersion, sha256(input.token)],
      )
      const saveVersion = updated.rows[0]?.save_version
      if (!saveVersion) throw new EditConflictError('version', 'Stale newsletter version.')
      if (input.progress === 'sent') {
        await client.query(
          `INSERT INTO newsletter_sent_marks (id, newsletter_id, save_version, snapshot, actor_id)
           VALUES ($1, $2, $3, $4::jsonb, $5)`,
          [crypto.randomUUID(), id, saveVersion, JSON.stringify(content), input.userId],
        )
      }
      await appendRevision(client, id, content, input.userId, input.progress === 'sent' ? 'mark_sent' : 'progress')
      await client.query(
        `INSERT INTO newsletter_progress_receipts (newsletter_id, actor_id, base_version, progress, committed_version)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, input.userId, input.expectedVersion, input.progress, saveVersion],
      )
      return {
        id,
        progress: input.progress,
        saveVersion,
        currentVersion: saveVersion,
      }
    },
    pool,
  )
}

export async function getSentVersion(id: string, markId?: string, pool: Pool = getPool()) {
  const result = await pool.query<{
    id: string
    save_version: number
    snapshot: NewsletterData
    marked_at: string
    display_name: string
    progress: NewsletterProgress
    current_content: NewsletterData
  }>(
    `SELECT m.id, m.save_version, m.snapshot, m.marked_at, u.display_name, n.progress, n.content AS current_content
     FROM newsletter_sent_marks m
     JOIN newsletters n ON n.id = m.newsletter_id
     JOIN users u ON u.id = m.actor_id
     WHERE m.newsletter_id = $1 AND ($2::uuid IS NULL OR m.id = $2::uuid)
     ORDER BY m.save_version DESC, m.marked_at DESC
     LIMIT 1`,
    [id, markId || null],
  )
  const row = result.rows[0]
  if (!row) return null
  const snapshot = normalizeNewsletter(row.snapshot)
  const current = normalizeNewsletter(row.current_content)
  return {
    id: row.id,
    saveVersion: row.save_version,
    markedAt: new Date(row.marked_at).toISOString(),
    actorName: row.display_name,
    progress: row.progress,
    changedSinceSent: documentFingerprint(snapshot) !== documentFingerprint(current),
    snapshot,
  }
}

export async function assertEditingAuthority(
  id: string,
  userId: string,
  token: string,
  expectedVersion: number,
  pool: Pool = getPool(),
) {
  return withNewsletterLock(
    id,
    async (client) => {
      const row = await loadRow(client, id)
      if (!row) throw new EditConflictError('not_found', 'Newsletter not found.')
      assertHolder(row, userId, token)
      if (row.save_version !== expectedVersion) throw new EditConflictError('version', 'Stale newsletter version.')
      return {
        content: normalizeNewsletter(row.content),
        saveVersion: row.save_version,
      }
    },
    pool,
  )
}

export async function listRevisions(id: string, pool: Pool = getPool(), limit = 200) {
  const result = await pool.query<{
    id: string
    revision_number: number
    actor_id: string
    display_name: string
    action: string
    created_at: string
  }>(
    `SELECT r.id, r.revision_number, r.actor_id, u.display_name, r.action, r.created_at
     FROM newsletter_revisions r
     JOIN users u ON u.id = r.actor_id
     WHERE r.newsletter_id = $1
     ORDER BY r.revision_number DESC
     LIMIT $2`,
    [id, limit],
  )
  return result.rows.map((row) => ({
    id: row.id,
    revisionNumber: row.revision_number,
    actorId: row.actor_id,
    actorName: row.display_name,
    action: row.action,
    createdAt: new Date(row.created_at).toISOString(),
  }))
}

export function canEdit(role: UserRole): boolean {
  return role === 'administrator' || role === 'editor'
}

export async function saveRecoveryDraft(
  id: string,
  userId: string,
  snapshot: unknown,
  baseVersion: number,
  pool: Pool = getPool(),
) {
  const content = normalizeNewsletter(snapshot, { requireShape: true })
  await pool.query(
    `INSERT INTO newsletter_recovery_drafts (newsletter_id, user_id, snapshot, base_version, updated_at)
     VALUES ($1, $2, $3::jsonb, $4, now())
     ON CONFLICT (newsletter_id, user_id) DO UPDATE
     SET snapshot = EXCLUDED.snapshot, base_version = EXCLUDED.base_version, updated_at = now()`,
    [id, userId, JSON.stringify(content), baseVersion],
  )
}

export async function getRecoveryDraft(id: string, userId: string, pool: Pool = getPool()) {
  const result = await pool.query<{
    snapshot: NewsletterData
    base_version: number
    save_version: number
  }>(
    `SELECT d.snapshot, d.base_version, n.save_version
     FROM newsletter_recovery_drafts d
     JOIN newsletters n ON n.id = d.newsletter_id
     WHERE d.newsletter_id = $1 AND d.user_id = $2`,
    [id, userId],
  )
  const row = result.rows[0]
  if (!row) return null
  return {
    snapshot: normalizeNewsletter(row.snapshot),
    baseVersion: row.base_version,
    currentVersion: row.save_version,
    newerServerSave: row.save_version !== row.base_version,
  }
}
