import { expect, test } from 'vitest'
import { auditEmailHtml, EmailAccessibilityError } from '@/lib/email-accessibility'
import { defaultFFModel, defaultBriefingModel, defaultLetterModel } from '@/lib/defaults'
import { renderExportedHtml } from '@/lib/export-html'
import { importNewsletterFromHtml, normalizeNewsletter } from '@/lib/newsletter-document'

test('all three exported emails have semantic headings, language, named links, and reimportable content', () => {
  for (const content of [defaultFFModel(), defaultBriefingModel(), defaultLetterModel()]) {
    const exported = renderExportedHtml(content)
    expect(exported.issues.filter((issue) => issue.severity === 'error')).toEqual([])
    expect(exported.html).toContain('<html lang="en"')
    expect(exported.html.match(/<h1\b/g)).toHaveLength(1)
    expect(exported.html).toContain('role="main"')
    expect(exported.html).toContain('href="browser"')
    expect(importNewsletterFromHtml(exported.html)).toEqual(normalizeNewsletter(content))
  }
})

test('export refuses missing image alternatives, unnamed linked images, low contrast, and headerless data tables', () => {
  for (const body_html of [
    '<img src="https://example.edu/photo.png">',
    '<a href="https://example.edu"><img src="https://example.edu/photo.png" alt=""></a>',
    '<p style="color:#ffffff; background-color:#ffffff">Invisible announcement</p>',
    '<table><tr><td>Date</td><td>Event</td></tr></table>',
    '<h6>Skipped heading</h6>',
  ]) {
    const content = defaultFFModel()
    content.sections[0].cards![0].body_html = body_html
    expect(() => renderExportedHtml(content)).toThrow(EmailAccessibilityError)
  }
})

test('decorative images and semantic data-table attributes survive export normalization', () => {
  const content = defaultFFModel()
  content.sections[0].cards![0].body_html =
    '<img src="https://example.edu/decoration.png" alt=""><table><tr><th id="date" scope="col">Date</th><th scope="col">Event</th></tr><tr><td headers="date">May 1</td><td>Workshop</td></tr></table>'
  const output = renderExportedHtml(content)
  expect(output.html).toContain('scope="col"')
  expect(output.html).toContain('headers="date"')
  expect(output.html).toContain('alt=""')
  expect(auditEmailHtml(output.html).filter((issue) => issue.severity === 'error')).toEqual([])
})
