import { NextRequest, NextResponse } from 'next/server'
import { allowContentRoute } from '@/lib/auth/guard'
import { renderExportedHtml } from '@/lib/export-html'
import { jsonError } from '@/lib/http'
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
    return jsonError(error)
  }
}
