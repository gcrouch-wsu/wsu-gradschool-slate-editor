import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { afterEach, expect, test, vi } from 'vitest'

const config = createRequire(import.meta.url)('../next.config.js')
const canonical = 'https://wsu-gradschool-slate-editor.vercel.app'
const deploymentHost = 'wsu-gradschool-slate-editor-example-greg-crouchs-projects.vercel.app'

afterEach(() => vi.unstubAllEnvs())

test('production deployment redirects preserve paths on the stable origin without matching that origin', async () => {
  vi.stubEnv('VERCEL_ENV', 'production')
  vi.stubEnv('VERCEL_URL', deploymentHost)
  vi.stubEnv('PUBLIC_ORIGIN', canonical)
  const redirects = await config.redirects()
  expect(redirects).toHaveLength(1)
  expect(redirects[0]).toMatchObject({ source: '/:path*', destination: `${canonical}/:path*`, permanent: false })
  const matcher = new RegExp(`^${redirects[0].has[0].value}$`)
  expect(matcher.test(deploymentHost)).toBe(true)
  expect(matcher.test(new URL(canonical).host)).toBe(false)
  expect(matcher.test(deploymentHost.replace('.vercel.app', 'XvercelXapp'))).toBe(false)
})

test('preview deployments retain their own URLs', async () => {
  vi.stubEnv('VERCEL_ENV', 'preview')
  vi.stubEnv('VERCEL_URL', deploymentHost)
  vi.stubEnv('PUBLIC_ORIGIN', canonical)
  expect(await config.redirects()).toEqual([])
})

test('a deployment already using the canonical host cannot redirect to itself', async () => {
  vi.stubEnv('VERCEL_ENV', 'production')
  vi.stubEnv('VERCEL_URL', new URL(canonical).host)
  vi.stubEnv('PUBLIC_ORIGIN', canonical)
  expect(await config.redirects()).toEqual([])
})

test('production builds fail before building when database migrations are not configured', () => {
  const result = spawnSync(process.execPath, ['scripts/vercel-build.mjs'], {
    env: { ...process.env, VERCEL_ENV: 'production', DATABASE_URL: '' },
    encoding: 'utf8',
    timeout: 10000,
  })
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('DATABASE_URL is required')
  expect(result.stdout).not.toContain('Creating an optimized production build')
})
