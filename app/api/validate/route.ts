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

