import type { Pool } from 'pg'
import { getPool } from '@/lib/db/pool'
import { AiLimitError } from '@/lib/ai/errors'

export const AI_HOURLY_LIMIT = 30

export async function reserveAiRequest(userId: string, pool: Pool = getPool()) {
  const client = await pool.connect()
  const requestToken = crypto.randomUUID()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(8143, hashtext($1))', [userId])
    await client.query(`DELETE FROM ai_inflight WHERE actor_id = $1 AND started_at < now() - interval '45 seconds'`, [
      userId,
    ])
    const inserted = await client.query(
      'INSERT INTO ai_inflight (actor_id, request_token) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING actor_id',
      [userId, requestToken],
    )
    if (inserted.rowCount !== 1) {
      throw new AiLimitError('A suggestion is already being prepared. Wait for it to finish.')
    }
    const count = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM ai_usage_events
       WHERE actor_id = $1 AND created_at > now() - interval '1 hour'`,
      [userId],
    )
    if (Number(count.rows[0].count) >= AI_HOURLY_LIMIT) {
      await client.query('DELETE FROM ai_inflight WHERE actor_id = $1 AND request_token = $2', [userId, requestToken])
      throw new AiLimitError('The shared AI limit for this hour has been reached. Try again later.')
    }
    await client.query('INSERT INTO ai_usage_events (id, actor_id) VALUES ($1, $2)', [crypto.randomUUID(), userId])
    await client.query('COMMIT')
    return requestToken
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // The connection may already be unusable.
    }
    throw error
  } finally {
    client.release()
  }
}

export async function releaseAiRequest(userId: string, requestToken: string, pool: Pool = getPool()) {
  await pool.query('DELETE FROM ai_inflight WHERE actor_id = $1 AND request_token = $2', [userId, requestToken])
}
