import { NextResponse } from 'next/server'
import { isPrincipal, requireEditor } from '@/lib/auth/guard'
import { renderExportedHtml } from '@/lib/export-html'
import { jsonError } from '@/lib/http'
import { getSentVersion } from '@/lib/newsletters/service'
import type { ExportOptions } from '@/types/newsletter'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const principal = await requireEditor(request)
  if (!isPrincipal(principal)) return principal
  try {
    const { id } = await context.params
    const body = (await request.json().catch(() => ({}))) as { export_options?: ExportOptions; markId?: string }
    const sent = await getSentVersion(id, body.markId)
    if (!sent) return NextResponse.json({ error: 'No sent version has been recorded.' }, { status: 404 })
    const exported = renderExportedHtml(sent.snapshot, body.export_options)
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
