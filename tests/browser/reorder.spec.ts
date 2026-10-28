import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type BrowserContext, type ConsoleMessage, type Page } from '@playwright/test'

const accounts = JSON.parse(readFileSync(join(process.cwd(), 'tests/browser/accounts.json'), 'utf8')) as {
  editorA: { id: string }
}

async function signIn(context: BrowserContext) {
  const response = await context.request.post('/api/auth/development/session', {
    data: { userId: accounts.editorA.id },
    headers: { Origin: 'http://127.0.0.1:3100' },
  })
  expect(response.status()).toBe(200)
}

async function create(context: BrowserContext, template: string) {
  const response = await context.request.post('/api/newsletters', {
    data: { template },
    headers: { Origin: 'http://127.0.0.1:3100' },
  })
  expect(response.status()).toBe(201)
  return (await response.json()).id as string
}

function watchHydration(page: Page) {
  const messages: string[] = []
  const record = (message: ConsoleMessage) => {
    const text = message.text()
    if (/hydration|didn.?t match|server rendered HTML/i.test(text)) messages.push(text)
  }
  page.on('console', record)
  page.on('pageerror', (error) => {
    if (/hydration|did not match/i.test(error.message)) messages.push(error.message)
  })
  return messages
}

test('reorder controls move sections and cards, stop at the ends, and stay usable on a phone', async ({
  page,
  context,
}) => {
  const hydration = watchHydration(page)
  await signIn(context)
  const id = await create(context, 'ff')
  await page.goto(`/newsletters/${id}`)
  await expect(page.getByTestId('save-status')).toHaveText('Saved')
  await page.reload()
  await expect(page.getByTestId('save-status')).toHaveText('View only')
  expect(hydration).toEqual([])
  await page.getByRole('button', { name: 'Take over editing', exact: true }).click()
  await expect(page.getByTestId('save-status')).toHaveText('Saved')

  const sections = page.locator('#panel-sections')
  const headings = sections.getByRole('heading', { level: 4 })
  await expect(headings.first()).toHaveText('Deadlines and Important Information')
  await expect(page.getByRole('button', { name: 'Move Deadlines and Important Information up', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Move Deadlines and Important Information down', exact: true }).click()
  await expect(headings.first()).toHaveText('Upcoming Events')
  await expect(page.getByTestId('save-status')).toHaveText('Saved')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(headings.first()).toHaveText('Deadlines and Important Information')
  await expect(page.getByRole('button', { name: 'Remove Deadlines and Important Information', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit Sample Announcement', exact: true })).toBeVisible()

  const resources = sections.locator('div.border-dashed').filter({
    has: page.getByRole('heading', { level: 4, name: 'Resources', exact: true }),
  })
  const cardUp = resources.getByRole('button', { name: /^Move (?!Resources ).+ up$/ })
  await expect(cardUp.first()).toBeDisabled()
  const movedCard = await cardUp.nth(1).getAttribute('aria-label')
  expect(movedCard).toBeTruthy()
  await cardUp.nth(1).click()
  await expect(cardUp.first()).toHaveAttribute('aria-label', movedCard ?? '')
  await expect(cardUp.first()).toBeDisabled()

  await page.setViewportSize({ width: 390, height: 844 })
  const moveUp = page.getByRole('button', { name: 'Move Deadlines and Important Information up', exact: true })
  await expect(moveUp).toBeVisible()
  const box = await moveUp.boundingBox()
  expect(box?.height).toBeGreaterThanOrEqual(44)
  expect(box?.width).toBeGreaterThanOrEqual(44)
})

test('closure reorder stops at the ends and can move a new closure up', async ({ page, context }) => {
  await signIn(context)
  const id = await create(context, 'briefing')
  await page.goto(`/newsletters/${id}`)
  await expect(page.getByTestId('save-status')).toHaveText('Saved')
  await expect(page.getByRole('button', { name: 'Move Jan 1 up', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Move Jan 1 down', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Edit Jan 1', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Remove Jan 1', exact: true })).toBeVisible()
  // Cancelling a new closure leaves the newsletter unchanged.
  await page.getByRole('button', { name: 'Add Closure', exact: true }).click()
  await page.getByRole('dialog', { name: 'New closure', exact: true }).getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Move untitled closure up', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Add Closure', exact: true }).click()
  const closure = page.getByRole('dialog', { name: 'New closure', exact: true })
  await closure.getByLabel('Date *', { exact: true }).fill('Feb 2')
  await closure.getByRole('button', { name: 'Save closure', exact: true }).click()
  await page.getByRole('button', { name: 'Move Feb 2 up', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Move Feb 2 up', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Move Jan 1 down', exact: true })).toBeDisabled()
  // Undo restores the earlier order, then removes the saved closure.
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Move Jan 1 up', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Move Feb 2 up', exact: true })).toHaveCount(0)
})
