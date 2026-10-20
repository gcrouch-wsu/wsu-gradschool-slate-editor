// Validate, migrate, and sanitize newsletter documents before they are stored or rendered.

import { createHash } from 'node:crypto'
import sanitizeHtml from 'sanitize-html'
import type {
  Card,
  Closure,
  Colors,
  Footer,
  Link,
  Masthead,
  NewsletterData,
  Padding,
  Section,
  SectionLayout,
  Settings,
  Shadow,
  SocialLink,
  TemplateType,
  TitleAlign,
  Typography,
} from '@/types/newsletter'

export const DOCUMENT_SCHEMA_VERSION = 1

export class DocumentValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DocumentValidationError'
  }
}

const TEMPLATES = new Set<TemplateType>(['ff', 'briefing', 'letter'])
const ALIGNS = new Set<TitleAlign>(['left', 'center', 'right'])
const CARD_TYPES = new Set(['standard', 'event', 'resource', 'cta', 'letter'])
const BUTTON_STYLES = new Set([
  'button',
  'pill',
  'outlined',
  'ghost',
  'arrow',
  'underlined',
  'text-only',
])
const BORDER_STYLES = new Set(['solid', 'dashed', 'dotted', 'double'])
const TABLE_BORDERS = new Set(['none', 'light', 'medium', 'bold'])
const FONT_WEIGHTS = new Set(['normal', 'bold', '600', '700'])
const TRANSFORMS = new Set(['none', 'uppercase', 'lowercase', 'capitalize'])
const FONT_FAMILIES = new Set([
  'Arial, Helvetica, sans-serif',
  'Georgia, serif',
  'Times New Roman, Times, serif',
  'Verdana, Geneva, sans-serif',
  'Tahoma, Geneva, sans-serif',
  'Courier New, Courier, monospace',
])

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
const MAX_BODY_HTML = 100_000
const MAX_SHORT = 500
const MAX_SECTIONS = 40
const MAX_CARDS = 30
const MAX_LINKS = 20

const RICH_HTML_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p',
    'br',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'strike',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'ul',
    'ol',
    'li',
    'a',
    'img',
    'table',
    'thead',
    'tbody',
    'tfoot',
    'tr',
    'th',
    'td',
    'span',
    'div',
    'blockquote',
    'hr',
    'sub',
    'sup',
  ],
  allowedAttributes: {
    a: ['href', 'title'],
    img: ['src', 'alt', 'width', 'height'],
    td: ['colspan', 'rowspan', 'style'],
    th: ['colspan', 'rowspan', 'style'],
    '*': ['style'],
  },
  allowedStyles: {
    '*': {
      'text-align': [/^(left|right|center|justify)$/],
      color: [/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/],
      'background-color': [/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/],
      'font-size': [/^\d{1,2}(?:\.\d+)?px$/],
      'font-weight': [/^(?:normal|bold|[1-9]00)$/],
      'line-height': [/^\d+(?:\.\d+)?$/],
      margin: [/^(?:\d+(?:\.\d+)?px|0)(?:\s+(?:\d+(?:\.\d+)?px|0)){0,3}$/],
      'margin-top': [/^\d+(?:\.\d+)?px$/],
      'margin-bottom': [/^\d+(?:\.\d+)?px(?:\s*!important)?$/],
      'margin-left': [/^\d+(?:\.\d+)?px$/],
      'margin-right': [/^\d+(?:\.\d+)?px$/],
      padding: [/^(?:\d+(?:\.\d+)?px|0)(?:\s+(?:\d+(?:\.\d+)?px|0)){0,3}$/],
      'text-decoration': [/^(?:none|underline)$/],
      'vertical-align': [/^(?:top|middle|bottom)$/],
      border: [/^(?:none|\d+px\s+solid\s+#[0-9a-fA-F]{3,8})$/],
      'border-bottom': [/^\d+px\s+solid\s+#[0-9a-fA-F]{3,8}$/],
      'border-collapse': [/^collapse$/],
      width: [/^(?:\d+%|\d+px|100%)$/],
    },
  },
  allowedSchemes: ['https', 'mailto'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
}

export function sanitizeRichHtml(html: string): string {
  const trimmed = html.slice(0, MAX_BODY_HTML)
  return sanitizeHtml(trimmed, RICH_HTML_OPTIONS).trim()
}

export function cssHex(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  if (!trimmed) return fallback
  return HEX_COLOR.test(trimmed) ? trimmed : fallback
}

export function optionalCssHex(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  if (!trimmed) return ''
  return HEX_COLOR.test(trimmed) ? trimmed : fallback
}

/** Author-controlled URL. Empty is allowed. Only https and mailto survive. */
export function authorUrl(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 2000) return ''
  if (trimmed === 'browser' || trimmed.includes('{{')) return ''
  try {
    const url = new URL(trimmed)
    if (url.username || url.password) return ''
    if (url.protocol === 'https:' || url.protocol === 'mailto:') return url.toString()
  } catch {
    return ''
  }
  return ''
}

export function documentFingerprint(data: NewsletterData): string {
  return createHash('sha256').update(canonicalJson(data)).digest('hex')
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const keys = Object.keys(record).sort()
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function decodeEmbeddedNewsletter(html: string): unknown {
  const base64 = html.match(/<!-- WSU_NEWSLETTER_DATA_B64\s+([\s\S]*?)\s+-->/)
  if (base64) {
    const json = Buffer.from(base64[1].replace(/\s+/g, ''), 'base64').toString('utf8')
    return JSON.parse(json)
  }
  const legacy = html.match(/<!-- WSU_NEWSLETTER_DATA:([\s\S]*?) -->/)
  if (!legacy) {
    throw new DocumentValidationError(
      'No embedded data found. This HTML was not exported from this editor.'
    )
  }
  return JSON.parse(legacy[1])
}

export function migrateLegacyNewsletterShape(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input
  const data = { ...(input as Record<string, unknown>) }
  const footer = data.footer
  if (footer && typeof footer === 'object' && !Array.isArray(footer)) {
    const footerRecord = { ...(footer as Record<string, unknown>) }
    const social = footerRecord.social
    if (social && typeof social === 'object' && !Array.isArray(social)) {
      footerRecord.social = migrateSocialObject(social as Record<string, unknown>)
      data.footer = footerRecord
    }
  }
  if (Array.isArray(data.sections)) {
    data.sections = data.sections.map((section) => {
      if (!section || typeof section !== 'object' || Array.isArray(section)) return section
      const copy = { ...(section as Record<string, unknown>) }
      const layout = copy.layout
      if (layout && typeof layout === 'object' && !Array.isArray(layout)) {
        const layoutCopy = { ...(layout as Record<string, unknown>) }
        if (!layoutCopy.title_align) layoutCopy.title_align = 'left'
        copy.layout = layoutCopy
      }
      return copy
    })
  }
  return data
}

export function importNewsletterFromHtml(html: string): NewsletterData {
  let decoded: unknown
  try {
    decoded = decodeEmbeddedNewsletter(html)
  } catch (error) {
    if (error instanceof DocumentValidationError) throw error
    throw new DocumentValidationError('Corrupted embedded data')
  }
  return normalizeNewsletter(migrateLegacyNewsletterShape(decoded), { requireShape: true })
}

export function normalizeNewsletter(
  input: unknown,
  options: { requireShape?: boolean } = {}
): NewsletterData {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new DocumentValidationError('Newsletter document must be an object')
  }
  const raw = input as Record<string, unknown>
  if (options.requireShape) {
    if (!TEMPLATES.has(raw.template as TemplateType)) {
      throw new DocumentValidationError('Newsletter template is missing or invalid')
    }
    if (!raw.masthead || typeof raw.masthead !== 'object' || Array.isArray(raw.masthead)) {
      throw new DocumentValidationError('Newsletter masthead is missing')
    }
    if (!Array.isArray(raw.sections)) {
      throw new DocumentValidationError('Newsletter sections are missing')
    }
    if (!raw.footer || typeof raw.footer !== 'object' || Array.isArray(raw.footer)) {
      throw new DocumentValidationError('Newsletter footer is missing')
    }
    if (!raw.settings || typeof raw.settings !== 'object' || Array.isArray(raw.settings)) {
      throw new DocumentValidationError('Newsletter settings are missing')
    }
  }

  const template: TemplateType = TEMPLATES.has(raw.template as TemplateType)
    ? (raw.template as TemplateType)
    : 'ff'

  return {
    template,
    masthead: normalizeMasthead(raw.masthead),
    sections: normalizeSections(raw.sections),
    footer: normalizeFooter(raw.footer),
    settings: normalizeSettings(raw.settings),
  }
}

function migrateSocialObject(social: Record<string, unknown>): SocialLink[] {
  const platforms = ['instagram', 'linkedin', 'facebook', 'twitter', 'youtube']
  const migrated: SocialLink[] = []
  for (const platformKey of platforms) {
    if (!(platformKey in social)) continue
    const platformData = social[platformKey]
    const label = platformKey.charAt(0).toUpperCase() + platformKey.slice(1)
    if (typeof platformData === 'string') {
      migrated.push({ platform: label, url: platformData, icon: '', alt: label })
    } else if (platformData && typeof platformData === 'object') {
      const record = platformData as Record<string, unknown>
      migrated.push({
        platform: label,
        url: typeof record.url === 'string' ? record.url : '',
        icon: typeof record.icon === 'string' ? record.icon : '',
        alt: typeof record.alt === 'string' ? record.alt : label,
      })
    }
  }
  return migrated
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function text(value: unknown, max = MAX_SHORT): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\u0000/g, '').slice(0, max)
}

function align(value: unknown, fallback: TitleAlign = 'left'): TitleAlign {
  return ALIGNS.has(value as TitleAlign) ? (value as TitleAlign) : fallback
}

function int(value: unknown, fallback: number, min: number, max: number): number {
  const number = typeof value === 'number' ? value : Number.NaN
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.round(number)))
}

function float(value: unknown, fallback: number, min: number, max: number): number {
  const number = typeof value === 'number' ? value : Number.NaN
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, number))
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function padding(value: unknown, fallback: Padding): Padding {
  const record = asRecord(value)
  return {
    top: int(record.top, fallback.top ?? 0, 0, 200),
    right: int(record.right, fallback.right ?? 0, 0, 200),
    bottom: int(record.bottom, fallback.bottom ?? 0, 0, 200),
    left: int(record.left, fallback.left ?? 0, 0, 200),
  }
}

function shadow(value: unknown): Shadow | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = asRecord(value)
  return {
    enabled: bool(record.enabled, false),
    color: cssHex(record.color, '#000000'),
    blur: int(record.blur, 0, 0, 100),
    spread: int(record.spread, 0, 0, 100),
    offset_x: int(record.offset_x, 0, -100, 100),
    offset_y: int(record.offset_y, 0, -100, 100),
    opacity: float(record.opacity, 0, 0, 1),
  }
}

function links(value: unknown): Link[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, MAX_LINKS).map((link) => {
    const record = asRecord(link)
    return { label: text(record.label, 200), url: authorUrl(record.url) }
  })
}

function normalizeMasthead(value: unknown): Masthead {
  const record = asRecord(value)
  const masthead: Masthead = {
    banner_url: authorUrl(record.banner_url),
    banner_alt: text(record.banner_alt, 300),
    banner_align: align(record.banner_align, 'center'),
    banner_padding: padding(record.banner_padding, { top: 20, right: 0, bottom: 0, left: 0 }),
    title: text(record.title, 300),
    tagline: text(record.tagline, 500),
    preheader: text(record.preheader, 300),
    hero_show: bool(record.hero_show, true),
    hero_link: authorUrl(record.hero_link),
  }
  return masthead
}

function normalizeLayout(value: unknown): SectionLayout {
  const record = asRecord(value)
  return {
    padding_top: int(record.padding_top, 18, 0, 200),
    padding_bottom: int(record.padding_bottom, 28, 0, 200),
    background_color: optionalCssHex(record.background_color),
    border_radius: int(record.border_radius, 0, 0, 100),
    divider_enabled: bool(record.divider_enabled, true),
    divider_thickness: int(record.divider_thickness, 2, 0, 20),
    divider_color: optionalCssHex(record.divider_color, '#e0e0e0') || undefined,
    divider_spacing: int(record.divider_spacing, 24, 0, 200),
    divider_margin_top: record.divider_margin_top === undefined ? undefined : int(record.divider_margin_top, 0, 0, 200),
    divider_margin_bottom:
      record.divider_margin_bottom === undefined ? undefined : int(record.divider_margin_bottom, 0, 0, 200),
    title_align: align(record.title_align, 'left'),
    padding_text: record.padding_text ? padding(record.padding_text, { top: 20, right: 20, bottom: 20, left: 20 }) : undefined,
    padding_image: record.padding_image
      ? padding(record.padding_image, { top: 20, right: 15, bottom: 20, left: 0 })
      : undefined,
  }
}

function normalizeCard(value: unknown): Card | null {
  const record = asRecord(value)
  const type = record.type
  if (!CARD_TYPES.has(String(type))) return null
  const body = sanitizeRichHtml(text(record.body_html, MAX_BODY_HTML))
  const shared = {
    body_html: body,
    links: links(record.links),
    spacing_bottom: record.spacing_bottom === undefined ? undefined : int(record.spacing_bottom, 20, 0, 200),
    background_color: record.background_color === undefined ? undefined : optionalCssHex(record.background_color, '#f9f9f9'),
    padding: record.padding ? padding(record.padding, { top: 20, right: 20, bottom: 20, left: 20 }) : undefined,
    border_width: record.border_width === undefined ? undefined : int(record.border_width, 0, 0, 20),
    border_color: record.border_color === undefined ? undefined : cssHex(record.border_color, '#e0e0e0'),
    border_radius: record.border_radius === undefined ? undefined : int(record.border_radius, 0, 0, 100),
    table_border_style: TABLE_BORDERS.has(record.table_border_style as string)
      ? (record.table_border_style as 'none' | 'light' | 'medium' | 'bold')
      : undefined,
    table_border_color: record.table_border_color === undefined ? undefined : cssHex(record.table_border_color, '#e0e0e0'),
    table_font_size: record.table_font_size === undefined ? undefined : int(record.table_font_size, 16, 8, 32),
    table_header_bg_color:
      record.table_header_bg_color === undefined ? undefined : cssHex(record.table_header_bg_color, '#f5f5f5'),
    table_header_underline:
      record.table_header_underline === undefined ? undefined : int(record.table_header_underline, 0, 0, 12),
    table_header_underline_color:
      record.table_header_underline_color === undefined
        ? undefined
        : cssHex(record.table_header_underline_color, '#e0e0e0'),
  }
  if (type === 'letter') {
    return {
      type: 'letter',
      ...shared,
      greeting: text(record.greeting, 300),
      closing: text(record.closing, 300),
      signature_name: text(record.signature_name, 200),
      signature_lines: Array.isArray(record.signature_lines)
        ? record.signature_lines.slice(0, 8).map((line) => text(line, 200))
        : [],
      signature_image_url: authorUrl(record.signature_image_url),
      signature_image_alt: text(record.signature_image_alt, 300),
      signature_image_width: int(record.signature_image_width, 220, 40, 600),
    }
  }
  const titled = {
    ...shared,
    title: text(record.title, 300),
    location: text(record.location, 300),
    date: text(record.date, 200),
    time: text(record.time, 200),
  }
  if (type === 'resource') {
    return {
      type: 'resource',
      ...titled,
      show_icon: bool(record.show_icon, false),
      icon_url: authorUrl(record.icon_url),
      icon_alt: text(record.icon_alt, 300),
      icon_size: int(record.icon_size, 28, 8, 128),
    }
  }
  if (type === 'cta') {
    return {
      type: 'cta',
      title: titled.title,
      body_html: shared.body_html,
      links: shared.links,
      spacing_bottom: shared.spacing_bottom,
      background_color: shared.background_color,
      padding: shared.padding,
      border_width: shared.border_width,
      border_color: shared.border_color,
      border_radius: shared.border_radius,
      table_border_style: shared.table_border_style,
      table_border_color: shared.table_border_color,
      table_font_size: shared.table_font_size,
      table_header_bg_color: shared.table_header_bg_color,
      table_header_underline: shared.table_header_underline,
      table_header_underline_color: shared.table_header_underline_color,
      button_style: BUTTON_STYLES.has(record.button_style as string)
        ? (record.button_style as NonNullable<Extract<Card, { type: 'cta' }>['button_style']>)
        : 'button',
      button_bg_color: cssHex(record.button_bg_color, '#A60F2D'),
      button_text_color: cssHex(record.button_text_color, '#ffffff'),
      button_padding_vertical: int(record.button_padding_vertical, 12, 0, 80),
      button_padding_horizontal: int(record.button_padding_horizontal, 32, 0, 80),
      button_border_width: int(record.button_border_width, 0, 0, 20),
      button_border_color: cssHex(record.button_border_color, '#8c0d25'),
      button_border_style: BORDER_STYLES.has(record.button_border_style as string)
        ? (record.button_border_style as 'solid' | 'dashed' | 'dotted' | 'double')
        : 'solid',
      button_border_radius: int(record.button_border_radius, 10, 0, 100),
      button_alignment: align(record.button_alignment, 'center'),
      button_full_width: bool(record.button_full_width, false),
      button_shadow: shadow(record.button_shadow),
      button_font_weight: FONT_WEIGHTS.has(record.button_font_weight as string)
        ? (record.button_font_weight as 'normal' | 'bold' | '600' | '700')
        : 'bold',
      button_text_transform: TRANSFORMS.has(record.button_text_transform as string)
        ? (record.button_text_transform as 'none' | 'uppercase' | 'lowercase' | 'capitalize')
        : 'none',
      button_letter_spacing: int(record.button_letter_spacing, 0, -2, 12),
      button_font_size: int(record.button_font_size, 16, 8, 32),
      text_alignment: align(record.text_alignment, 'left'),
    }
  }
  if (type === 'event') return { type: 'event', ...titled }
  return { type: 'standard', ...titled }
}

function normalizeSections(value: unknown): Section[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, MAX_SECTIONS).map((section, index) => {
    const record = asRecord(section)
    const closures: Closure[] = Array.isArray(record.closures)
      ? record.closures.slice(0, 40).map((closure) => {
          const item = asRecord(closure)
          return { date: text(item.date, 100), reason: text(item.reason, 300) }
        })
      : []
    const cards = Array.isArray(record.cards)
      ? record.cards
          .slice(0, MAX_CARDS)
          .map((card) => normalizeCard(card))
          .filter((card): card is Card => card !== null)
      : []
    return {
      key: text(record.key, 80) || `section-${index + 1}`,
      title: text(record.title, 300),
      layout: normalizeLayout(record.layout),
      cards,
      closures: closures.length > 0 ? closures : undefined,
    }
  })
}

function normalizeFooter(value: unknown): Footer {
  const record = asRecord(value)
  const social: SocialLink[] = Array.isArray(record.social)
    ? record.social.slice(0, 20).map((link) => {
        const item = asRecord(link)
        return {
          platform: text(item.platform, 80),
          url: authorUrl(item.url),
          icon: authorUrl(item.icon),
          alt: text(item.alt, 200),
        }
      })
    : []
  return {
    address_lines: Array.isArray(record.address_lines)
      ? record.address_lines.slice(0, 8).map((line) => text(line, 200))
      : [],
    social,
    background_color: record.background_color === undefined ? undefined : cssHex(record.background_color, '#2A3033'),
    text_color: record.text_color === undefined ? undefined : cssHex(record.text_color, '#cccccc'),
    link_color: record.link_color === undefined ? undefined : cssHex(record.link_color, '#ffffff'),
    padding_top: record.padding_top === undefined ? undefined : int(record.padding_top, 60, 0, 200),
    padding_bottom: record.padding_bottom === undefined ? undefined : int(record.padding_bottom, 30, 0, 200),
    social_margin_top: record.social_margin_top === undefined ? undefined : int(record.social_margin_top, 40, 0, 200),
    social_margin_bottom:
      record.social_margin_bottom === undefined ? undefined : int(record.social_margin_bottom, 20, 0, 200),
  }
}

function normalizeTypography(value: unknown): Typography {
  const record = asRecord(value)
  const family = text(record.font_family, 120)
  return {
    font_family: FONT_FAMILIES.has(family) ? family : 'Arial, Helvetica, sans-serif',
    h2_size: int(record.h2_size, 22, 8, 72),
    h2_line_height: float(record.h2_line_height, 1.3, 0.8, 3),
    h3_size: int(record.h3_size, 18, 8, 72),
    h3_line_height: float(record.h3_line_height, 1.3, 0.8, 3),
    body_size: int(record.body_size, 16, 8, 72),
    body_line_height: float(record.body_line_height, 1.6, 0.8, 3),
    meta_size: int(record.meta_size, 15, 8, 72),
    meta_line_height: float(record.meta_line_height, 1.7, 0.8, 3),
  }
}

function normalizeColors(value: unknown): Colors {
  const record = asRecord(value)
  return {
    primary: cssHex(record.primary, '#A60F2D'),
    text_dark: cssHex(record.text_dark, '#2A3033'),
    text_body: cssHex(record.text_body, '#333333'),
    text_muted: cssHex(record.text_muted, '#5E6A71'),
  }
}

function normalizeSettings(value: unknown): Settings {
  const record = asRecord(value)
  return {
    container_width: int(record.container_width, 640, 320, 800),
    section_spacing: int(record.section_spacing, 24, 0, 200),
    show_section_borders: bool(record.show_section_borders, true),
    padding_text: padding(record.padding_text, { top: 20, right: 20, bottom: 20, left: 20 }),
    padding_image: padding(record.padding_image, { top: 20, right: 15, bottom: 20, left: 0 }),
    typography: normalizeTypography(record.typography),
    colors: normalizeColors(record.colors),
    card_border_radius:
      record.card_border_radius === undefined ? undefined : int(record.card_border_radius, 0, 0, 100),
    accent_bar_enabled: record.accent_bar_enabled === undefined ? undefined : bool(record.accent_bar_enabled, true),
    accent_bar_width: record.accent_bar_width === undefined ? undefined : int(record.accent_bar_width, 4, 0, 24),
    accent_bar_color: record.accent_bar_color === undefined ? undefined : cssHex(record.accent_bar_color, '#A60F2D'),
    accent_bar_shadow: shadow(record.accent_bar_shadow),
    card_shadow: shadow(record.card_shadow),
    divider_margin_top:
      record.divider_margin_top === undefined ? undefined : int(record.divider_margin_top, 0, 0, 200),
    divider_margin_bottom:
      record.divider_margin_bottom === undefined ? undefined : int(record.divider_margin_bottom, 0, 0, 200),
    divider_color: record.divider_color === undefined ? undefined : cssHex(record.divider_color, '#e0e0e0'),
    card_spacing: record.card_spacing === undefined ? undefined : int(record.card_spacing, 20, 0, 200),
  }
}
