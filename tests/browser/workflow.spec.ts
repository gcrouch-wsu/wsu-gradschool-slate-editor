import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type BrowserContext } from '@playwright/test'

const accounts = JSON.parse(readFileSync(join(process.cwd(), 'tests/browser/accounts.json'), 'utf8')) as {
  editorA: { id: string }
  editorB: { id: string }
}
const origin = 'http://127.0.0.1:3100'

async function signIn(context: BrowserContext, userId = accounts.editorA.id) {
  const response = await context.request.post('/api/auth/development/session', {
    data: { userId },
    headers: { Origin: origin },
  })
  expect(response.status()).toBe(200)
}

async function create(context: BrowserContext, template: string) {
  const response = await context.request.post('/api/newsletters', {
    data: { template },
    headers: { Origin: origin },
  })
  expect(response.status()).toBe(201)
  return (await response.json()).id as string
}

test('filters, duplication, progress, and AI suggestions work together', async ({ page, context }) => {
  test.setTimeout(90000)
  await signIn(context)
  const focus = await create(context, 'ff')
  const briefing = await create(context, 'briefing')
  await page.goto('/newsletters')
  const focusRow = page.locator('li').filter({ has: page.locator(`a[href="/newsletters/${focus}"]`) })
  const briefingRow = page.locator('li').filter({ has: page.locator(`a[href="/newsletters/${briefing}"]`) })
  await expect(focusRow).toBeVisible()
  await page.getByLabel('Template').selectOption('briefing')
  await expect(focusRow).toHaveCount(0)
  await expect(briefingRow).toBeVisible()
  await page.getByLabel('Search titles').fill('zzzz-no-such-issue')
  await expect(page.getByText('No newsletters match these filters.')).toBeVisible()
  await page.getByRole('button', { name: 'Clear filters' }).first().click()
  await expect(focusRow).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.setViewportSize({ width: 1280, height: 800 })

  await focusRow.getByRole('button', { name: 'Duplicate for next issue', exact: true }).click()
  const duplicate = page.getByRole('dialog', {
    name: 'Duplicate for next issue',
  })
  await expect(duplicate.getByLabel('Issue title or date')).toBeFocused()
  await duplicate.getByLabel('Issue title or date').fill('November 14, 2026')
  await duplicate.getByRole('button', { name: 'Create next issue', exact: true }).click()
  await page.waitForURL(/\/newsletters\/[0-9a-f-]+$/)
  const copyId = page.url().split('/').pop()
  expect(copyId).not.toBe(focus)
  await expect(page.getByTestId('save-status')).toHaveText('Saved')
  const copy = await (await context.request.get(`/api/newsletters/${copyId}`)).json()
  expect(copy.summary).toMatchObject({
    progress: 'draft',
    title: 'November 14, 2026',
    sourceNewsletterId: focus,
  })

  let loseProgressReply = true
  await page.route(`**/api/newsletters/${copyId}/progress`, async (route) => {
    if (!loseProgressReply) return route.continue()
    loseProgressReply = false
    await route.fetch()
    await route.abort('failed')
  })
  await page.getByRole('button', { name: 'Mark ready for Slate', exact: true }).click()
  await page.getByRole('button', { name: 'Retry progress update', exact: true }).click()
  await expect(page.locator('header')).toContainText('Ready for Slate')
  await page.getByRole('button', { name: 'Mark as sent via Slate', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Mark as sent via Slate?' })
    .getByRole('button', { name: 'Mark as sent via Slate', exact: true })
    .click()
  await expect(page.locator('header')).toContainText('Sent via Slate')
  await page.getByRole('button', { name: 'Masthead', exact: true }).click()
  await page.getByLabel('Issue title', { exact: true }).fill('Changed after the sent record')
  await expect(page.locator('header')).toContainText('Changed since sent')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.locator('header')).not.toContainText('Changed since sent')
  await page.getByLabel('Issue title', { exact: true }).fill('Changed after the sent record')
  await expect(page.locator('header')).toContainText('Changed since sent')
  await expect(page.getByTestId('save-status')).toHaveText('Saved', {
    timeout: 15000,
  })
  await page.getByRole('link', { name: 'Open sent version', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Sent version', exact: true })).toBeVisible()
  await expect(page.getByText('Changed since sent.')).toBeVisible()
  await page.getByRole('link', { name: 'Back to current draft', exact: true }).click()
  const status = page.getByTestId('save-status')
  await expect(status).toHaveText(/Saved|View only/)
  if ((await status.textContent()) === 'View only') {
    await page.getByRole('button', { name: 'Take over editing', exact: true }).click()
    await expect(status).toHaveText('Saved')
  }

  await page.route(`**/api/newsletters/${copyId}/ai`, async (route) => {
    const body = route.request().postDataJSON() as {
      action: string
      expectedVersion: number
      target: {
        originalText: string
        sectionKey?: string
        cardIndex?: number | null
        field?: string
        label?: string
      }
    }
    const current = await (await context.request.get(`/api/newsletters/${copyId}`)).json()
    await route.fulfill({
      json: {
        guideVersion: '1.1',
        model: 'test/model',
        fingerprint: 'test',
        suggestion:
          body.action === 'review'
            ? [
                {
                  sectionKey: 'deadlines',
                  sectionTitle: 'Deadlines and Important Information',
                  cardIndex: 0,
                  cardTitle: 'Sample Announcement',
                  field: 'body_html',
                  summary: 'Lead with the deadline.',
                  proposed: '<p>The application deadline is October 30.</p>',
                  reason: 'Section 7: establish what is happening.',
                  kind: 'style',
                  originalText: '<p>Placeholder body copy for a standard item.</p>',
                },
              ]
            : {
                proposed: '<p>Clearer announcement copy.</p>',
                reason: 'Section 3: lead with the subject.',
              },
        base: {
          newsletterId: copyId,
          saveVersion: body.expectedVersion,
          fingerprint: 'test',
          document: current.content,
          target: body.target,
        },
      },
    })
  })

  await page.getByRole('button', { name: 'Review newsletter', exact: true }).click()
  const review = page.getByRole('dialog', { name: 'Newsletter review' })
  await review.getByRole('button', { name: 'Prepare suggestion', exact: true }).click()
  await expect(review.getByText('Deadlines and Important Information / Sample Announcement / body_html')).toBeVisible()
  await expect(review.getByRole('button', { name: 'Changes', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(review.getByText('The application deadline is October 30.')).toBeVisible()
  expect(await review.innerText()).not.toContain('<p>')
  await review.getByRole('button', { name: 'Discard', exact: true }).click()
  await expect(review).toHaveCount(0)

  await page
    .getByRole('button', {
      name: 'AI assistance for Sample Announcement',
      exact: true,
    })
    .click()
  const assist = page.getByRole('dialog', {
    name: 'AI assistance for Sample Announcement',
  })
  await assist.getByRole('button', { name: 'Prepare suggestion', exact: true }).click()
  await expect(assist.getByText('Clearer announcement copy.')).toBeVisible()
  await expect(assist.getByRole('button', { name: 'Changes', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(assist.locator('del').first()).toBeVisible()
  await expect(assist.locator('ins').first()).toBeVisible()
  await expect(assist.getByText('Removed', { exact: true })).toBeVisible()
  await expect(assist.getByText('Added', { exact: true })).toBeVisible()
  expect(await assist.innerText()).not.toContain('<p>')
  await assist.getByRole('button', { name: 'Changes', exact: true }).focus()
  await page.keyboard.press('Tab')
  await expect(assist.getByRole('button', { name: 'Side by side', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(assist.getByRole('button', { name: 'Side by side', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(assist.getByRole('region', { name: 'Original' })).toBeVisible()
  await expect(assist.getByRole('region', { name: 'Proposed' })).toBeVisible()
  await expect(status).toHaveText('Saved')
  await page.setViewportSize({ width: 390, height: 844 })
  const originalBox = await assist.getByRole('region', { name: 'Original' }).boundingBox()
  const proposedBox = await assist.getByRole('region', { name: 'Proposed' }).boundingBox()
  expect(proposedBox!.y).toBeGreaterThan(originalBox!.y + originalBox!.height - 2)
  const dialogBox = await assist.boundingBox()
  expect(originalBox!.x + originalBox!.width).toBeLessThanOrEqual(dialogBox!.x + dialogBox!.width + 1)
  expect(proposedBox!.x + proposedBox!.width).toBeLessThanOrEqual(dialogBox!.x + dialogBox!.width + 1)
  await page.setViewportSize({ width: 1280, height: 720 })
  await assist.getByRole('button', { name: 'Apply suggestion', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(assist).toHaveCount(0)
  await expect(status).toHaveText('Saved')
  await expect
    .poll(async () => JSON.stringify(await (await context.request.get(`/api/newsletters/${copyId}`)).json()))
    .toContain('<p>Clearer announcement copy.</p>')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect
    .poll(async () => JSON.stringify(await (await context.request.get(`/api/newsletters/${copyId}`)).json()))
    .not.toContain('Clearer announcement copy.')

  if (!(await page.getByLabel('Issue title', { exact: true }).isVisible())) {
    await page.getByRole('button', { name: 'Masthead', exact: true }).click()
  }
  await page
    .getByRole('button', {
      name: 'AI assistance for Sample Announcement',
      exact: true,
    })
    .click()
  const second = page.getByRole('dialog', {
    name: 'AI assistance for Sample Announcement',
  })
  await second.getByRole('button', { name: 'Prepare suggestion', exact: true }).click()
  await expect(second.getByText('Clearer announcement copy.')).toBeVisible()
  await page.getByLabel('Issue title', { exact: true }).fill('Typed while the suggestion was open', { force: true })
  await second.getByRole('button', { name: 'Apply suggestion', exact: true }).click()
  await expect(second.getByRole('alert')).toContainText('out of date')
  await page.setViewportSize({ width: 390, height: 844 })
  const box = await second.getByRole('button', { name: 'Apply suggestion', exact: true }).boundingBox()
  expect(box?.height).toBeGreaterThanOrEqual(44)
  expect(box?.width).toBeGreaterThanOrEqual(44)
  await page.keyboard.press('Escape')
  await expect(second).toHaveCount(0)
})

test('AI cancellation, focus trapping, and takeover cannot apply an old proposal', async ({
  page,
  context,
  browser,
}) => {
  await signIn(context)
  const id = await create(context, 'ff')
  await page.goto(`/newsletters/${id}`)
  await expect(page.getByTestId('save-status')).toHaveText('Saved')
  let release: () => void = () => undefined
  let entered: () => void = () => undefined
  const started = new Promise<void>((resolve) => {
    entered = resolve
  })
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let first = true
  await page.route(`**/api/newsletters/${id}/ai`, async (route) => {
    const body = route.request().postDataJSON()
    const current = await (await context.request.get(`/api/newsletters/${id}`)).json()
    if (first) {
      first = false
      entered()
      await gate
    }
    await route
      .fulfill({
        json: {
          guideVersion: '1.1',
          model: 'test/model',
          suggestion: {
            proposed: '<p>A proposal that must not be applied.</p>',
            reason: 'Section 3: clarity.',
          },
          base: {
            newsletterId: id,
            saveVersion: body.expectedVersion,
            document: current.content,
            target: body.target,
            fingerprint: 'test',
          },
        },
      })
      .catch(() => undefined)
  })
  await page
    .getByRole('button', {
      name: 'AI assistance for Sample Announcement',
      exact: true,
    })
    .click()
  let dialog = page.getByRole('dialog', {
    name: 'AI assistance for Sample Announcement',
  })
  await dialog.getByRole('button', { name: 'Prepare suggestion', exact: true }).click()
  await started
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await page
    .getByRole('button', {
      name: 'AI assistance for Sample Announcement',
      exact: true,
    })
    .click()
  dialog = page.getByRole('dialog', {
    name: 'AI assistance for Sample Announcement',
  })
  release()
  await expect(dialog.getByText('A proposal that must not be applied.')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Prepare suggestion', exact: true }).click()
  await expect(dialog.getByText('A proposal that must not be applied.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Apply suggestion', exact: true }).focus()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: 'Edit for clarity', exact: true })).toBeFocused()
  const other = await browser.newContext()
  await signIn(other, accounts.editorB.id)
  expect(
    (
      await other.request.post(`/api/newsletters/${id}/lease`, {
        data: { action: 'takeover' },
        headers: { Origin: origin },
      })
    ).status(),
  ).toBe(200)
  await dialog.getByRole('button', { name: 'Apply suggestion', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText(/authority|lease|out of date/i)
  const final = await (await context.request.get(`/api/newsletters/${id}`)).json()
  expect(JSON.stringify(final.content)).not.toContain('A proposal that must not be applied.')
  await other.close()
})
