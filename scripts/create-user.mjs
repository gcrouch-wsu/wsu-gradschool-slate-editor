import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import pg from 'pg'
import { hashPassword } from './passwords.mjs'

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    password: { type: 'string' },
    role: { type: 'string', default: 'editor' },
  },
})

if (!values.email || !values.name || !values.password || (values.role !== 'editor' && values.role !== 'administrator')) {
  console.error('Usage: node scripts/create-user.mjs --email address --name "Display Name" --password "at least 12 characters" [--role editor|administrator]')
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
  const email = values.email.trim().toLowerCase()
  const passwordHash = await hashPassword(values.password)
  await client.query(
    `INSERT INTO users (id, display_name, email, role, password_hash) VALUES ($1, $2, $3, $4, $5)`,
    [userId, values.name.trim(), email, values.role, passwordHash]
  )
  console.log(JSON.stringify({ event: 'local_user_created', userId, role: values.role }))
} catch (error) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : ''
  console.error(code === '23505' ? 'An account with that email already exists.' : error instanceof Error ? error.message : 'Unable to create the user.')
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}
