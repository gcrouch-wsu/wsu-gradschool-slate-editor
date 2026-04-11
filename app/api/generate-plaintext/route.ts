// app/api/generate-plaintext/route.ts - Generate plain-text version

import { NextRequest, NextResponse } from 'next/server'
import { generatePlainText } from '@/lib/email-templates'
import type { NewsletterData, PlainTextResponse } from '@/types/newsletter'

export async function POST(request: NextRequest) {
  try {
    const data: NewsletterData = await request.json()
    const text = generatePlainText(data)
    return NextResponse.json<PlainTextResponse>({
      text,
      success: true,
    })
  } catch (error) {
    return NextResponse.json<PlainTextResponse>(
      {
        text: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

