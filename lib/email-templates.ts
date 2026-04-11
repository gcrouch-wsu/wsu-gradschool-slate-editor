// email-templates.ts - HTML generation for WSU newsletters

import {
  STYLE_TABLE,
  STYLE_IMAGE,
  STYLE_LINK,
  STYLE_H2,
  STYLE_H3,
  STYLE_BODY_TEXT,
  STYLE_META,
  STYLE_LOCATION_LABEL,
  STYLE_CARD_BODY,
  STYLE_RESET,
  STYLE_SOCIAL_ICON_CELL,
  EMAIL_CSS,
  CRIMSON,
  TEXT_MUTED,
  TEXT_DARK,
  TEXT_BODY,
  BG_LIGHT,
  BG_CARD,
  BG_WHITE,
  BORDER_LIGHT,
  BORDER_MEDIUM,
} from './styles'
import { SLATE_VARIABLES } from './config'
import type {
  NewsletterData,
  Masthead,
  Section,
  SectionLayout,
  Card,
  Footer,
  Settings,
  Padding,
  Shadow,
  StandardCard,
  EventCard,
  ResourceCard,
  CTACard,
  LetterCard,
  Closure,
} from '@/types/newsletter'

/**
 * Escapes HTML special characters to prevent XSS attacks and ensure valid HTML.
 * 
 * Converts: & < > " ' to their HTML entity equivalents.
 * This is critical for user-generated content that will be rendered in emails.
 * 
 * @param text - Text to escape (can be null or undefined)
 * @returns Escaped HTML string (empty string if input is null/undefined)
 */
function esc(text: string | null | undefined): string {
  if (text == null) return ''
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return String(text).replace(/[&<>"']/g, (m) => map[m])
}

/**
 * Generates box-shadow CSS from Shadow object
 */
function generateShadowCSS(shadow: Shadow | undefined): string {
  if (!shadow || !shadow.enabled) {
    return ''
  }

  const { color, blur, spread, offset_x, offset_y, opacity } = shadow
  const rgba = hexToRGBA(color, opacity)
  return `box-shadow: ${offset_x}px ${offset_y}px ${blur}px ${spread}px ${rgba};`
}

/**
 * Converts hex color to RGBA with opacity
 */
function hexToRGBA(hex: string, opacity: number): string {
  // Remove # if present
  hex = hex.replace('#', '')

  // Parse hex values
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)

  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}

/**
 * Gets accent bar style from settings
 */
function getAccentBarStyle(settings: Settings | null): string {
  if (!settings) {
    return `width:4px; background-color:${CRIMSON};`
  }

  const enabled = settings.accent_bar_enabled !== false
  if (!enabled) {
    return 'width:0; display:none;'
  }

  const width = settings.accent_bar_width || 4
  const color = settings.accent_bar_color || CRIMSON
  const shadowCSS = generateShadowCSS(settings.accent_bar_shadow)

  return `width:${width}px; background-color:${color}; ${shadowCSS}`
}

/**
 * Processes rich text HTML to add email-compatible table styles.
 * 
 * Email clients have limited CSS support and strip out <style> tags, so all styles
 * must be inline. This function wraps table content in email-safe table structures
 * and applies inline styles for borders, fonts, and formatting.
 * 
 * Also processes list styles via processListStyles() to preserve editor-applied
 * line-height and margin-bottom values.
 * 
 * @param html - Rich text HTML from Tiptap editor
 * @param tableOptions - Optional styling options for tables
 * @returns HTML string with email-safe inline styles
 */
function processBodyHtmlForEmail(
  html: string,
  tableOptions?: {
    borderStyle?: 'none' | 'light' | 'medium' | 'bold'
    borderColor?: string
    fontSize?: number
    headerBgColor?: string
    headerUnderline?: number
    headerUnderlineColor?: string
  }
): string {
  if (!html || !html.includes('<table')) {
    return html
  }

  // Default values
  const borderStyle = tableOptions?.borderStyle || 'light'
  const borderColor = tableOptions?.borderColor || BORDER_MEDIUM
  const fontSize = tableOptions?.fontSize || 16
  const headerBgColor = tableOptions?.headerBgColor || BG_LIGHT
  const headerUnderline = tableOptions?.headerUnderline || 0
  const headerUnderlineColor = tableOptions?.headerUnderlineColor || borderColor

  // Calculate border width based on style
  const borderWidth =
    borderStyle === 'none'
      ? 0
      : borderStyle === 'light'
        ? 1
        : borderStyle === 'medium'
          ? 2
          : 3

  // Add styles to tables, table rows, and table cells
  let processed = html

  // Style tables: add border-collapse, width, and email-safe attributes
  const tableBorderStyle =
    borderWidth > 0 ? `border:${borderWidth}px solid ${borderColor};` : ''
  processed = processed.replace(
    /<table([^>]*)>/gi,
    (match, attrs) => {
      // Check if style already exists
      if (attrs.includes('style=')) {
        // Add to existing style
        return match.replace(
          /style="([^"]*)"/i,
          (styleMatch, existingStyle) => {
            const newStyle = `${existingStyle}; ${STYLE_TABLE} ${tableBorderStyle} width:100%; max-width:100%;`
            return `style="${newStyle}"`
          }
        )
      } else {
        // Add new style attribute
        const newStyle = `${STYLE_TABLE} ${tableBorderStyle} width:100%; max-width:100%;`
        return `<table style="${newStyle}"${attrs}>`
      }
    }
  )

  // Style table cells (td): add padding and borders with font size
  const cellBorderStyle =
    borderWidth > 0 ? `border:${borderWidth}px solid ${borderColor};` : ''
  const cellStyle = `${cellBorderStyle} padding:8px; vertical-align:top; font-size:${fontSize}px;`
  processed = processed.replace(
    /<td([^>]*)>/gi,
    (match, attrs) => {
      if (attrs.includes('style=')) {
        // Add to existing style
        return match.replace(
          /style="([^"]*)"/i,
          (styleMatch, existingStyle) => {
            const newStyle = `${existingStyle}; ${cellStyle}`
            return `style="${newStyle}"`
          }
        )
      } else {
        // Add new style attribute
        return `<td style="${cellStyle}"${attrs}>`
      }
    }
  )

  // Style table headers (th): add padding, borders, background color, and underline
  const headerBorderStyle =
    borderWidth > 0 ? `border:${borderWidth}px solid ${borderColor};` : ''
  const headerUnderlineStyle =
    headerUnderline > 0
      ? `border-bottom:${headerUnderline}px solid ${headerUnderlineColor};`
      : ''
  const headerStyle = `${headerBorderStyle} padding:8px; vertical-align:top; background-color:${headerBgColor}; font-weight:bold; font-size:${fontSize}px; ${headerUnderlineStyle}`
  processed = processed.replace(
    /<th([^>]*)>/gi,
    (match, attrs) => {
      if (attrs.includes('style=')) {
        // Add to existing style
        return match.replace(
          /style="([^"]*)"/i,
          (styleMatch, existingStyle) => {
            const newStyle = `${existingStyle}; ${headerStyle}`
            return `style="${newStyle}"`
          }
        )
      } else {
        // Add new style attribute
        return `<th style="${headerStyle}"${attrs}>`
      }
    }
  )

  return processed
}

/**
 * Hidden preheader text for email clients
 */
export function renderPreheader(text: string): string {
  return `<div style="display:none; font-size:1px; color:#ffffff; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden;">
${esc(text)}
</div>`
}

/**
 * Fixed 'View in Browser' link (Slate variable)
 */
export function renderViewInBrowser(): string {
  const href = SLATE_VARIABLES.view_in_browser || 'browser'
  return `<table cellpadding="0" cellspacing="0" role="presentation" width="100%" style="${STYLE_TABLE} background-color:${BG_LIGHT};">
  <tr>
    <td align="center" style="padding:12px 0; background-color:${BG_LIGHT};">
      <table cellpadding="0" cellspacing="0" role="presentation" width="600" class="container" style="${STYLE_TABLE}">
        <tr>
          <td style="text-align:center; font-size:13px; color:${TEXT_MUTED};">
            <a href="${href}" style="${STYLE_LINK}">View in Browser</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`
}

/**
 * Newsletter masthead with banner, title, tagline, optional hero link
 */
export function renderMasthead(data: Masthead, containerWidth = 640): string {
  const bannerUrl = data.banner_url || ''
  const bannerAlt = data.banner_alt || ''
  const bannerAlign = data.banner_align || 'center'
  const bannerPadding = data.banner_padding || {
    top: 20,
    right: 0,
    bottom: 0,
    left: 0,
  }
  const paddingStr = `${bannerPadding.top}px ${bannerPadding.right}px ${bannerPadding.bottom}px ${bannerPadding.left}px`
  const title = data.title || ''
  const tagline = data.tagline || ''
  const heroShow = data.hero_show !== false
  const heroLink = data.hero_link || ''

  // Build banner HTML
  let bannerHtml = ''
  if (heroShow && bannerUrl) {
    const imgTag = `<img src="${esc(bannerUrl)}" alt="${esc(bannerAlt)}" width="450" style="${STYLE_IMAGE} width:100%; max-width:450px; display:inline-block;" />`

    if (heroLink) {
      bannerHtml = `<a href="${esc(heroLink)}">${imgTag}</a>`
    } else {
      bannerHtml = imgTag
    }
  }

  return `<table cellpadding="0" cellspacing="0" role="presentation" width="100%" style="${STYLE_TABLE} background-color:${BG_LIGHT};">
  <tr>
    <td align="center">
      <table cellpadding="0" cellspacing="0" role="presentation" width="${containerWidth}" class="container" style="${STYLE_TABLE} background-color:${BG_WHITE}; border-left:1px solid ${BORDER_MEDIUM}; border-right:1px solid ${BORDER_MEDIUM}; border-top:1px solid ${BORDER_MEDIUM};">
        <tr>
          <td style="padding:${paddingStr}; text-align:${bannerAlign}; background-color:${BG_WHITE};">
            ${bannerHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px 4px; font-size:13px; line-height:1.2; color:${TEXT_MUTED}; text-transform:uppercase; letter-spacing:0.35em; text-align:center;">
            ${esc(title)}
          </td>
        </tr>
        <tr>
          <td style="padding:0 24px 12px; font-size:14px; line-height:1.5; color:${TEXT_MUTED}; text-align:center;">
            <em>${esc(tagline)}</em>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`
}

/**
 * Section wrapper with heading - V7: ADDED TITLE ALIGNMENT
 */
export function renderSectionStart(
  title: string,
  layout: SectionLayout | null = null,
  showBorder = true,
  isLast = false
): string {
  if (!layout) {
    layout = {
      padding_top: 18,
      padding_bottom: 28,
      background_color: '',
      border_radius: 0,
      divider_enabled: true,
      divider_thickness: 2,
      divider_color: BORDER_LIGHT,
      divider_spacing: 24,
      title_align: 'left',
    }
  }

  const spacing = layout.divider_spacing || 24
  let titleAlign = layout.title_align || 'left'
  const paddingTop = layout.padding_top || 18
  const paddingBottom = layout.padding_bottom || 28
  const bgColor = layout.background_color || ''
  const borderRadius = layout.border_radius || 0
  const dividerEnabled = layout.divider_enabled !== false
  const dividerThickness = layout.divider_thickness || 2
  const dividerColor = layout.divider_color || BORDER_LIGHT

  // Validate title_align
  if (!['left', 'center', 'right'].includes(titleAlign)) {
    titleAlign = 'left'
  }

  // Hide border on last section
  let border = ''
  if (showBorder && dividerEnabled && !isLast) {
    border = `border-bottom:${dividerThickness}px solid ${dividerColor};`
  }

  // Build container style
  let containerStyle = `${STYLE_TABLE} padding-top:${paddingTop}px; padding-bottom:${paddingBottom}px; ${border}`
  if (bgColor) {
    containerStyle += ` background-color:${bgColor};`
  }
  if (borderRadius > 0) {
    containerStyle += ` border-radius:${borderRadius}px;`
  }

  // If title is empty, don't render H2
  if (!title || !title.trim()) {
    return `<table cellpadding="0" cellspacing="0" role="presentation" width="100%" style="${containerStyle}">
  <tr>
    <td>`
  }

  // H2 style with spacing and alignment
  const h2Style = `${STYLE_H2} margin-top:${spacing}px; text-align:${titleAlign};`

  return `<table cellpadding="0" cellspacing="0" role="presentation" width="100%" style="${containerStyle}">
  <tr>
    <td>
      <h2 style="${h2Style}">${esc(title)}</h2>`
}

/**
 * Close section wrapper
 */
export function renderSectionEnd(): string {
  return `    </td>
  </tr>
</table>`
}

/**
 * Render location/date/time meta block (only if data exists)
 */
function renderCardMeta(card: Card): string {
  const metaItems: string[] = []

  if ('location' in card && card.location) {
    metaItems.push(`<strong>Location:</strong> ${esc(card.location)}`)
  }

  if ('date' in card && card.date) {
    metaItems.push(`<strong>Date:</strong> ${esc(card.date)}`)
  }

  if ('time' in card && card.time) {
    metaItems.push(`<strong>Time:</strong> ${esc(card.time)}`)
  }

  if (metaItems.length === 0) {
    return ''
  }

  return `<p style="${STYLE_META}">${metaItems.join('<br />')}</p>`
}

/**
 * Render multiple links - bullets if 2+, pipes if 1
 */
function renderCardLinks(card: Card): string {
  const links = card.links || []
  if (links.length === 0) {
    return ''
  }

  const linkHtml: string[] = []
  for (const link of links) {
    const label = (link.label || '').trim()
    const url = (link.url || '').trim()
    if (label && url) {
      linkHtml.push(
        `<a href="${esc(url)}" style="${STYLE_LINK}">${esc(label)}</a>`
      )
    }
  }

  if (linkHtml.length === 0) {
    return ''
  }

  // Use bullets if 2+ links, otherwise pipes
  if (linkHtml.length >= 2) {
    const items = linkHtml.map((link) => `<li>${link}</li>`).join('')
    return `<ul style="margin: 8px 0 0 0; padding-left: 20px; font-size: 14px; line-height: 1.8;">${items}</ul>`
  } else {
    return linkHtml.join(' | ')
  }
}

/**
 * Build card style with per-card customization and global shadow support
 */
function getCardStyle(card: Card, settings: Settings | null = null): string {
  const bgColor = card.background_color || '#f9f9f9'

  // Use global card_spacing as default, allow per-card override
  const globalSpacing = settings?.card_spacing !== undefined ? settings.card_spacing : 20
  const spacingBottom = card.spacing_bottom !== undefined ? card.spacing_bottom : globalSpacing

  const borderWidth = card.border_width || 0
  const borderColor = card.border_color || '#e0e0e0'

  // Use global card_border_radius as default, allow per-card override
  const globalRadius = settings?.card_border_radius || 0
  const borderRadius = card.border_radius !== undefined ? card.border_radius : globalRadius

  let style = `${STYLE_TABLE} background-color:${bgColor}; margin-bottom:${spacingBottom}px;`

  if (borderWidth > 0) {
    style += ` border:${borderWidth}px solid ${borderColor};`
  }

  if (borderRadius > 0) {
    style += ` border-radius:${borderRadius}px;`
  }

  // Apply global card shadow if enabled
  if (settings?.card_shadow) {
    const shadowCSS = generateShadowCSS(settings.card_shadow)
    if (shadowCSS) {
      style += ` ${shadowCSS}`
    }
  }

  return style
}

/**
 * Get card padding with proper cascading - ALWAYS returns complete dict
 */
function getCardPadding(
  card: Card,
  section: Section | null = null,
  settings: Settings | null = null
): Padding {
  // Default fallback - ALWAYS has all 4 keys
  const defaultPadding: Padding = { top: 20, right: 20, bottom: 20, left: 20 }

  // Start with defaults, then override with more specific values
  const result: Padding = { ...defaultPadding }

  // 1. Apply global settings first (text or image depending on card type)
  if (card.type === 'resource' && 'show_icon' in card && card.show_icon) {
    // Resource cards with icons use padding_image
    if (settings?.padding_image) {
      Object.assign(result, settings.padding_image)
    }
  } else {
    // All other cards use padding_text
    if (settings?.padding_text) {
      Object.assign(result, settings.padding_text)
    }
  }

  // 2. Apply section-level overrides (if set)
  if (section) {
    let sectionPadding: Partial<Padding> = {}
    if (
      card.type === 'resource' &&
      'show_icon' in card &&
      card.show_icon &&
      section.layout.padding_image
    ) {
      sectionPadding = section.layout.padding_image
    } else if (section.layout.padding_text) {
      sectionPadding = section.layout.padding_text
    }

    if (sectionPadding) {
      Object.assign(result, sectionPadding)
    }
  }

  // 3. Apply card-level overrides (highest priority)
  if (card.padding) {
    Object.assign(result, card.padding)
  }

  // Ensure all values are integers
  for (const key of ['top', 'right', 'bottom', 'left'] as const) {
    if (key in result) {
      const value = result[key]
      result[key] = typeof value === 'number' ? value : 0
    } else {
      result[key] = 0
    }
  }

  return result
}

/**
 * Standard card with accent bar, title, body, meta, links
 */
function renderStandardCard(
  card: StandardCard,
  section: Section | null = null,
  settings: Settings | null = null
): string {
  const title = card.title || ''
  const bodyHtml = card.body_html || ''

  // Get card style and padding
  const cardStyle = getCardStyle(card, settings)
  const padding = getCardPadding(card, section, settings)
  const paddingStyle = `padding:${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px;`

  // Get dynamic accent bar style
  const accentBarStyle = getAccentBarStyle(settings)

  // Build card content
  const contentParts: string[] = []

  // Title
  if (title) {
    contentParts.push(`<h3 style="${STYLE_H3}">${esc(title)}</h3>`)
  }

  // Body (allow raw HTML from rich text editor)
  if (bodyHtml) {
    const processedBody = processBodyHtmlForEmail(bodyHtml, {
      borderStyle: card.table_border_style,
      borderColor: card.table_border_color,
      fontSize: card.table_font_size,
      headerBgColor: card.table_header_bg_color,
      headerUnderline: card.table_header_underline,
      headerUnderlineColor: card.table_header_underline_color,
    })
    contentParts.push(`<div style="${STYLE_BODY_TEXT}">${processedBody}</div>`)
  }

  // Meta (location/date/time)
  const meta = renderCardMeta(card)
  if (meta) {
    contentParts.push(meta)
  }

  // Links
  const links = renderCardLinks(card)
  if (links) {
    contentParts.push(links)
  }

  const content = contentParts.join('\n')

  return `<table cellpadding="0" cellspacing="0" role="presentation" width="100%" style="${cardStyle}">
  <tr>
    <td style="${accentBarStyle}"></td>
    <td style="${paddingStyle}">
      ${content}
    </td>
  </tr>
</table>`
}

/**
 * Event card with location label at top
 */
function renderEventCard(
  card: EventCard,
  section: Section | null = null,
  settings: Settings | null = null
): string {
  const title = card.title || ''
  const bodyHtml = card.body_html || ''
  const location = card.location || ''

  // Get card style and padding
  const cardStyle = getCardStyle(card, settings)
  const padding = getCardPadding(card, section, settings)
  const paddingStyle = `padding:${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px;`

  // Get dynamic accent bar style
  const accentBarStyle = getAccentBarStyle(settings)

  const contentParts: string[] = []

  // Location label (prominent at top for events)
  if (location) {
    contentParts.push(
      `<p style="${STYLE_LOCATION_LABEL}">${esc(location)}</p>`
    )
  }

  // Title
  if (title) {
    contentParts.push(`<h3 style="${STYLE_H3}">${esc(title)}</h3>`)
  }

  // Body
  if (bodyHtml) {
    contentParts.push(`<div style="${STYLE_BODY_TEXT}">${bodyHtml}</div>`)
  }

  // Date/Time meta (without location since it's already shown)
  const metaItems: string[] = []
  if (card.date) {
    metaItems.push(esc(card.date))
  }
  if (card.time) {
    metaItems.push(esc(card.time))
  }

  if (metaItems.length > 0) {
    contentParts.push(
      `<p style="${STYLE_META}">${metaItems.join('<br />')}</p>`
    )
  }

  // Links
  const links = renderCardLinks(card)
  if (links) {
    contentParts.push(links)
  }

  const content = contentParts.join('\n')

  return `<table cellpadding="0" cellspacing="0" role="presentation" width="100%" style="${cardStyle}">
  <tr>
    <td style="${accentBarStyle}"></td>
    <td style="${paddingStyle}">
      ${content}
    </td>
  </tr>
</table>`
}

/**
 * Resource card with optional icon
 */
function renderResourceCard(
  card: ResourceCard,
  section: Section | null = null,
  settings: Settings | null = null
): string {
  const title = card.title || ''
  const bodyHtml = card.body_html || ''
  const showIcon = card.show_icon || false
  const iconUrl = card.icon_url || ''
  const iconAlt = card.icon_alt || ''
  const iconSize = card.icon_size || 80

  // Get card style and padding
  const cardStyle = getCardStyle(card, settings)
  const padding = getCardPadding(card, section, settings)

  // Build text content
  const textParts: string[] = []
  if (title) {
    textParts.push(`<h3 style="${STYLE_H3}">${esc(title)}</h3>`)
  }
  if (bodyHtml) {
    textParts.push(`<div style="${STYLE_BODY_TEXT}">${bodyHtml}</div>`)
  }

  const meta = renderCardMeta(card)
  if (meta) {
    textParts.push(meta)
  }

  const links = renderCardLinks(card)
  if (links) {
    textParts.push(links)
  }

  const textContent = textParts.join('\n')

  // If icon enabled and URL provided
  if (showIcon && iconUrl) {
    // Apply padding once to outer cell only
    const paddingStyle = `padding:${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px;`

    const iconStyle = `width:${iconSize}px; height:${iconSize}px; border-radius:6px; ${STYLE_IMAGE}`

    // Icon cell: fixed width, right spacing for gap
    const iconCellStyle = `width:${iconSize}px; padding-right:15px; vertical-align:middle; text-align:center;`

    // Text cell: just vertical alignment, no padding (outer cell handles it)
    const textCellStyle = 'vertical-align:middle;'

    const iconHtml = `<img src="${esc(iconUrl)}" alt="${esc(iconAlt)}" width="${iconSize}" height="${iconSize}" style="${iconStyle}" />`

    return `<table cellpadding="0" cellspacing="0" role="presentation" width="100%" style="${cardStyle}">
  <tr>
    <td style="${paddingStyle}">
      <table cellpadding="0" cellspacing="0" role="presentation" width="100%" style="${STYLE_TABLE}">
        <tr>
          <td style="${iconCellStyle}">
            ${iconHtml}
          </td>
          <td style="${textCellStyle}">
            ${textContent}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`
  } else {
    // No icon, render as standard card without accent bar
    const paddingStyle = `padding:${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px;`
    return `<table cellpadding="0" cellspacing="0" role="presentation" width="100%" style="${cardStyle}">
  <tr>
    <td style="${paddingStyle}">
      ${textContent}
    </td>
  </tr>
</table>`
  }
}

/**
 * Letter-style card for presidential updates
 */
function renderLetterCard(
  card: LetterCard,
  section: Section | null = null,
  settings: Settings | null = null
): string {
  const greeting = (card.greeting || '').trim()
  const bodyHtml = card.body_html || ''
  const closing = (card.closing || '').trim()
  const signatureName = (card.signature_name || '').trim()
  const signatureLines = card.signature_lines || []
  const signatureImageUrl = (card.signature_image_url || '').trim()
  const signatureImageAlt = (card.signature_image_alt || 'Signature').trim()
  const signatureImageWidth = card.signature_image_width || 220

  const cardStyle = getCardStyle(card, settings)
  const padding = getCardPadding(card, section, settings)
  const paddingStyle = `padding:${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px;`

  const contentParts: string[] = []

  if (greeting) {
    contentParts.push(
      `<p style="${STYLE_BODY_TEXT} margin:0 0 18px 0; font-weight:normal;">${esc(greeting)}</p>`
    )
  }

  if (bodyHtml) {
    const processedBody = processBodyHtmlForEmail(bodyHtml, {
      borderStyle: card.table_border_style,
      borderColor: card.table_border_color,
      fontSize: card.table_font_size,
      headerBgColor: card.table_header_bg_color,
      headerUnderline: card.table_header_underline,
      headerUnderlineColor: card.table_header_underline_color,
    })
    contentParts.push(
      `<div style="font-size:16px; line-height:1.6; color:${TEXT_BODY}; margin:0 0 18px 0;">${processedBody}</div>`
    )
  }

  if (closing) {
    contentParts.push(
      `<p style="${STYLE_BODY_TEXT} margin:24px 0 8px 0; font-weight:normal;">${esc(closing)}</p>`
    )
  }

  if (signatureImageUrl) {
    contentParts.push(
      `<p style="margin:0 0 12px 0;">
        <img src="${esc(signatureImageUrl)}" alt="${esc(signatureImageAlt)}" width="${signatureImageWidth}" 
        style="${STYLE_IMAGE} width:${signatureImageWidth}px; max-width:100%; height:auto; display:block;" />
      </p>`
    )
  }

  if (signatureName) {
    contentParts.push(
      `<p style="${STYLE_BODY_TEXT} margin:0 0 4px 0; font-weight:bold;">${esc(signatureName)}</p>`
    )
  }

  for (const line of signatureLines) {
    if (line.trim()) {
      contentParts.push(
        `<p style="${STYLE_BODY_TEXT} margin:0 0 4px 0; font-weight:normal;">${esc(line)}</p>`
      )
    }
  }

  const linksHtml = renderCardLinks(card)
  if (linksHtml) {
    contentParts.push(
      `<div style="margin-top:18px; font-size:14px; line-height:1.6;">${linksHtml}</div>`
    )
  }

  const content = contentParts.join('\n')

  return `<table cellpadding="0" cellspacing="0" role="presentation" width="100%" style="${cardStyle}">
  <tr>
    <td style="${paddingStyle}">
      ${content}
    </td>
  </tr>
</table>`
}

/**
 * Special closures list format
 */
function renderClosuresSection(closures: Closure[]): string {
  if (!closures || closures.length === 0) {
    return ''
  }

  const items: string[] = []
  for (const closure of closures) {
    const date = (closure.date || '').trim()
    const reason = (closure.reason || '').trim()
    if (date || reason) {
      items.push(`<li>${esc(date)} – ${esc(reason)}</li>`)
    }
  }

  if (items.length === 0) {
    return ''
  }

  const ulContent = items.join('\n')

  return `<table cellpadding="0" cellspacing="0" role="presentation" width="100%" style="${STYLE_TABLE} background-color:${BG_CARD}; margin-bottom:20px;">
  <tr>
    <td style="${STYLE_CARD_BODY}">
      <ul style="margin:10px 0 0 0; padding:0 0 0 20px; color:${TEXT_BODY}; font-size:16px; line-height:1.6;">
        ${ulContent}
      </ul>
    </td>
  </tr>
</table>`
}

/**
 * Call-to-action box with fully customizable button AND padding
 */
function renderCTABox(
  title: string,
  bodyHtml: string,
  buttonLabel: string,
  buttonUrl: string,
  buttonBgColor = '#A60F2D',
  buttonTextColor = '#ffffff',
  buttonPaddingVertical = 12,
  buttonPaddingHorizontal = 32,
  buttonBorderWidth = 0,
  buttonBorderColor = '#8c0d25',
  buttonBorderRadius = 10,
  buttonAlignment: 'left' | 'center' | 'right' = 'center',
  buttonFullWidth = false,
  card: CTACard | null = null,
  section: Section | null = null,
  settings: Settings | null = null
): string {
  // Get dynamic card style and padding (like other card types)
  let cardStyle: string
  let padding: Padding
  if (card) {
    cardStyle = getCardStyle(card, settings)
    padding = getCardPadding(card, section, settings)
  } else {
    // Fallback for direct calls without card object
    cardStyle = `${STYLE_TABLE} background-color:${BG_CARD}; margin-bottom:20px; border:2px solid ${BORDER_LIGHT}; border-radius:4px;`
    padding = { top: 30, right: 20, bottom: 30, left: 20 }
  }

  const paddingStyle = `padding:${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px;`

  // Build dynamic button style
  const paddingBtn = `${buttonPaddingVertical}px ${buttonPaddingHorizontal}px`

  // Get button style type
  const buttonStyleType = card?.button_style || 'button'

  // Get button style properties from card or use defaults
  const borderStyle = card?.button_border_style || 'solid'
  const border =
    buttonBorderWidth > 0
      ? `${buttonBorderWidth}px ${borderStyle} ${buttonBorderColor}`
      : 'none'
  const width = buttonFullWidth ? '100%' : 'auto'
  const display = buttonFullWidth ? 'block' : 'inline-block'

  // Typography properties
  const fontWeight = card?.button_font_weight || 'bold'
  const textTransform = card?.button_text_transform || 'none'
  const letterSpacing = card?.button_letter_spacing !== undefined ? card.button_letter_spacing : 0
  const fontSize = card?.button_font_size || 16

  // Button shadow
  const buttonShadow = card?.button_shadow ? generateShadowCSS(card.button_shadow) : ''

  // Text alignment (separate from button alignment)
  let textAlignment: 'left' | 'center' | 'right' = 'left'
  if (card && 'text_alignment' in card && card.text_alignment) {
    textAlignment = card.text_alignment
  }
  if (!['left', 'center', 'right'].includes(textAlignment)) {
    textAlignment = 'left'
  }

  // Button alignment wrapper style
  let buttonWrapperStyle = ''
  if (buttonAlignment === 'left') {
    buttonWrapperStyle = 'text-align: left;'
  } else if (buttonAlignment === 'right') {
    buttonWrapperStyle = 'text-align: right;'
  } else {
    buttonWrapperStyle = 'text-align: center;'
  }

  // Generate style based on button_style type
  let buttonStyle = ''
  let buttonContent = buttonLabel

  switch (buttonStyleType) {
    case 'pill':
      // Pill style: highly rounded button
      buttonStyle = `background-color:${buttonBgColor} !important; border-radius:9999px; border:${border}; color:${buttonTextColor} !important; display:${display}; font-weight:${fontWeight}; font-size:${fontSize}px; line-height:20px; text-align:center; text-decoration:none; text-transform:${textTransform}; letter-spacing:${letterSpacing}px; padding:${paddingBtn}; margin-top:24px; margin-bottom:8px; width:${width}; ${buttonShadow}`
      break
    case 'outlined':
      // Outlined: border only, transparent background
      buttonStyle = `background-color:transparent !important; border-radius:${buttonBorderRadius}px; border:2px solid ${buttonBgColor}; color:${buttonBgColor} !important; display:${display}; font-weight:${fontWeight}; font-size:${fontSize}px; line-height:20px; text-align:center; text-decoration:none; text-transform:${textTransform}; letter-spacing:${letterSpacing}px; padding:${paddingBtn}; margin-top:24px; margin-bottom:8px; width:${width};`
      break
    case 'ghost':
      // Ghost: subtle border, transparent background
      buttonStyle = `background-color:transparent !important; border-radius:${buttonBorderRadius}px; border:1px solid ${buttonTextColor}40; color:${buttonBgColor} !important; display:${display}; font-weight:${fontWeight}; font-size:${fontSize}px; line-height:20px; text-align:center; text-decoration:none; text-transform:${textTransform}; letter-spacing:${letterSpacing}px; padding:${paddingBtn}; margin-top:24px; margin-bottom:8px; width:${width};`
      break
    case 'arrow':
      // Arrow: text with right arrow
      buttonContent = `${buttonLabel} →`
      buttonStyle = `background-color:transparent !important; border:none; color:${buttonBgColor} !important; display:${display}; font-weight:${fontWeight}; font-size:${fontSize}px; line-height:20px; text-align:center; text-decoration:none; text-transform:${textTransform}; letter-spacing:${letterSpacing}px; padding:8px 0; margin-top:24px; margin-bottom:8px; width:${width};`
      break
    case 'underlined':
      // Underlined: simple underlined link
      buttonStyle = `background-color:transparent !important; border:none; border-bottom:2px solid ${buttonBgColor}; color:${buttonBgColor} !important; display:${display}; font-weight:${fontWeight}; font-size:${fontSize}px; line-height:20px; text-align:center; text-decoration:none; text-transform:${textTransform}; letter-spacing:${letterSpacing}px; padding:4px 0; margin-top:24px; margin-bottom:8px; width:${width};`
      break
    case 'text-only':
      // Text only: plain text link, no decoration
      buttonStyle = `background-color:transparent !important; border:none; color:${buttonBgColor} !important; display:${display}; font-weight:${fontWeight}; font-size:${fontSize}px; line-height:20px; text-align:center; text-decoration:none; text-transform:${textTransform}; letter-spacing:${letterSpacing}px; padding:8px 0; margin-top:24px; margin-bottom:8px; width:${width};`
      break
    default:
      // Button (default): solid background button
      buttonStyle = `background-color:${buttonBgColor} !important; border-radius:${buttonBorderRadius}px; border:${border}; color:${buttonTextColor} !important; display:${display}; font-weight:${fontWeight}; font-size:${fontSize}px; line-height:20px; text-align:center; text-decoration:none; text-transform:${textTransform}; letter-spacing:${letterSpacing}px; padding:${paddingBtn}; margin-top:24px; margin-bottom:8px; width:${width}; ${buttonShadow}`
  }

  const processedBody = processBodyHtmlForEmail(bodyHtml, card
    ? {
        borderStyle: card.table_border_style,
        borderColor: card.table_border_color,
        fontSize: card.table_font_size,
        headerBgColor: card.table_header_bg_color,
        headerUnderline: card.table_header_underline,
        headerUnderlineColor: card.table_header_underline_color,
      }
    : undefined)

  // Standard button/link structure
  return `<table cellpadding="0" cellspacing="0" role="presentation" width="100%" style="${cardStyle}">
  <tr>
    <td style="${paddingStyle}">
      <h2 style="${STYLE_H2} margin:0 0 16px 0; text-align:${textAlignment};">${esc(title)}</h2>
      <div style="${STYLE_BODY_TEXT} margin:0 0 8px 0; text-align:${textAlignment};">${processedBody}</div>
      <div style="${buttonWrapperStyle}">
        <a href="${esc(buttonUrl)}" data-role="cta" style="${buttonStyle}">${esc(buttonContent)}</a>
      </div>
    </td>
  </tr>
</table>`
}

/**
 * V7: Footer with array-based social links and configurable spacing
 */
export function renderFooter(data: Footer, templateType?: 'ff' | 'briefing' | 'letter'): string {
  const addressLines = data.address_lines || []
  const social = data.social || []

  // Colors (with defaults)
  const bgColor = data.background_color || '#2A3033'
  const textColor = data.text_color || '#cccccc'
  const linkColor = data.link_color || '#ffffff'

  // For letter template, use white background and black text
  const isLetterTemplate = templateType === 'letter' || bgColor === '#FFFFFF' || bgColor === '#ffffff'
  const finalBgColor = isLetterTemplate ? '#ffffff' : bgColor
  const finalTextColor = isLetterTemplate ? '#000000' : textColor
  const finalLinkColor = isLetterTemplate ? '#000000' : linkColor

  // Spacing controls (with defaults)
  const paddingTop = data.padding_top ?? 60
  const paddingBottom = data.padding_bottom ?? 30
  const socialMarginTop = data.social_margin_top ?? 40
  const socialMarginBottom = data.social_margin_bottom ?? 20

  // V7: Get social links array and build icons dynamically
  const socialLinks = Array.isArray(social) ? social : []

  // Build social icons HTML dynamically
  let socialIconsHtml = ''
  for (const link of socialLinks) {
    const url = (link.url || '').trim()
    const icon = (link.icon || '').trim()
    let alt = (link.alt || link.platform || 'Social Media').trim()

    // Ensure alt text always exists for accessibility
    if (!alt || alt === '') {
      alt = 'Social Media Link'
    }

    // Only render if both URL and icon exist
    if (url && icon) {
      socialIconsHtml += `
          <td style="${STYLE_SOCIAL_ICON_CELL}">
            <a href="${esc(url)}" title="${esc(alt)}">
              <img src="${esc(icon)}" alt="${esc(alt)}" width="28" height="28" style="${STYLE_IMAGE}" />
            </a>
          </td>`
    }
  }

  // Build social table (only if we have icons)
  let socialTableHtml = ''
  if (socialIconsHtml) {
    socialTableHtml = `
      <!-- Social Icons -->
      <table cellpadding="0" cellspacing="0" role="presentation" style="${STYLE_TABLE} margin:${socialMarginTop}px auto ${socialMarginBottom}px auto;">
        <tr>
          ${socialIconsHtml}
        </tr>
      </table>`
  } else {
    // No social links configured
    socialTableHtml = '<!-- No social links configured -->'
  }

  // Address formatting
  let addressHtml = ''
  if (addressLines.length > 0) {
    const firstLine =
      addressLines[0] ? `<strong>${esc(addressLines[0])}</strong>` : ''
    const otherLines = addressLines
      .slice(1)
      .map((line) => esc(line))
      .join('<br />')
    addressHtml = otherLines ? `${firstLine}<br />${otherLines}` : firstLine
  }

  // Split styles - padding must be on TD, not TABLE
  const tableStyle = `${STYLE_TABLE} background-color:${finalBgColor};`
  const tdStyle = `color:${finalTextColor}; text-align:center; padding:${paddingTop}px 20px ${paddingBottom}px 20px;`
  const linkStyle = `color:${finalLinkColor} !important; text-decoration:underline;`

  // For letter template, render simplified footer (no website link, no copyright)
  if (isLetterTemplate) {
    return `<table cellpadding="0" cellspacing="0" role="presentation" width="100%" style="${tableStyle}">
  <tr>
    <td align="center" style="${tdStyle}">
      ${socialTableHtml}
      
      <!-- Address -->
      <p style="color:${finalTextColor}; font-size:14px; line-height:1.6; margin:0 0 8px 0;">
        ${addressHtml}
      </p>
      
      <!-- Divider -->
      <div style="height:1px; background-color:#000000; margin:20px auto; max-width:400px;"></div>
    </td>
  </tr>
</table>`
  }

  // Standard footer for other templates
  return `<table cellpadding="0" cellspacing="0" role="presentation" width="100%" style="${tableStyle}">
  <tr>
    <td align="center" style="${tdStyle}">
      ${socialTableHtml}
      
      <!-- Address -->
      <p style="color:${finalTextColor}; font-size:14px; line-height:1.6; margin:0 0 8px 0;">
        ${addressHtml}
      </p>
      
      <!-- Divider -->
      <div style="height:1px; background-color:#444444; margin:20px auto; max-width:400px;"></div>
      
      <!-- Links (Unsubscribe handled by Slate) -->
      <p style="color:${finalTextColor}; font-size:13px; line-height:1.6; margin:15px 0;">
        <a href="https://gradschool.wsu.edu" data-role="footer-link" style="${linkStyle}">Graduate School website</a>
      </p>
      
      <!-- Copyright -->
      <p style="color:#999999; font-size:12px; line-height:1.6; margin:15px 0 0 0;">
        © 2025 Washington State University. All rights reserved.
      </p>
    </td>
  </tr>
</table>`
}

/**
 * Render a complete section with all its cards
 */
function renderSection(
  section: Section,
  spacing = 24,
  showBorder = true,
  settings: Settings | null = null,
  isLast = false
): string {
  const title = section.title || ''
  const key = section.key || ''
  const layout = section.layout || {
    padding_top: 18,
    padding_bottom: 28,
    background_color: '',
    border_radius: 0,
    divider_enabled: true,
    divider_thickness: 2,
    divider_color: BORDER_LIGHT,
    divider_spacing: 24,
    title_align: 'left',
  }

  // Override global spacing with section-specific if present
  if (!layout.divider_spacing) {
    layout.divider_spacing = spacing
  }

  // Special handling for closures
  if (key === 'closures') {
    const closures = section.closures || []
    return (
      renderSectionStart(title, layout, showBorder, isLast) +
      '\n' +
      renderClosuresSection(closures) +
      '\n' +
      renderSectionEnd()
    )
  }

  // Regular sections with cards
  const cards = section.cards || []
  const cardHtml: string[] = []

  for (const card of cards) {
    if (card.type === 'cta') {
      // CTA box with full button customization AND padding support
      const ctaTitle = card.title || ''
      const ctaBody = card.body_html || ''
      const links = card.links || []
      const ctaButtonLabel =
        links.length > 0 && links[0].label ? links[0].label : 'Learn more'
      const ctaButtonUrl =
        links.length > 0 && links[0].url ? links[0].url : '#'

      cardHtml.push(
        renderCTABox(
          ctaTitle,
          ctaBody,
          ctaButtonLabel,
          ctaButtonUrl,
          card.button_bg_color || '#A60F2D',
          card.button_text_color || '#ffffff',
          card.button_padding_vertical || 12,
          card.button_padding_horizontal || 32,
          card.button_border_width || 0,
          card.button_border_color || '#8c0d25',
          card.button_border_radius || 10,
          card.button_alignment || 'center',
          card.button_full_width || false,
          card,
          section,
          settings
        )
      )
    } else if (card.type === 'event') {
      cardHtml.push(renderEventCard(card, section, settings))
    } else if (card.type === 'resource') {
      cardHtml.push(renderResourceCard(card, section, settings))
    } else if (card.type === 'letter') {
      cardHtml.push(renderLetterCard(card, section, settings))
    } else {
      cardHtml.push(renderStandardCard(card, section, settings))
    }
  }

  return (
    renderSectionStart(title, layout, showBorder, isLast) +
    '\n' +
    cardHtml.join('\n') +
    '\n' +
    renderSectionEnd()
  )
}

/**
 * Generate complete email HTML with container width support
 */
export function renderFullEmail(data: NewsletterData): string {
  const masthead = data.masthead || {}
  const sections = data.sections || []
  const footer = data.footer || {}
  const settings = data.settings || {
    container_width: 640,
    section_spacing: 24,
    show_section_borders: true,
    padding_text: { top: 20, right: 20, bottom: 20, left: 20 },
    padding_image: { top: 20, right: 15, bottom: 20, left: 0 },
    typography: {
      font_family: 'Arial, Helvetica, sans-serif',
      h2_size: 22,
      h3_size: 18,
      body_size: 16,
    },
    colors: {
      primary: CRIMSON,
      text_dark: TEXT_DARK,
      text_body: TEXT_BODY,
      text_muted: TEXT_MUTED,
    },
  }
  const preheaderText = masthead.preheader || ''

  // Get container width from settings
  const containerWidth = settings.container_width || 640

  // Get section spacing and border settings
  const sectionSpacing = settings.section_spacing || 24
  const showSectionBorders = settings.show_section_borders !== false

  // Build sections HTML with is_last parameter
  const sectionsHtml: string[] = []
  for (let i = 0; i < sections.length; i++) {
    const isLast = i === sections.length - 1
    sectionsHtml.push(
      renderSection(
        sections[i],
        sectionSpacing,
        showSectionBorders,
        settings,
        isLast
      )
    )
  }

  // Assemble complete email
  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <!--[if gte mso 9]>
  <xml>
    <o:OfficeDocumentSettings>
      <o:AllowPNG/>
      <o:PixelsPerInch>96</o:PixelsPerInch>
    </o:OfficeDocumentSettings>
  </xml>
  <![endif]-->
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>WSU Graduate School Newsletter</title>
  <style type="text/css">
    ${EMAIL_CSS}
  </style>
</head>
<body style="${STYLE_RESET} background-color:${BG_LIGHT};">
  ${renderPreheader(preheaderText)}
  
  <!-- View in Browser -->
  ${renderViewInBrowser()}
  
  <!-- Masthead -->
  ${renderMasthead(masthead, containerWidth)}
  
  <!-- Main Content Container -->
  <table cellpadding="0" cellspacing="0" role="presentation" width="100%" style="${STYLE_TABLE} background-color:${BG_LIGHT};">
    <tr>
      <td align="center" style="background-color:${BG_LIGHT};">
        <table cellpadding="0" cellspacing="0" role="presentation" width="${containerWidth}" class="container" style="${STYLE_TABLE} background-color:${BG_WHITE}; border-left:1px solid ${BORDER_MEDIUM}; border-right:1px solid ${BORDER_MEDIUM}; border-bottom:1px solid ${BORDER_MEDIUM};">
          <tr>
            <td class="content" style="padding:18px 25px 28px; background-color:${BG_WHITE};">
              
              ${sectionsHtml.join('\n')}
              
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color:${BG_WHITE}; padding:0;">
              ${renderFooter(footer, data.template)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  return html
}

/**
 * Generate plain-text version of newsletter
 */
export function generatePlainText(data: NewsletterData): string {
  const parts: string[] = []
  const mast = data.masthead || {}
  if (mast.title) {
    parts.push(mast.title.toUpperCase())
  }
  if (mast.tagline) {
    parts.push(mast.tagline)
  }
  if (mast.preheader) {
    parts.push(mast.preheader)
  }
  parts.push('\n' + '='.repeat(60) + '\n')

  for (const section of data.sections || []) {
    const title = section.title || ''
    if (title) {
      parts.push(`\n${title.toUpperCase()}\n${'-'.repeat(title.length)}\n`)
    }
    if (section.key === 'closures') {
      for (const closure of section.closures || []) {
        const date = (closure.date || '').trim()
        const reason = (closure.reason || '').trim()
        if (date || reason) {
          parts.push(`• ${date} - ${reason}`)
        }
      }
      continue
    }
    for (const card of section.cards || []) {
      if (card.type === 'letter') {
        const greeting = (card.greeting || '').trim()
        if (greeting) {
          parts.push(greeting)
        }
        const bodyHtml = card.body_html || ''
        if (bodyHtml) {
          // Strip HTML tags
          const text = bodyHtml.replace(/<[^>]+>/g, '')
          parts.push(text)
        }
        const closing = (card.closing || '').trim()
        if (closing) {
          parts.push(closing)
        }
        const signatureName = (card.signature_name || '').trim()
        if (signatureName) {
          parts.push(signatureName)
        }
        const signatureLines = card.signature_lines || []
        for (const line of signatureLines) {
          if (line.trim()) {
            parts.push(line.trim())
          }
        }
        for (const link of card.links || []) {
          const label = (link.label || '').trim()
          const url = (link.url || '').trim()
          if (label && url && url !== '#') {
            parts.push(`${label}: ${url}`)
          }
        }
        parts.push('')
        continue
      }

      const ctitle = card.title || ''
      if (ctitle) {
        parts.push(`\n${ctitle}`)
      }
      const bodyHtml = card.body_html || ''
      if (bodyHtml) {
        // Strip HTML tags
        const text = bodyHtml.replace(/<[^>]+>/g, '')
        parts.push(text)
      }
      if ('location' in card && card.location) {
        parts.push(`Location: ${card.location}`)
      }
      if ('date' in card && card.date) {
        parts.push(`Date: ${card.date}`)
      }
      if ('time' in card && card.time) {
        parts.push(`Time: ${card.time}`)
      }
      for (const link of card.links || []) {
        const label = (link.label || '').trim()
        const url = (link.url || '').trim()
        if (label && url && url !== '#') {
          parts.push(`${label}: ${url}`)
        }
      }
      parts.push('')
    }
  }
  parts.push('\n' + '='.repeat(60) + '\n')
  const footer = data.footer || {}
  for (const line of footer.address_lines || []) {
    parts.push(line)
  }

  // V7: Handle array-based social links
  const social = footer.social || []
  if (Array.isArray(social)) {
    for (const link of social) {
      const platform = link.platform || 'Social'
      const url = link.url || ''
      if (url) {
        parts.push(`${platform}: ${url}`)
      }
    }
  }

  parts.push('\nGraduate School website: https://gradschool.wsu.edu')
  return parts.join('\n')
}

