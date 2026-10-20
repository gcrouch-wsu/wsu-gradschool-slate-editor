import { expect, test } from '@playwright/test'

test('preview is isolated and the three templates render', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('select').filter({ hasText: 'Friday Focus (Students)' })).toBeVisible()
  await page.getByRole('button', { name: 'Masthead' }).click()
  const title = page.locator('#newsletter-title')
  await expect(title).toHaveValue('Friday Focus Newsletter')
  const frame = page.locator('iframe[title="Newsletter Preview"]')
  await expect(frame).toHaveAttribute('sandbox', '')
  await expect(frame).toHaveAttribute('srcdoc', /href="browser"/)
  await expect(frame).not.toHaveAttribute('srcdoc', /<script/i)
  const documentAccess = await frame.evaluate((element: HTMLIFrameElement) => element.contentDocument)
  expect(documentAccess).toBeNull()

  await page.locator('select').filter({ hasText: 'Friday Focus (Students)' }).selectOption('briefing')
  await page.getByRole('button', { name: 'Switch' }).click()
  await expect(title).toHaveValue('Graduate School Briefing')
  await expect(frame).toHaveAttribute('srcdoc', /Graduate School Briefing/)

  await page.locator('select').filter({ hasText: 'Friday Focus (Students)' }).selectOption('letter')
  await page.getByRole('button', { name: 'Switch' }).click()
  await expect(title).toHaveValue('Graduate School Slate Campaign')
  await expect(frame).toHaveAttribute('srcdoc', /href="browser"/)
})
