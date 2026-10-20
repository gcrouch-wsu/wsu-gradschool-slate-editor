import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import pg from 'pg'

const { values } = parseArgs({
  options: {
    issuer: { type: 'string' },
    subject: { type: 'string' },
    email: { type: 'string' },
    name: { type: 'string' },
  },
})

if (!values.issuer || !values.subject || !values.name) {
  console.error('Usage: node scripts/create-admin.mjs --issuer URL --subject ID --name "Display Name" [--email address]')
  process.exit(1)
}

try {
  process.loadEnvFile?.(join(dirname(fileURLToPath(import.meta.url)), '..', '.env'))
} catch {
  // DATABASE_URL may already be set.
}

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) {
  console.error('DATABASE_URL is required.')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 })
const client = await pool.connect()
try {
  const userId = randomUUID()
  await client.query('BEGIN')
  await client.query(
    `INSERT INTO users (id, display_name, email, role) VALUES ($1, $2, $3, 'administrator')`,
    [userId, values.name, values.email ?? null]
  )
  await client.query(
    `INSERT INTO user_identities (id, user_id, issuer, subject) VALUES ($1, $2, $3, $4)`,
    [randomUUID(), userId, values.issuer.replace(/\/+$/, ''), values.subject]
  )
  await client.query('COMMIT')
  console.log(JSON.stringify({ event: 'administrator_created', userId }))
} catch (error) {
  try {
    await client.query('ROLLBACK')
  } catch {
    // Ignore a rollback after a failed connection.
  }
  console.error(error instanceof Error ? error.message : 'Unable to create the administrator.')
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}
