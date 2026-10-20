import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import EmbeddedPostgres from 'embedded-postgres'
import pg from 'pg'
import { migrateDatabase } from './migrate.mjs'
import accounts from '../tests/browser/accounts.json' with { type: 'json' }

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const databaseDir = await mkdtemp(join(tmpdir(), 'slate-editor-browser-'))
const database = new EmbeddedPostgres({
  databaseDir,
  port: 55433,
  user: 'postgres',
  password: 'password',
  persistent: false,
  onLog: () => undefined,
  onError: () => undefined,
})

await database.initialise()
await database.start()
await database.createDatabase('slate_editor_browser')
const databaseUrl = 'postgresql://postgres:password@127.0.0.1:55433/slate_editor_browser'
await migrateDatabase(databaseUrl)

const client = new pg.Client({ connectionString: databaseUrl })
await client.connect()
for (const account of [accounts.editorA, accounts.editorB]) {
  await client.query(
    `INSERT INTO users (id, display_name, email, role) VALUES ($1, $2, $3, 'editor')`,
    [account.id, account.name, `${account.subject}@example.edu`]
  )
  await client.query(
    `INSERT INTO user_identities (id, user_id, issuer, subject) VALUES ($1, $2, $3, $4)`,
    [crypto.randomUUID(), account.id, account.issuer, account.subject]
  )
}
await client.end()

await writeFile(
  join(root, 'tests', 'browser', '.runtime.json'),
  JSON.stringify({ databaseUrl, editorA: accounts.editorA.id, editorB: accounts.editorB.id })
)

const nextBin = createRequire(import.meta.url).resolve('next/dist/bin/next')
const child = spawn(process.execPath, [nextBin, 'dev', '--hostname', '127.0.0.1', '--port', '3100'], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'development',
    DATABASE_URL: databaseUrl,
    AUTH_MODE: 'development',
    PUBLIC_ORIGIN: 'http://127.0.0.1:3100',
    SESSION_SECRET: 'browser-test-session-secret-32chars',
    NEXT_PUBLIC_LEASE_RENEW_MS: '1000',
    PORT: '3100',
  },
})

async function shutdown() {
  child.kill()
  await database.stop()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())
child.on('exit', (code) => {
  void database.stop().finally(() => process.exit(code ?? 1))
})
