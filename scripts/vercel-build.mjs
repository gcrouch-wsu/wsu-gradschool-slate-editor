import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { migrateDatabase } from './migrate.mjs'

try {
  // Run once per production build, before the new application can receive traffic.
  if (process.env.VERCEL_ENV === 'production') await migrateDatabase(process.env.DATABASE_URL)
  const nextBin = createRequire(import.meta.url).resolve('next/dist/bin/next')
  const build = spawnSync(process.execPath, [nextBin, 'build'], { stdio: 'inherit' })
  if (build.error) throw build.error
  process.exitCode = build.status ?? 1
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
