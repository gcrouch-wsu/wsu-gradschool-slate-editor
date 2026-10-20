// app/api/generate-plaintext/route.ts - Generate plain-text version

import { NextRequest, NextResponse } from 'next/server'
import { generatePlainText } from '@/lib/email-templates'
import type { NewsletterData, PlainTextResponse } from '@/types/newsletter'
import { allowContentRoute } from '@/lib/auth/guard'

export async function POST(request: NextRequest) {
  const denied = await allowContentRoute(request)
  if (denied) return denied
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

