import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'

const accounts = JSON.parse(readFileSync(join(process.cwd(), 'tests', 'browser', 'accounts.json'), 'utf8')) as {
  editorA: { id: string }
  editorB: { id: string }
}

async function signIn(context: BrowserContext, userId: string) {
  const response = await context.request.post('/api/auth/development/session', {
    data: { userId },
    headers: { Origin: 'http://127.0.0.1:3100' },
  })
  expect(response.status()).toBe(200)
}

function shownTitle(page: Page) {
  return page.getByRole('heading', { level: 1 })
}

async function fillTitle(page: Page, value: string) {
  if (!(await page.locator('#issue-title').isVisible())) {
    await page.getByRole('button', { name: 'Masthead' }).click()
  }
  await page.locator('#issue-title').fill(value)
}

async function createNewsletter(page: Page) {
  await page.goto('/newsletters')
  await page.getByRole('button', { name: 'New Friday Focus' }).click()
  await page.getByRole('dialog', { name: 'New Friday Focus' }).getByRole('button', { name: 'Create draft' }).click()
  await page.waitForURL(/\/newsletters\/[0-9a-f-]+$/)
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 15000 })
  return page.url()
}

test('two tabs, takeover, recovery, expiry, and session revocation', async ({ browser }) => {
  const runtime = JSON.parse(readFileSync(join(process.cwd(), 'tests', 'browser', '.runtime.json'), 'utf8')) as {
    databaseUrl: string
  }
  const ada = await browser.newContext()
  const grace = await browser.newContext()
  await signIn(ada, accounts.editorA.id)
  await signIn(grace, accounts.editorB.id)
  const adaPage = await ada.newPage()
  const newsletterUrl = await createNewsletter(adaPage)
  const newsletterId = newsletterUrl.split('/').pop()

  const secondTab = await ada.newPage()
  await secondTab.goto(newsletterUrl)
  await expect(secondTab.getByRole('button', { name: 'Take over editing' })).toBeVisible()
  await expect(secondTab.getByRole('button', { name: 'Save and finish editing' })).toHaveCount(0)
  await expect(adaPage.getByRole('button', { name: 'Save and finish editing' })).toBeVisible()
  await secondTab.close()

  await fillTitle(adaPage, 'Handoff title')
  await expect(adaPage.getByTestId('save-status')).toHaveText('Saved')
  const current = await adaPage.request.get(`/api/newsletters/${newsletterId}`)
  const body = (await current.json()) as {
    content: { issue: Record<string, unknown>; template: string }
    summary: { saveVersion: number }
  }

  await adaPage.evaluate(
    ({ key, snapshot }) => localStorage.setItem(key, JSON.stringify({ snapshot, baseVersion: 1 })),
    {
      key: `wsu_newsletter_backup:${accounts.editorA.id}:${newsletterId}`,
      snapshot: { ...body.content, issue: { ...body.content.issue, title: 'Older draft' } },
    },
  )
  await adaPage.reload()
  await expect(adaPage.getByText('A newer server save exists. The local recovery draft was not applied.')).toBeVisible()
  await expect(shownTitle(adaPage)).toHaveText('Handoff title')

  await adaPage.evaluate(
    ({ key, snapshot, baseVersion }) => localStorage.setItem(key, JSON.stringify({ snapshot, baseVersion })),
    {
      key: `wsu_newsletter_backup:${accounts.editorA.id}:${newsletterId}`,
      snapshot: { ...body.content, issue: { ...body.content.issue, title: 'Unsaved local title' } },
      baseVersion: body.summary.saveVersion,
    },
  )
  await adaPage.reload()
  await expect(adaPage.getByText('A local recovery draft matches this saved version.')).toBeVisible()
  await expect(shownTitle(adaPage)).toHaveText('Handoff title')
  await adaPage.getByRole('button', { name: 'Take over editing' }).click()
  await expect(shownTitle(adaPage)).toHaveText('Handoff title')
  await adaPage.getByRole('button', { name: 'Restore locally' }).click()
  await expect(shownTitle(adaPage)).toHaveText('Unsaved local title')
  // Restoring the recovery copy is one ordinary Undo step.
  await adaPage.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(shownTitle(adaPage)).toHaveText('Handoff title')
  await adaPage.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(shownTitle(adaPage)).toHaveText('Unsaved local title')
  await expect(adaPage.getByRole('button', { name: 'Redo', exact: true })).toBeDisabled()
  await adaPage.reload()
  await expect(shownTitle(adaPage)).toHaveText('Handoff title')

  const adaLeaseReply = adaPage.waitForResponse(
    (response) => response.url().endsWith('/lease') && response.request().postDataJSON()?.action === 'takeover',
  )
  await adaPage.getByRole('button', { name: 'Take over editing' }).click()
  const formerLease = await (await adaLeaseReply).json()
  await expect(adaPage.getByTestId('save-status')).toHaveText('Saved')
  const gracePage = await grace.newPage()
  await gracePage.goto(newsletterUrl)
  await gracePage.getByRole('button', { name: 'Take over editing' }).click()
  await expect(shownTitle(gracePage)).toHaveText('Handoff title')
  const refused = await ada.request.post(`/api/newsletters/${newsletterId}/saves`, {
    headers: { Origin: 'http://127.0.0.1:3100' },
    data: {
      token: formerLease.token,
      expectedVersion: formerLease.saveVersion,
      saveId: crypto.randomUUID(),
      snapshot: { ...formerLease.content, issue: { ...formerLease.content.issue, title: 'Ada after takeover' } },
    },
  })
  expect(refused.status()).toBe(409)
  await expect(adaPage.getByTestId('save-status')).toHaveText('Editing lease lost')
  await expect(shownTitle(gracePage)).toHaveText('Handoff title')
  await gracePage.getByRole('button', { name: 'Save and finish editing' }).click()
  await expect(gracePage.getByTestId('save-status')).toHaveText('View only')

  const client = new pg.Client({ connectionString: runtime.databaseUrl })
  await client.connect()
  const restarted = await ada.newPage()
  await restarted.goto(newsletterUrl)
  await expect(restarted.getByRole('button', { name: 'Save and finish editing' })).toBeVisible()
  await client.query(`UPDATE newsletters SET lease_expires_at = now() - interval '5 minutes' WHERE id = $1`, [
    newsletterId,
  ])
  await expect(restarted.getByTestId('save-status')).toHaveText('Editing lease lost', { timeout: 10000 })
  await restarted.getByRole('button', { name: 'Take over editing' }).click()
  await expect(restarted.getByTestId('save-status')).toHaveText('Saved')
  await client.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [
    accounts.editorA.id,
  ])
  expect((await ada.request.get('/api/auth/session')).status()).toBe(401)
  await expect(restarted.getByTestId('save-status')).toHaveText('Session expired')
  await client.end()
  await ada.close()
  await grace.close()
})
