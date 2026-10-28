import os from 'node:os'
import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/browser',
  // Keep Playwright output outside the project so the dev server does not rebuild when results are written.
  outputDir: path.join(os.tmpdir(), 'slate-editor-playwright'),
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'node scripts/playwright-server.mjs',
    url: 'http://127.0.0.1:3100/api/health',
    timeout: 180000,
    reuseExistingServer: false,
    // Let the server stop Next.js and Postgres itself before Playwright force-kills it (ignored on Windows).
    gracefulShutdown: { signal: 'SIGTERM', timeout: 20000 },
  },
})
