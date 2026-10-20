// app/api/import/route.ts - Import newsletter from HTML file

import { NextRequest, NextResponse } from 'next/server'
import type { ImportResponse } from '@/types/newsletter'
import { DocumentValidationError, importNewsletterFromHtml } from '@/lib/newsletter-document'
import { allowContentRoute } from '@/lib/auth/guard'

export async function POST(request: NextRequest) {
  const denied = await allowContentRoute(request)
  if (denied) return denied
  try {
    const body = await request.json()
    const htmlContent = typeof body.html === 'string' ? body.html : ''
    const newsletterData = importNewsletterFromHtml(htmlContent)
    return NextResponse.json<ImportResponse>({
      success: true,
      data: newsletterData,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Import failed'
    const status = error instanceof DocumentValidationError || error instanceof SyntaxError ? 400 : 500
    return NextResponse.json<ImportResponse>(
      {
        success: false,
        error: message,
      },
      { status }
    )
  }
}

