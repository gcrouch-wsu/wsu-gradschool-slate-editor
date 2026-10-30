import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

const accounts = JSON.parse(readFileSync(join(process.cwd(), 'tests', 'browser', 'accounts.json'), 'utf8')) as {
  editorA: { id: string }
}

test('preview is isolated and the three templates render', async ({ page, context }) => {
  const response = await context.request.post('/api/auth/development/session', {
    data: { userId: accounts.editorA.id },
    headers: { Origin: 'http://127.0.0.1:3100' },
  })
  expect(response.status()).toBe(200)

  for (const template of ['Friday Focus', 'Briefing', 'Slate Campaign']) {
    await page.goto('/newsletters')
    await page.getByRole('button', { name: `New ${template}` }).click()
    await page.getByRole('dialog', { name: `New ${template}` }).getByRole('button', { name: 'Create draft' }).click()
    await page.waitForURL(/\/newsletters\/[0-9a-f-]+$/)
    const masthead = page.getByRole('button', { name: 'Masthead' })
    if ((await masthead.getAttribute('aria-expanded')) !== 'true') await masthead.click()
    const title = await page.locator('#newsletter-title').inputValue()
    expect(title).not.toBe('')

    const frame = page.locator('iframe[title="Newsletter Preview"]')
    // The editor may read the preview to size and scroll it, but the preview still cannot run scripts,
    // submit forms, open pop-ups, or navigate the editor.
    await expect(frame).toHaveAttribute('sandbox', 'allow-same-origin')
    await expect(frame).toHaveAttribute('srcdoc', new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), {
      timeout: 15000,
    })
    if (template !== 'Briefing') await expect(frame).toHaveAttribute('srcdoc', /href="browser"/)
    await expect(frame).not.toHaveAttribute('srcdoc', /<script/i)
    const scriptRan = await frame.evaluate((element: HTMLIFrameElement) => {
      const doc = element.contentDocument!
      const script = doc.createElement('script')
      script.textContent = 'window.previewScriptRan = true'
      doc.body.append(script)
      return (element.contentWindow as Window & { previewScriptRan?: boolean }).previewScriptRan ?? false
    })
    expect(scriptRan).toBe(false)
  }
})
