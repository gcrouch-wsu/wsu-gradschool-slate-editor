import type { Pool } from 'pg'
import { getPool } from '@/lib/db/pool'
import { randomToken, sha256 } from '@/lib/auth/crypto'
import { hashPassword, passwordProblems, verifyPassword } from '@/lib/auth/passwords'
import { sessionTtlSeconds } from '@/lib/runtime-config'

export const SESSION_COOKIE = 'wsu_slate_session'
export const OKTA_STATE_COOKIE = 'wsu_slate_okta_state'
export const OKTA_ID_TOKEN_COOKIE = 'wsu_slate_okta_id_token'

export type UserRole = 'administrator' | 'editor'

export interface Principal {
  sessionId: string
  userId: string
  displayName: string
  email: string | null
  role: UserRole
  authorizationVersion: number
}

interface SessionRow {
  session_id: string
  user_id: string
  display_name: string
  email: string | null
  role: UserRole
  authorization_version: number
}

export async function createSession(userId: string, pool: Pool = getPool()): Promise<{ token: string; principal: Principal }> {
  const token = randomToken()
  const sessionId = crypto.randomUUID()
  const user = await pool.query<{
    id: string
    display_name: string
    email: string | null
    role: UserRole
    authorization_version: number
    active: boolean
  }>('SELECT id, display_name, email, role, authorization_version, active FROM users WHERE id = $1', [userId])
  const row = user.rows[0]
  if (!row || !row.active) {
    throw new Error('Active application account not found.')
  }
  const expiresAt = new Date(Date.now() + sessionTtlSeconds() * 1000)
  await pool.query(
    `INSERT INTO sessions (id, token_hash, user_id, authorization_version, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [sessionId, sha256(token), row.id, row.authorization_version, expiresAt.toISOString()]
  )
  return {
    token,
    principal: {
      sessionId,
      userId: row.id,
      displayName: row.display_name,
      email: row.email,
      role: row.role,
      authorizationVersion: row.authorization_version,
    },
  }
}

export async function principalFromToken(token: string, pool: Pool = getPool()): Promise<Principal | null> {
  if (!token) return null
  const result = await pool.query<SessionRow>(
    `SELECT s.id AS session_id, u.id AS user_id, u.display_name, u.email, u.role, u.authorization_version
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > now()
       AND u.active = TRUE
       AND u.authorization_version = s.authorization_version`,
    [sha256(token)]
  )
  const row = result.rows[0]
  if (!row) return null
  return {
    sessionId: row.session_id,
    userId: row.user_id,
    displayName: row.display_name,
    email: row.email,
    role: row.role,
    authorizationVersion: row.authorization_version,
  }
}

export async function revokeSession(token: string, pool: Pool = getPool()): Promise<void> {
  if (!token) return
  await pool.query('UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [
    sha256(token),
  ])
}

export async function findUserByIdentity(
  issuer: string,
  subject: string,
  pool: Pool = getPool()
): Promise<{ id: string; active: boolean; role: UserRole } | null> {
  const result = await pool.query<{ id: string; active: boolean; role: UserRole }>(
    `SELECT u.id, u.active, u.role
     FROM user_identities i
     JOIN users u ON u.id = i.user_id
     WHERE i.issuer = $1 AND i.subject = $2`,
    [issuer, subject]
  )
  return result.rows[0] ?? null
}

export async function createProvisionedUser(
  input: { displayName: string; email: string | null; role: UserRole; issuer: string; subject: string },
  pool: Pool = getPool()
): Promise<string> {
  const client = await pool.connect()
  const userId = crypto.randomUUID()
  try {
    await client.query('BEGIN')
    await client.query(
      `INSERT INTO users (id, display_name, email, role) VALUES ($1, $2, $3, $4)`,
      [userId, input.displayName, input.email, input.role]
    )
    await client.query(
      `INSERT INTO user_identities (id, user_id, issuer, subject) VALUES ($1, $2, $3, $4)`,
      [crypto.randomUUID(), userId, input.issuer, input.subject]
    )
    await client.query('COMMIT')
    return userId
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function linkIdentity(
  input: { userId: string; issuer: string; subject: string },
  pool: Pool = getPool()
): Promise<void> {
  await pool.query(
    `INSERT INTO user_identities (id, user_id, issuer, subject) VALUES ($1, $2, $3, $4)`,
    [crypto.randomUUID(), input.userId, input.issuer, input.subject]
  )
}

export async function updateUserAccess(
  input: { userId: string; role?: UserRole; active?: boolean; email?: string | null; displayName?: string },
  pool: Pool = getPool()
): Promise<void> {
  await pool.query(
    `UPDATE users
     SET role = COALESCE($2, role),
         active = COALESCE($3, active),
         email = COALESCE($4, email),
         display_name = COALESCE($5, display_name),
         authorization_version = authorization_version + 1,
         updated_at = now()
     WHERE id = $1`,
    [input.userId, input.role ?? null, input.active ?? null, input.email ?? null, input.displayName ?? null]
  )
}

export class AccountConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AccountConflictError'
  }
}

export async function createLocalUser(
  input: { displayName: string; email: string; password: string; role: UserRole },
  pool: Pool = getPool()
): Promise<string> {
  const problem = passwordProblems(input.password)
  if (problem) throw new Error(problem)
  const email = input.email.trim().toLowerCase()
  if (!email.includes('@')) throw new Error('A valid email is required.')
  const passwordHash = await hashPassword(input.password)
  const userId = crypto.randomUUID()
  try {
    await pool.query(
      `INSERT INTO users (id, display_name, email, role, password_hash) VALUES ($1, $2, $3, $4, $5)`,
      [userId, input.displayName.trim(), email, input.role, passwordHash]
    )
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      throw new AccountConflictError('An account with that email already exists.')
    }
    throw error
  }
  return userId
}

export async function authenticateLocalUser(email: string, password: string, pool: Pool = getPool()): Promise<string | null> {
  const result = await pool.query<{ id: string; password_hash: string; active: boolean }>(
    `SELECT id, password_hash, active
     FROM users
     WHERE lower(email) = lower($1) AND password_hash IS NOT NULL`,
    [email.trim()]
  )
  const row = result.rows[0]
  if (!row) {
    await verifyPassword(password, `scrypt:${Buffer.alloc(16, 1).toString('base64url')}:${Buffer.alloc(32, 2).toString('base64url')}`)
    return null
  }
  const matches = await verifyPassword(password, row.password_hash)
  if (!matches || !row.active) return null
  return row.id
}
