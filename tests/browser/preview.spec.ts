import { expect, test } from '@playwright/test'

test('preview is isolated and the three templates render', async ({ page }) => {
  // The dev server reloads this page while it first compiles. Start only after two quiet seconds without a reload.
  let navigations = 0
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations++
  })
  await page.goto('/')
  await expect
    .poll(
      async () => {
        const seen = navigations
        await page.waitForTimeout(2000)
        return navigations === seen
      },
      { timeout: 60000 },
    )
    .toBe(true)
  await expect(page.locator('select').filter({ hasText: 'Friday Focus (Students)' })).toBeVisible()
  const masthead = page.getByRole('button', { name: 'Masthead' })
  await expect(async () => {
    if ((await masthead.getAttribute('aria-expanded')) !== 'true') await masthead.click()
    await expect(masthead).toHaveAttribute('aria-expanded', 'true', { timeout: 1000 })
  }).toPass()
  const title = page.locator('#newsletter-title')
  await expect(title).toHaveValue('Friday Focus Newsletter')
  const frame = page.locator('iframe[title="Newsletter Preview"]')
  // The editor may read the preview to size and scroll it, but the preview still cannot run scripts,
  // submit forms, open pop-ups, or navigate the editor.
  await expect(frame).toHaveAttribute('sandbox', 'allow-same-origin')
  await expect(frame).toHaveAttribute('srcdoc', /href="browser"/)
  await expect(frame).not.toHaveAttribute('srcdoc', /<script/i)
  const scriptRan = await frame.evaluate((element: HTMLIFrameElement) => {
    const doc = element.contentDocument!
    const script = doc.createElement('script')
    script.textContent = 'window.previewScriptRan = true'
    doc.body.append(script)
    return (element.contentWindow as Window & { previewScriptRan?: boolean }).previewScriptRan ?? false
  })
  expect(scriptRan).toBe(false)

  await page.locator('select').filter({ hasText: 'Friday Focus (Students)' }).selectOption('briefing')
  await page.getByRole('button', { name: 'Switch' }).click()
  await expect(title).toHaveValue('Graduate School Briefing')
  await expect(frame).toHaveAttribute('srcdoc', /Graduate School Briefing/)

  await page.locator('select').filter({ hasText: 'Friday Focus (Students)' }).selectOption('letter')
  await page.getByRole('button', { name: 'Switch' }).click()
  await expect(title).toHaveValue('Graduate School Slate Campaign')
  await expect(frame).toHaveAttribute('srcdoc', /href="browser"/)
})
