import pg from 'pg'
import { databaseUrl } from '@/lib/runtime-config'

const globalForPg = globalThis as unknown as { __newsletterPool?: pg.Pool }

export function getPool(): pg.Pool {
  if (!globalForPg.__newsletterPool) {
    const max = Number(process.env.DATABASE_POOL_MAX ?? 10)
    globalForPg.__newsletterPool = new pg.Pool({
      connectionString: databaseUrl(),
      max: Number.isFinite(max) && max > 0 ? max : 10,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
    })
  }
  return globalForPg.__newsletterPool
}

export async function closePool(): Promise<void> {
  if (!globalForPg.__newsletterPool) return
  const pool = globalForPg.__newsletterPool
  globalForPg.__newsletterPool = undefined
  await pool.end()
}
