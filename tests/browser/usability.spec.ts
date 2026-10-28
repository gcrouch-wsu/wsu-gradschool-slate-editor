import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

const accounts = JSON.parse(readFileSync(join(process.cwd(), 'tests/browser/accounts.json'), 'utf8'))
const origin = 'http://127.0.0.1:3100'

test('story editing explains saving, protects Cancel, contains focus, and works on a phone', async ({
  page,
  context,
}) => {
  expect(
    (
      await context.request.post('/api/auth/development/session', {
        data: { userId: accounts.editorA.id },
        headers: { Origin: origin },
      })
    ).status(),
  ).toBe(200)
  const created = await context.request.post('/api/newsletters', {
    data: { template: 'ff' },
    headers: { Origin: origin },
  })
  const id = (await created.json()).id
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/newsletters/${id}`)
  await expect(page.getByTestId('save-status')).toHaveText('Saved')
  const edit = page.getByRole('button', { name: 'Edit Sample Announcement', exact: true })
  await edit.click()
  const story = page.getByRole('dialog', { name: 'Edit story', exact: true })
  await expect(story).toBeVisible()
  await expect(story.getByRole('status')).toContainText('not saved until you choose Save story')
  const title = story.getByLabel('Title *', { exact: true })
  await title.fill('Unsaved story title')
  const original = await (await context.request.get(`/api/newsletters/${id}`)).json()
  expect(JSON.stringify(original.content)).not.toContain('Unsaved story title')
  await story.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(story.getByRole('alert')).toContainText('Discard unsaved story changes?')
  await expect(story.getByRole('button', { name: 'Keep editing' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(story.getByRole('alert')).toHaveCount(0)
  await expect(title).toHaveValue('Unsaved story title')
  await story.getByRole('button', { name: 'Cancel', exact: true }).click()
  await story.getByRole('button', { name: 'Discard story changes', exact: true }).click()
  await expect(story).toHaveCount(0)
  await expect(edit).toBeFocused()
  await edit.click()
  await expect(title).toHaveValue('Sample Announcement')
  await title.fill('Story saved explicitly')
  await expect(story.getByRole('textbox', { name: 'Story body' })).toBeVisible()
  const save = story.getByRole('button', { name: 'Save story', exact: true })
  for (const target of [save, story.getByRole('button', { name: 'Bold', exact: true })]) {
    const box = await target.boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }
  // Tab from the last control wraps to the first, rather than the draft toolbar.
  await story
    .locator(
      'button:visible, input:visible, select:visible, textarea:visible, summary:visible, [contenteditable="true"]:visible',
    )
    .last()
    .focus()
  await page.keyboard.press('Tab')
  await expect(story.getByRole('button', { name: 'Delete', exact: true })).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({ path: test.info().outputPath('phone-story.png') })
  await save.click()
  await expect(story).toHaveCount(0)
  await expect
    .poll(async () => JSON.stringify(await (await context.request.get(`/api/newsletters/${id}`)).json()))
    .toContain('Story saved explicitly')
  await page.getByRole('button', { name: 'Preview', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Preview', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('iframe[title="Newsletter Preview"]')).toBeVisible()
  await page.getByRole('button', { name: 'Edit draft', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Edit Story saved explicitly', exact: true })).toBeVisible()
})

test('long AI reviews keep choices with passages, reset decisions, and preserve source until Apply', async ({
  page,
  context,
}) => {
  await context.request.post('/api/auth/development/session', {
    data: { userId: accounts.editorA.id },
    headers: { Origin: origin },
  })
  const id = (
    await (
      await context.request.post('/api/newsletters', { data: { template: 'ff' }, headers: { Origin: origin } })
    ).json()
  ).id
  const current = await (await context.request.get(`/api/newsletters/${id}`)).json()
  const original = Array.from(
    { length: 16 },
    (_, i) =>
      `<p>Original wording for paragraph ${i + 1}. Read this sentence in context before deciding whether the suggested wording is helpful.</p>`,
  ).join('')
  const proposed = original.replaceAll('Original wording', 'Clearer wording')
  current.content.sections[0].cards[0].body_html = original
  const lease = await (
    await context.request.post(`/api/newsletters/${id}/lease`, {
      data: { action: 'acquire' },
      headers: { Origin: origin },
    })
  ).json()
  expect(
    (
      await context.request.post(`/api/newsletters/${id}/saves`, {
        data: { token: lease.token, expectedVersion: 1, saveId: crypto.randomUUID(), snapshot: current.content },
        headers: { Origin: origin },
      })
    ).status(),
  ).toBe(200)
  await context.request.post(`/api/newsletters/${id}/lease`, {
    data: { action: 'release', token: lease.token },
    headers: { Origin: origin },
  })
  await page.goto(`/newsletters/${id}`)
  await expect(page.getByTestId('save-status')).toHaveText('Saved')
  const saved = await (await context.request.get(`/api/newsletters/${id}`)).json()
  await page.route(`**/api/newsletters/${id}/ai`, async (route) => {
    const request = route.request().postDataJSON()
    await route.fulfill({
      json: {
        guideVersion: '1.1',
        model: 'test/model',
        suggestion: { proposed, reason: 'Clarity in context.' },
        base: {
          newsletterId: id,
          saveVersion: request.expectedVersion,
          document: saved.content,
          target: request.target,
          fingerprint: 'test',
        },
      },
    })
  })
  await page.getByRole('button', { name: 'AI assistance for Sample Announcement', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'AI assistance for Sample Announcement' })
  await dialog.getByRole('button', { name: 'Prepare suggestion', exact: true }).click()
  await expect(dialog.getByRole('region', { name: /^Passage / })).toHaveCount(16)
  await expect(dialog.getByRole('region', { name: 'Individual edits' })).toHaveCount(0)
  expect((await dialog.boundingBox())!.width).toBeGreaterThan(900)
  const first = dialog.getByRole('region', { name: 'Passage 1', exact: true })
  await first.locator('ins').first().click()
  const choices = first.getByRole('group', { name: 'Edit 1 choices', exact: true })
  await expect(choices).toBeFocused()
  await choices.getByRole('button', { name: /^Pass on this edit/ }).click()
  await expect(first.getByRole('button', { name: /^Review edit 1.*Passed$/ })).toBeVisible()
  await choices.getByRole('button', { name: 'Reset choice for edit 1' }).click()
  await expect(dialog.getByRole('status').filter({ hasText: '16 unreviewed' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  await expect(first.getByRole('button', { name: 'Review edit 1', exact: true })).toBeFocused()
  await first.getByRole('button', { name: 'Review edit 1', exact: true }).press('Enter')
  await expect(choices).toBeVisible()
  await dialog.getByRole('region', { name: 'Passage 16', exact: true }).scrollIntoViewIfNeeded()
  await expect(choices).not.toBeInViewport()
  await dialog.getByRole('button', { name: 'Side by side', exact: true }).click()
  await expect(first.getByRole('region', { name: 'Original', exact: true })).toContainText('Original wording')
  await expect(first.getByRole('region', { name: 'Proposed', exact: true })).toContainText('Clearer wording')
  await first.getByRole('button', { name: /^Accept this edit/ }).click()
  await page.screenshot({ path: test.info().outputPath('wide-comparison.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await first.scrollIntoViewIfNeeded()
  const left = await first.getByRole('region', { name: 'Original', exact: true }).boundingBox()
  const right = await first.getByRole('region', { name: 'Proposed', exact: true }).boundingBox()
  expect(right!.y).toBeGreaterThan(left!.y)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({ path: test.info().outputPath('phone-comparison.png') })
  expect((await (await context.request.get(`/api/newsletters/${id}`)).json()).summary.saveVersion).toBe(
    saved.summary.saveVersion,
  )
  await dialog.getByRole('button', { name: 'Discard', exact: true }).click()
  expect(
    (await (await context.request.get(`/api/newsletters/${id}`)).json()).content.sections[0].cards[0].body_html,
  ).toBe(original)
})
