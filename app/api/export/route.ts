import { NextRequest, NextResponse } from 'next/server'
import { allowContentRoute } from '@/lib/auth/guard'
import { renderExportedHtml } from '@/lib/export-html'
import { DocumentValidationError } from '@/lib/newsletter-document'
import type { ExportOptions } from '@/types/newsletter'

export async function POST(request: NextRequest) {
  const denied = await allowContentRoute(request)
  if (denied) return denied
  try {
    const body = await request.json()
    const { export_options: rawOptions, ...rawNewsletter } = body
    const exportOptions: ExportOptions = rawOptions || {}
    const exported = renderExportedHtml(rawNewsletter, exportOptions)
    return new NextResponse(exported.html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="${exported.filename}"`,
      },
    })
  } catch (error) {
    const status = error instanceof DocumentValidationError ? 400 : 500
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Export failed',
      },
      { status }
    )
  }
}
