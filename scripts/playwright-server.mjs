import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import EmbeddedPostgres from 'embedded-postgres'
import pg from 'pg'
import { migrateDatabase } from './migrate.mjs'
import { removeDataDir, stopPostgres } from './stop-postgres.mjs'
import accounts from '../tests/browser/accounts.json' with { type: 'json' }

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
// One fixed directory, wiped on start: on Windows Playwright force-kills this server, so a run cannot clean up after itself.
// The fixed port below already limits this to one run at a time.
const databaseDir = join(tmpdir(), 'slate-editor-browser-db')
await rm(databaseDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
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
for (const account of [accounts.editorA, accounts.editorB, accounts.administrator]) {
  await client.query(
    `INSERT INTO users (id, display_name, email, role) VALUES ($1, $2, $3, $4)`,
    [account.id, account.name, `${account.subject}@example.edu`, account === accounts.administrator ? 'administrator' : 'editor']
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
    SLATE_BROWSER_TEST: '1',
    DATABASE_URL: databaseUrl,
    AUTH_MODE: 'development',
    PUBLIC_ORIGIN: 'http://127.0.0.1:3100',
    SESSION_SECRET: 'browser-test-session-secret-32chars',
    NEXT_PUBLIC_LEASE_RENEW_MS: '1000',
    PORT: '3100',
  },
})

function stopNext() {
  if (child.exitCode !== null || child.signalCode !== null) return
  // next dev starts its own workers; on Windows only taskkill /T reaches them.
  if (process.platform === 'win32' && child.pid) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    child.kill('SIGTERM')
  }
}

let stopping
function shutdown(code) {
  stopping ??= (async () => {
    stopNext()
    await stopPostgres(database)
    await removeDataDir(databaseDir)
    process.exit(code)
  })()
  return stopping
}

process.on('SIGINT', () => void shutdown(0))
process.on('SIGTERM', () => void shutdown(0))
child.on('exit', (code) => void shutdown(code ?? 1))
// Last resort if this process is ended some other way: never leave Postgres running.
process.on('exit', () => {
  const pid = database.process?.pid
  if (pid) {
    try {
      process.kill(pid)
    } catch {}
  }
})
