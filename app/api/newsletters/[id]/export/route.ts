import { NextResponse } from 'next/server'
import { isPrincipal, requireEditor } from '@/lib/auth/guard'
import { renderExportedHtml } from '@/lib/export-html'
import { jsonError } from '@/lib/http'
import { getNewsletter } from '@/lib/newsletters/service'
import type { ExportOptions } from '@/types/newsletter'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const principal = await requireEditor(request)
  if (!isPrincipal(principal)) return principal
  try {
    const { id } = await context.params
    const newsletter = await getNewsletter(id)
    if (!newsletter) return NextResponse.json({ error: 'Newsletter not found.' }, { status: 404 })
    if (newsletter.summary.archived)
      return NextResponse.json({ error: 'This draft was deleted. Restore it before exporting.' }, { status: 409 })
    const body = (await request.json().catch(() => ({}))) as {
      export_options?: ExportOptions
      expectedVersion?: number
    }
    if (body.expectedVersion !== undefined && body.expectedVersion !== newsletter.summary.saveVersion)
      return NextResponse.json({ error: 'The saved draft has changed. Reopen it before exporting.' }, { status: 409 })
    const exported = renderExportedHtml(newsletter.content, body.export_options)
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
