// app/api/stats/route.ts - Get content statistics

import { NextRequest, NextResponse } from 'next/server'
import type { NewsletterData, StatsResult } from '@/types/newsletter'

export async function POST(request: NextRequest) {
  try {
    const data: NewsletterData = await request.json()

    let wordCount = 0
    let imageCount = 0
    let linkCount = 0
    let cardCount = 0

    // Count masthead banner
    if (data.masthead?.banner_url) {
      imageCount += 1
    }

    // Process sections
    for (const section of data.sections || []) {
      for (const card of section.cards || []) {
        cardCount += 1

        // Count words in body_html
        const body = card.body_html || ''
        // Strip HTML tags for word count
        const text = body.replace(/<[^>]+>/g, '')
        wordCount += text.split(/\s+/).filter((w) => w.length > 0).length

        // Count images
        if (card.type === 'resource' && 'show_icon' in card && card.show_icon && card.icon_url) {
          imageCount += 1
        }

        // Count links
        linkCount += (card.links || []).length
      }
    }

    // V7: Count social media icons
    const footerSocial = data.footer?.social || []
    if (Array.isArray(footerSocial)) {
      imageCount += footerSocial.filter((link) => link.icon).length
    }

    // Estimated read time (200 words per minute)
    const readTime = Math.max(1, Math.round(wordCount / 200))

    return NextResponse.json<StatsResult>({
      success: true,
      stats: {
        word_count: wordCount,
        read_time_minutes: readTime,
        image_count: imageCount,
        link_count: linkCount,
        card_count: cardCount,
        section_count: (data.sections || []).length,
        social_links: Array.isArray(footerSocial) ? footerSocial.length : 0,
      },
    })
  } catch (error) {
    return NextResponse.json<StatsResult>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

