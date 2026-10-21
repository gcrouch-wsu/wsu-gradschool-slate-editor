import { Parser } from 'htmlparser2'
import type { ValidationIssue } from '@/types/newsletter'

export class EmailAccessibilityError extends Error {
  constructor(public issues: ValidationIssue[]) {
    super('Fix the accessibility errors below before exporting HTML.')
    this.name = 'EmailAccessibilityError'
  }
}
interface Frame {
  tag: string
  attrs: Record<string, string>
  text: string
  headers: number
  color: string
  background: string
  size: number
  bold: boolean
  hidden: boolean
}
function hex(value: string): number[] | null {
  const match = value.trim().match(/^#([a-f\d]{3}|[a-f\d]{6})(?:\s*!important)?$/i)
  if (!match) return null
  const full = match[1].length === 3 ? [...match[1]].map((c) => c + c).join('') : match[1]
  return [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16) / 255)
}
function luminance(rgb: number[]): number {
  const [r, g, b] = rgb.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return r * 0.2126 + g * 0.7152 + b * 0.0722
}
function styleValue(style: string, property: string): string | undefined {
  return style.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i'))?.[1].trim()
}

// Inspect the actual rendered email, including content generated outside rich text.
// Automated checks cannot certify descriptions, reading order, or every mail client.
export function auditEmailHtml(html: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [],
    seen = new Set<string>(),
    stack: Frame[] = []
  let h1Count = 0,
    lastHeading = 0,
    language = false,
    documentTitle = false
  function add(severity: 'error' | 'warning', message: string, location: string, fix: string) {
    const key = `${severity}:${message}:${location}`
    if (!seen.has(key) && issues.length < 80) {
      seen.add(key)
      issues.push({ severity, message, location, fix })
    }
  }
  const parser = new Parser(
    {
      onopentag(tag, attrs) {
        const parent = stack[stack.length - 1],
          style = attrs.style || ''
        const frame: Frame = {
          tag,
          attrs,
          text: '',
          headers: 0,
          color: styleValue(style, 'color') || parent?.color || '#333333',
          background: styleValue(style, 'background-color') || parent?.background || '#ffffff',
          size: parseFloat(styleValue(style, 'font-size') || '') || parent?.size || 16,
          bold:
            /^(bold|[6-9]00)/.test(styleValue(style, 'font-weight') || '') ||
            (!styleValue(style, 'font-weight') && Boolean(parent?.bold)),
          hidden:
            Boolean(parent?.hidden) ||
            ['head', 'style', 'script'].includes(tag) ||
            /display\s*:\s*none|visibility\s*:\s*hidden/i.test(style),
        }
        if (tag === 'a' && !['footer-link', 'cta'].includes(attrs['data-role'])) frame.color = '#A60F2D'
        if (tag === 'html') language = Boolean(attrs.lang?.trim())
        if (/^h[1-6]$/.test(tag) && !frame.hidden) {
          const level = Number(tag[1])
          if (level === 1) h1Count++
          if (level > lastHeading + 1)
            add(
              'error',
              `Heading level jumps from h${lastHeading} to h${level}.`,
              'Headings',
              'Use consecutive heading levels; add a section title or adjust headings inside the card.',
            )
          lastHeading = level
        }
        if (tag === 'img') {
          if (!Object.prototype.hasOwnProperty.call(attrs, 'alt'))
            add(
              'error',
              'An image has no alt attribute.',
              attrs.src || 'Image',
              'Add meaningful alt text, or alt="" for a decorative image.',
            )
          const link = [...stack].reverse().find((entry) => entry.tag === 'a')
          if (link) link.text += ` ${attrs.alt || ''}`
        }
        if (tag === 'th') {
          const table = [...stack].reverse().find((entry) => entry.tag === 'table')
          if (table) table.headers++
        }
        stack.push(frame)
      },
      ontext(text) {
        for (const frame of stack) frame.text += text
        const current = stack[stack.length - 1],
          trimmed = text.replace(/\s+/g, ' ').trim()
        if (!current || current.hidden || !trimmed) return
        const foreground = hex(current.color),
          background = hex(current.background)
        if (foreground && background) {
          const a = luminance(foreground),
            b = luminance(background)
          const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
          const required = current.size >= 24 || (current.bold && current.size >= 18.66) ? 3 : 4.5
          if (ratio + 0.005 < required)
            add(
              'error',
              `Text contrast is ${ratio.toFixed(2)}:1; at least ${required}:1 is required.`,
              `Text: ${trimmed.slice(0, 65)}`,
              'Choose darker text or a contrasting background color.',
            )
        }
      },
      onclosetag() {
        const frame = stack.pop()
        if (!frame) return
        if (frame.tag === 'title' && frame.text.trim()) documentTitle = true
        if (frame.hidden) return
        if (/^h[1-6]$/.test(frame.tag) && !frame.text.trim())
          add('error', 'A heading is empty.', 'Headings', 'Add heading text or remove the empty heading.')
        if (frame.tag === 'a') {
          const name = (frame.attrs['aria-label'] || frame.text).replace(/\s+/g, ' ').trim()
          if (!name)
            add(
              'error',
              'A link has no accessible name.',
              frame.attrs.href || 'Link',
              'Add descriptive link text or meaningful alt text to its linked image.',
            )
          if (!frame.attrs.href || frame.attrs.href === '#')
            add('error', 'A link has no destination.', name || 'Link', 'Supply the destination URL.')
          if (/^(click here|read more|learn more|here|more)$/i.test(name))
            add(
              'warning',
              'Link text is vague when read on its own.',
              name,
              'Include the subject or destination in the link text.',
            )
        }
        if (frame.tag === 'table' && !['presentation', 'none'].includes(frame.attrs.role) && frame.headers === 0)
          add(
            'error',
            'A data table has no header cells.',
            'Rich-text table',
            'Use a header row/column with th cells. Layout tables are marked presentation by the renderer.',
          )
        if (frame.tag === 'th' && !frame.text.trim())
          add('warning', 'A table header is empty.', 'Rich-text table', 'Name each data column or row.')
      },
    },
    { decodeEntities: true },
  )
  parser.write(html)
  parser.end()
  if (!language) add('error', 'The email has no document language.', 'Document', 'Set the HTML language.')
  if (!documentTitle) add('error', 'The email has no document title.', 'Document', 'Add a newsletter title.')
  if (h1Count !== 1)
    add(
      'error',
      'The email needs exactly one main heading.',
      'Headings',
      'Give the newsletter a title and use lower-level headings within cards.',
    )
  return issues
}
