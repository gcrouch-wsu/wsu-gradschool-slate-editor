import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const accounts = JSON.parse(readFileSync(join(process.cwd(), 'tests/browser/accounts.json'), 'utf8'))
async function signIn(context: BrowserContext, userId = accounts.editorA.id) {
  const response = await context.request.post('/api/auth/development/session', {
    data: { userId },
    headers: { Origin: 'http://127.0.0.1:3100' },
  })
  expect(response.status()).toBe(200)
}
async function create(context: BrowserContext, template = 'ff') {
  const response = await context.request.post('/api/newsletters', {
    data: { template },
    headers: { Origin: 'http://127.0.0.1:3100' },
  })
  expect(response.status()).toBe(201)
  return (await response.json()).id as string
}
const row = (page: Page, id: string) => page.locator(`li:has(a[href="/newsletters/${id}"])`)

test('library loading, retry, create/import failures, and editor account presentation', async ({ page, context }) => {
  await signIn(context)
  let unavailable = true
  let unblock: () => void = () => undefined
  const gate = new Promise<void>((resolve) => {
    unblock = resolve
  })
  await page.route('**/api/newsletters?*', async (route) => {
    if (!unavailable) return route.continue()
    await gate
    await route.fulfill({ status: 503, json: { error: 'Test outage' } })
  })
  await page.goto('/newsletters')
  await expect(page.getByRole('status').filter({ hasText: 'Loading newsletters' })).toBeVisible()
  unblock()
  await expect(page.getByRole('main').getByRole('alert')).toContainText('unavailable')
  unavailable = false
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Accounts', exact: true })).toHaveCount(0)
  await page.route('**/api/newsletters', (route) =>
    route.request().method() === 'POST' ? route.abort('failed') : route.continue(),
  )
  await page.getByRole('button', { name: 'New Friday Focus', exact: true }).click()
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Connection failed')
  await expect(page.getByRole('button', { name: 'New Briefing', exact: true })).toBeEnabled()
  await expect(page.getByLabel('Import HTML', { exact: true })).toBeEnabled()
  await page.getByLabel('Import HTML', { exact: true }).setInputFiles({
    name: 'invalid.html',
    mimeType: 'text/html',
    buffer: Buffer.from('<p>Not an editor export</p>'),
  })
  await expect(page.getByRole('main').getByRole('alert')).toContainText('could not be imported')
  await expect(page.getByRole('button', { name: 'New Friday Focus', exact: true })).toBeEnabled()
})

test('delete waits safely, refuses another holder, and supports Undo and archived recovery', async ({
  page,
  context,
  browser,
}) => {
  await signIn(context)
  const id = await create(context)
  const other = await browser.newContext()
  await signIn(other, accounts.editorB.id)
  const acquired = await other.request.post(`/api/newsletters/${id}/lease`, {
    data: { action: 'acquire' },
    headers: { Origin: 'http://127.0.0.1:3100' },
  })
  const { token } = await acquired.json()
  await page.goto('/newsletters')
  await row(page, id).getByRole('button', { name: 'Delete', exact: true }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('Archived drafts')
  await expect(dialog.getByRole('button', { name: 'Keep draft', exact: true })).toBeFocused()
  let unblock: () => void = () => undefined
  const gate = new Promise<void>((resolve) => {
    unblock = resolve
  })
  await page.route(`**/api/newsletters/${id}`, async (route) => {
    if (route.request().method() === 'DELETE') await gate
    await route.continue()
  })
  await dialog.getByRole('button', { name: 'Delete draft', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Keep draft', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  unblock()
  await expect(row(page, id).getByRole('alert')).toContainText('Editor B')
  await expect(row(page, id)).toBeVisible()
  await page.unroute(`**/api/newsletters/${id}`)
  await other.request.post(`/api/newsletters/${id}/lease`, {
    data: { action: 'release', token },
    headers: { Origin: 'http://127.0.0.1:3100' },
  })
  await row(page, id).getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('button', { name: 'Delete draft', exact: true }).click()
  await expect(row(page, id)).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo delete', exact: true }).click()
  await expect(row(page, id)).toBeVisible()
  await row(page, id).getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('button', { name: 'Delete draft', exact: true }).click()
  await expect(row(page, id)).toHaveCount(0)
  await page.getByRole('button', { name: 'Archived drafts', exact: true }).click()
  await expect(row(page, id)).toBeVisible()
  await row(page, id).getByRole('link', { name: 'Open', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'This draft was deleted.', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Restore draft', exact: true }).click()
  await expect(page.getByTestId('save-status')).toHaveText('Saved')
  await page.getByRole('button', { name: 'Save and finish editing', exact: true }).click()
  await expect(page.getByTestId('save-status')).toHaveText('View only')
  await other.close()
})

test('draft errors are recoverable, Undo/Redo save, and leaving flushes and releases on a phone', async ({
  page,
  context,
}) => {
  await signIn(context)
  const id = await create(context)
  await page.route(`**/api/newsletters/${id}`, (route) => route.abort('failed'))
  await page.goto(`/newsletters/${id}`)
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Connection failed')
  await expect(page.getByRole('link', { name: 'All newsletters', exact: true })).toBeVisible()
  await page.unroute(`**/api/newsletters/${id}`)
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.getByTestId('save-status')).toHaveText('Saved')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Masthead', exact: true }).click()
  const title = page.getByLabel('Newsletter Title', { exact: true })
  await title.fill('Accessible shared newsletter')
  const savedTitle = async () =>
    (await (await context.request.get(`/api/newsletters/${id}`)).json()).content.masthead.title
  await expect.poll(savedTitle).toBe('Accessible shared newsletter')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(title).toHaveValue('Friday Focus Newsletter')
  await expect.poll(savedTitle).toBe('Friday Focus Newsletter')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(title).toHaveValue('Accessible shared newsletter')
  await expect.poll(savedTitle).toBe('Accessible shared newsletter')
  await expect(page.getByRole('button', { name: 'Save and finish editing', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  expect((await title.boundingBox())!.width).toBeGreaterThan(240)
  await page.getByRole('button', { name: 'Preview', exact: true }).click()
  await expect(page.locator('iframe[title="Newsletter Preview"]')).toBeVisible()
  await page.getByRole('button', { name: 'Edit draft', exact: true }).click()
  await title.fill('Saved before returning to the library')
  await page.getByRole('link', { name: 'All newsletters', exact: true }).click()
  await expect(page).toHaveURL(/\/newsletters$/)
  await expect(row(page, id)).toContainText('Saved before returning to the library')
  const body = await (await context.request.get(`/api/newsletters/${id}`)).json()
  expect(body.summary.leaseHeld).toBe(false)
})

test('HTML export is reachable and all three exported templates pass automated WCAG checks', async ({
  page,
  context,
  browser,
}) => {
  await signIn(context)
  for (const template of ['ff', 'briefing', 'letter']) {
    const id = await create(context, template)
    const exported = await context.request.post(`/api/newsletters/${id}/export`, {
      data: {},
      headers: { Origin: 'http://127.0.0.1:3100' },
    })
    expect(exported.status(), await exported.text()).toBe(200)
    const html = await exported.text()
    expect(html).toContain('href="browser"')
    expect(html).toContain('WSU_NEWSLETTER_DATA_B64')
    const emailContext = await browser.newContext()
    const email = await emailContext.newPage()
    await email.route('https://**', (route) => route.abort())
    await email.setContent(html)
    const results = await new AxeBuilder({ page: email })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(results.violations).toEqual([])
    await emailContext.close()
  }
  const id = await create(context, 'letter')
  await page.goto(`/newsletters/${id}`)
  await expect(page.getByTestId('save-status')).toHaveText('Saved')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export HTML', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/Slate_Campaign.*\.html$/)
  await expect(page.getByRole('status').filter({ hasText: 'HTML exported' })).toBeVisible()
})
