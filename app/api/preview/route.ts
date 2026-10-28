// app/api/preview/route.ts - Generate HTML preview from JSON data

import { NextRequest, NextResponse } from 'next/server'
import { renderFullEmail } from '@/lib/email-templates'
import type { PreviewResponse } from '@/types/newsletter'
import { DocumentValidationError, normalizeNewsletter } from '@/lib/newsletter-document'
import { allowContentRoute } from '@/lib/auth/guard'

export async function POST(request: NextRequest) {
  const denied = await allowContentRoute(request)
  if (denied) return denied
  try {
    const data = normalizeNewsletter(await request.json(), { requireShape: true })
    const htmlOutput = renderFullEmail(data, { previewMarkers: true })
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
      { status: error instanceof DocumentValidationError ? 400 : 500 }
    )
  }
}

