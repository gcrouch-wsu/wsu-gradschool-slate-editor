import { describe, expect, it } from 'vitest'
import { renderFullEmail } from '@/lib/email-templates'
import { renderExportedHtml } from '@/lib/export-html'
import { defaultBriefingModel, defaultFFModel, defaultLetterModel } from '@/lib/defaults'
import {
  documentFingerprint,
  importNewsletterFromHtml,
  normalizeNewsletter,
} from '@/lib/newsletter-document'
import type { NewsletterData } from '@/types/newsletter'

function embed(data: unknown, format: 'b64' | 'legacy') {
  const json = JSON.stringify(data)
  if (format === 'legacy') {
    return `<html><body><!-- WSU_NEWSLETTER_DATA:${json} --></body></html>`
  }
  const b64 = Buffer.from(json, 'utf8').toString('base64')
  return `<html><body><!-- WSU_NEWSLETTER_DATA_B64\n${b64}\n--></body></html>`
}

describe('newsletter document safety', () => {
  it('marks parts of the preview for following edits, but never the exported HTML', () => {
    const data = normalizeNewsletter(defaultFFModel(), { requireShape: true })
    const preview = renderFullEmail(data, { previewMarkers: true })
    for (const target of ['masthead', 'section-0', 'story-0-0', 'footer'])
      expect(preview).toContain(`data-preview-target="${target}"`)
    expect(renderFullEmail(data)).not.toContain('data-preview-target')
    expect(renderExportedHtml(data)).not.toContain('data-preview-target')
    // Markers only wrap the email; removing them leaves the exported email.
    expect(preview.replace(/<div data-preview-target="[^"]+">|<\/div>/g, '')).toBe(
      renderFullEmail(data).replace(/<\/div>/g, ''),
    )
  })

  it('keeps the three default templates and the renderer-owned Slate link', () => {
    for (const model of [defaultFFModel(), defaultBriefingModel(), defaultLetterModel()]) {
      const normalized = normalizeNewsletter(model, { requireShape: true })
      expect(normalized.template).toBe(model.template)
      const html = renderFullEmail(normalized)
      expect(html).toContain('href="browser"')
      expect(html).not.toContain('<script')
      expect(html).not.toContain('javascript:')
      const roundTrip = importNewsletterFromHtml(embed(normalized, 'b64'))
      expect(roundTrip.template).toBe(model.template)
      expect(documentFingerprint(roundTrip)).toBe(documentFingerprint(normalized))
    }
  })

  it('normalizes legacy social objects and missing title alignment from either wrapper', () => {
    const legacy = {
      ...defaultFFModel(),
      footer: {
        ...defaultFFModel().footer,
        social: {
          instagram: 'https://www.instagram.com/gradschoolwsu/',
          linkedin: { url: 'https://www.linkedin.com/school/washington-state-university-graduate-school/', icon: '', alt: 'LinkedIn' },
        },
      },
      sections: defaultFFModel().sections.map((section) => ({
        ...section,
        layout: { ...section.layout, title_align: undefined },
      })),
    }
    for (const format of ['b64', 'legacy'] as const) {
      const imported = importNewsletterFromHtml(embed(legacy, format))
      expect(Array.isArray(imported.footer.social)).toBe(true)
      expect(imported.footer.social[0]?.platform).toBe('Instagram')
      expect(imported.footer.social[0]?.url).toContain('https://')
      expect(imported.sections.every((section) => section.layout.title_align === 'left')).toBe(true)
    }
  })

  it('rejects unrelated JSON and strips scripts, handlers, unsafe URLs, and attribute breakout', () => {
    expect(() => importNewsletterFromHtml(embed({ unrelated: true }, 'b64'))).toThrow(/template/i)
    const malicious: NewsletterData = {
      ...defaultFFModel(),
      masthead: {
        ...defaultFFModel().masthead,
        banner_url: 'javascript:alert(1)',
        hero_link: 'https://user:pass@example.com/phish',
        title: 'Friday Focus',
      },
      sections: [
        {
          key: 'news',
          title: 'News',
          layout: {
            ...defaultFFModel().sections[0].layout,
            background_color: 'red" onmouseover="alert(1)',
            title_align: 'left',
          },
          cards: [
            {
              type: 'standard',
              title: 'Item',
              body_html: '<p>Hello</p><script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(2)">x</a>',
              links: [{ label: 'Bad', url: 'javascript:alert(3)' }],
            },
          ],
        },
      ],
    }
    const html = renderFullEmail(malicious)
    expect(html.toLowerCase()).not.toContain('<script')
    expect(html.toLowerCase()).not.toContain('onerror')
    expect(html.toLowerCase()).not.toContain('onmouseover')
    expect(html.toLowerCase()).not.toContain('javascript:')
    expect(html).toContain('href="browser"')
    expect(html).toContain('Hello')
  })
})
