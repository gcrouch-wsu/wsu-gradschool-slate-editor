import { EXPORT_DEFAULTS } from '@/lib/config'
import { renderFullEmail } from '@/lib/email-templates'
import { normalizeNewsletter } from '@/lib/newsletter-document'
import type { ExportOptions, NewsletterData, TemplateType } from '@/types/newsletter'

export function renderExportedHtml(rawNewsletter: unknown, exportOptions: ExportOptions = {}) {
  const newsletterData = normalizeNewsletter(rawNewsletter, { requireShape: true })
  const minify = exportOptions.minify ?? EXPORT_DEFAULTS.minify
  const stripJson = exportOptions.strip_json ?? EXPORT_DEFAULTS.strip_json
  let htmlOutput = renderFullEmail(newsletterData)
  if (minify) htmlOutput = htmlOutput.replace(/>\s+</g, '><')
  if (!stripJson) {
    const jsonB64 = Buffer.from(JSON.stringify(newsletterData), 'utf-8').toString('base64')
    const chunks: string[] = []
    for (let i = 0; i < jsonB64.length; i += 100) chunks.push(jsonB64.slice(i, i + 100))
    htmlOutput = htmlOutput.replace('</body>', `<!-- WSU_NEWSLETTER_DATA_B64\n${chunks.join('\n')}\n-->\n</body>`)
  }
  return { html: htmlOutput, filename: exportFilename(newsletterData, stripJson) }
}

function exportFilename(newsletterData: NewsletterData, stripJson: boolean) {
  const dataTemplate = newsletterData.template
  const templateType: TemplateType =
    dataTemplate === 'briefing' ? 'briefing' : dataTemplate === 'letter' ? 'letter' : 'ff'
  const prefix = EXPORT_DEFAULTS.filename_prefix[templateType] || 'Newsletter_'
  const suffix = stripJson ? '_PRODUCTION' : ''
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const year = now.getFullYear()
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  return `${prefix}${month}-${day}-${year}-${hours}:${minutes}${suffix}.html`
}
