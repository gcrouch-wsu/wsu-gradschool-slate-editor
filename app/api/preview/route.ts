// app/api/preview/route.ts - Generate HTML preview from JSON data

import { NextRequest, NextResponse } from 'next/server'
import { renderFullEmail } from '@/lib/email-templates'
import type { NewsletterData, PreviewResponse } from '@/types/newsletter'

export async function POST(request: NextRequest) {
  try {
    const data: NewsletterData = await request.json()
    const htmlOutput = renderFullEmail(data)
    return NextResponse.json<PreviewResponse>({
      html: htmlOutput,
      success: true,
    })
  } catch (error) {
    return NextResponse.json<PreviewResponse>(
      {
        html: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

