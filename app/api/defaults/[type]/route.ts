// app/api/defaults/[type]/route.ts - Get default data for a template type

import { NextRequest, NextResponse } from 'next/server'
import { defaultFFModel, defaultBriefingModel, defaultLetterModel } from '@/lib/defaults'
import type { NewsletterData } from '@/types/newsletter'
import { allowContentRoute } from '@/lib/auth/guard'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const denied = await allowContentRoute(request)
  if (denied) return denied
  try {
    const { type: templateType } = await params

    let model: NewsletterData
    if (templateType === 'briefing') {
      model = defaultBriefingModel()
    } else if (templateType === 'letter') {
      model = defaultLetterModel()
    } else {
      model = defaultFFModel()
    }

    return NextResponse.json<NewsletterData>(model)
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

