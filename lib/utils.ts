// utils.ts - Utility functions

/**
 * Clone an object deeply
 */
export function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

/**
 * Debounce function
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  ms = 300
): (...args: Parameters<T>) => void {
  let timer: NodeJS.Timeout | null = null
  return function (...args: Parameters<T>) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}

/**
 * Escape HTML
 */
export function escapeHtml(text: string | null | undefined): string {
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
 * Process HTML to add email-safe inline styles to lists
 * This ensures proper line spacing in email clients
 */
/**
 * Processes list HTML to add email-safe inline styles while preserving editor-applied styles.
 * 
 * This function:
 * 1. Adds default email-safe styles to <ul> and <ol> elements (margins, padding)
 * 2. Preserves inline styles from the editor (line-height, margin-bottom) on <li> elements
 * 3. Ensures margin-bottom uses !important to override any CSS defaults
 * 
 * Why this is needed:
 * - Email clients require inline styles (no external CSS)
 * - Editor applies line-height and margin-bottom via inline styles
 * - We need to preserve these while adding email-safe defaults
 * 
 * @param html - HTML string containing list elements
 * @returns HTML string with email-safe styles applied
 */
export function processListStyles(html: string): string {
  if (!html || typeof html !== 'string') return html

  // Process <ul> and <ol> elements - add email-safe default styles
  let processed = html.replace(
    /<ul([^>]*)>/gi,
    (match, attrs) => {
      // Check if style attribute already exists
      if (attrs && attrs.includes('style=')) {
        // Add to existing style
        return match.replace(
          /style="([^"]*)"/i,
          (styleMatch, existingStyles) => {
            const listStyles = 'margin:0.5em 0; padding-left:1.5em;'
            return `style="${existingStyles} ${listStyles}"`
          }
        )
      } else {
        // Add new style attribute
        return `<ul${attrs} style="margin:0.5em 0; padding-left:1.5em;">`
      }
    }
  )

  processed = processed.replace(
    /<ol([^>]*)>/gi,
    (match, attrs) => {
      if (attrs && attrs.includes('style=')) {
        return match.replace(
          /style="([^"]*)"/i,
          (styleMatch, existingStyles) => {
            const listStyles = 'margin:0.5em 0; padding-left:1.5em;'
            return `style="${existingStyles} ${listStyles}"`
          }
        )
      } else {
        return `<ol${attrs} style="margin:0.5em 0; padding-left:1.5em;">`
      }
    }
  )

  // Process <li> elements - preserve margin-bottom and line-height from editor
  // The editor applies these via inline styles, and we must preserve them for email output
  processed = processed.replace(
    /<li([^>]*)>/gi,
    (match, attrs) => {
      if (attrs && attrs.includes('style=')) {
        return match.replace(
          /style="([^"]*)"/i,
          (styleMatch, existingStyles) => {
            // Extract margin-bottom and line-height from editor-applied inline styles
            // These come from the TiptapEditor list controls (Item Gap and Line Height)
            let preservedMarginBottom = ''
            let preservedLineHeight = ''
            
            const marginBottomMatch = existingStyles.match(/margin-bottom\s*:\s*([^;!]+?)(\s*!important)?\s*(;|$)/i)
            if (marginBottomMatch) {
              // Preserve the value, always add !important to ensure it overrides CSS
              const value = marginBottomMatch[1].trim()
              preservedMarginBottom = `margin-bottom: ${value} !important;`
            }
            
            const lineHeightMatch = existingStyles.match(/line-height\s*:\s*([^;]+?)(;|$)/i)
            if (lineHeightMatch) {
              preservedLineHeight = `line-height: ${lineHeightMatch[1].trim()};`
            }
            
            // Remove margin-bottom and line-height from existing styles (we'll add them back)
            // Must match with or without !important
            const cleanedStyles = existingStyles
              .replace(/margin-bottom\s*:\s*[^;!]+(!important)?\s*;?\s*/gi, '')
              .replace(/line-height\s*:\s*[^;!]+(!important)?\s*;?\s*/gi, '')
              .trim()
            
            // Build final style: preserved values + email-safe defaults + any other styles
            // Use individual margin properties instead of margin:0 to avoid overriding margin-bottom
            // Ensure margin-bottom has !important to override any CSS defaults
            const itemStyles = 'padding:0; margin-top:0; margin-left:0; margin-right:0;'
            // If margin-bottom was preserved, it already has !important; if not, add default with !important
            const marginBottomStyle = preservedMarginBottom || 'margin-bottom: 0 !important;'
            const preservedStyles = `${marginBottomStyle} ${preservedLineHeight}`.trim()
            const mergedStyles = `${itemStyles} ${preservedStyles} ${cleanedStyles}`.trim()
            
            return `style="${mergedStyles}"`
          }
        )
      } else {
        // No existing styles - add email-safe defaults only (no margin-bottom, let editor set it)
        return `<li${attrs} style="padding:0; margin-top:0; margin-left:0; margin-right:0;">`
      }
    }
  )

  return processed
}

