// app/api/validate/route.ts - Validate newsletter for accessibility and content issues

import { NextRequest, NextResponse } from 'next/server'
import type { NewsletterData, ValidationResult, ValidationIssue } from '@/types/newsletter'

export async function POST(request: NextRequest) {
  try {
    const data: NewsletterData = await request.json()
    const issues: ValidationIssue[] = []

    // Check masthead
    if (!data.masthead?.banner_alt) {
      issues.push({
        severity: 'error',
        message: 'Banner image missing alt text',
        location: 'Masthead',
        fix: 'Add descriptive alt text for screen readers',
      })
    }

    const preheader = data.masthead?.preheader || ''
    if (preheader.length > 90) {
      issues.push({
        severity: 'warning',
        message: `Preheader text is ${preheader.length} characters (optimal: 40-90)`,
        location: 'Masthead',
        fix: 'Shorten preheader for better inbox preview',
      })
    }

    // Check sections and cards
    for (const section of data.sections || []) {
      const sectionTitle = section.title || 'Untitled Section'

      for (const card of section.cards || []) {
        // Get card title - LetterCard doesn't have a title property
        const cardTitle =
          'title' in card && card.title ? card.title : `Card (${card.type})`

        // Check for placeholder links
        for (const link of card.links || []) {
          if (link.url === '#' || !link.url) {
            issues.push({
              severity: 'warning',
              message: `Placeholder link in '${cardTitle}'`,
              location: sectionTitle,
              fix: "Replace '#' with actual URL or remove link",
            })
          }
        }

        // Check for missing link labels
        for (const link of card.links || []) {
          if (!link.label) {
            issues.push({
              severity: 'error',
              message: `Link missing label in '${cardTitle}'`,
              location: sectionTitle,
              fix: 'Add descriptive link text',
            })
          }
        }

        // Check resource icons
        if (card.type === 'resource' && 'show_icon' in card && card.show_icon) {
          if (!card.icon_alt) {
            issues.push({
              severity: 'error',
              message: `Resource icon missing alt text in '${cardTitle}'`,
              location: sectionTitle,
              fix: 'Add descriptive alt text for icon',
            })
          }
        }

        // Check body_html for images without alt text
        if ('body_html' in card && card.body_html) {
          const imgRegex = /<img\b[^>]*>/gi
          const imgMatches = card.body_html.match(imgRegex) || []
          for (const imgTag of imgMatches) {
            const hasMeaningfulAlt =
              /\balt\s*=\s*"[^"]+"/i.test(imgTag) ||
              /\balt\s*=\s*'[^']+'/i.test(imgTag)
            const hasEmptyAlt =
              /\balt\s*=\s*""/i.test(imgTag) ||
              /\balt\s*=\s*''/i.test(imgTag)
            if (!hasMeaningfulAlt && !hasEmptyAlt) {
              issues.push({
                severity: 'error',
                message: `Image in rich text content missing alt text in '${cardTitle}'`,
                location: sectionTitle,
                fix: 'Add alt text to the image in the rich text editor or code view',
              })
            } else if (hasEmptyAlt) {
              issues.push({
                severity: 'warning',
                message: `Image has empty alt text in '${cardTitle}' — verify it is decorative`,
                location: sectionTitle,
                fix: 'If the image conveys meaning, add descriptive alt text',
              })
            }
          }
        }

        // Check heading hierarchy in body_html
        // Card titles render as h3 in email output, so body headings should start at h4+
        if ('body_html' in card && card.body_html) {
          const headingRegex = /<h([1-6])\b/gi
          const headingLevels: number[] = []
          let headingMatch
          while ((headingMatch = headingRegex.exec(card.body_html)) !== null) {
            headingLevels.push(parseInt(headingMatch[1]))
          }
          if (headingLevels.length > 0 && headingLevels[0] < 4) {
            issues.push({
              severity: 'warning',
              message: `Body content starts with h${headingLevels[0]} in '${cardTitle}' — card titles already render as h3`,
              location: sectionTitle,
              fix: `Use h4 or lower for headings inside card body content`,
            })
          }
          for (let i = 1; i < headingLevels.length; i++) {
            if (headingLevels[i] > headingLevels[i - 1] + 1) {
              issues.push({
                severity: 'warning',
                message: `Heading level skipped (h${headingLevels[i - 1]} \u2192 h${headingLevels[i]}) in '${cardTitle}'`,
                location: sectionTitle,
                fix: `Use h${headingLevels[i - 1] + 1} instead of h${headingLevels[i]} for proper heading hierarchy`,
              })
              break
            }
          }
        }
      }
    }

    // V7: Check social links
    const footerSocial = data.footer?.social || []
    if (Array.isArray(footerSocial)) {
      footerSocial.forEach((link, idx) => {
        if (!link.alt || link.alt.trim() === '') {
          issues.push({
            severity: 'warning',
            message: `Social link #${idx + 1} (${link.platform || 'Unknown'}) missing alt text`,
            location: 'Footer',
            fix: 'Add descriptive alt text for accessibility',
          })
        }
      })
    }

    return NextResponse.json<ValidationResult>({
      success: true,
      issues,
      total: issues.length,
      errors: issues.filter((i) => i.severity === 'error').length,
      warnings: issues.filter((i) => i.severity === 'warning').length,
    })
  } catch (error) {
    return NextResponse.json<ValidationResult>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

