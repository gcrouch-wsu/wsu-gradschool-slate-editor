/**
 * Apply ordered SQL migrations.
 * Missing DATABASE_URL, a failed connection, or a failed migration exits non-zero.
 * Usage: node scripts/migrate.mjs
 */
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import pg from 'pg'

const ADVISORY_LOCK_KEY = 814202601

function migrationDirectory() {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')
}

export async function migrateDatabase(connectionString) {
  const url = (connectionString ?? '').trim()
  if (!url) {
    throw new Error('DATABASE_URL is required. Refusing to skip migrations.')
  }

  const migrationDir = migrationDirectory()
  const files = (await readdir(migrationDir)).filter((name) => name.endsWith('.sql')).sort()
  const pool = new pg.Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 15000 })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock($1)', [ADVISORY_LOCK_KEY])
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        sql_sha256 TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)
    const applied = await client.query('SELECT id, sql_sha256 FROM schema_migrations')
    const appliedMap = new Map(applied.rows.map((row) => [row.id, row.sql_sha256]))
    for (const file of files) {
      const sql = await readFile(join(migrationDir, file), 'utf8')
      const hash = createHash('sha256').update(sql).digest('hex')
      const previous = appliedMap.get(file)
      if (previous && previous !== hash) {
        throw new Error(`Migration ${file} changed after it was applied. Add a new migration instead.`)
      }
      if (previous) continue
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (id, sql_sha256) VALUES ($1, $2)', [file, hash])
      console.log(`applied ${file}`)
    }
    await client.query('COMMIT')
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // The connection may already be unusable.
    }
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

async function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  try {
    process.loadEnvFile?.(join(root, '.env'))
  } catch {
    // DATABASE_URL may already be set.
  }
  try {
    await migrateDatabase(process.env.DATABASE_URL)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(pathToFileURL(process.argv[1]))
if (invokedDirectly) {
  main()
}
