import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/browser',
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
  },
})
