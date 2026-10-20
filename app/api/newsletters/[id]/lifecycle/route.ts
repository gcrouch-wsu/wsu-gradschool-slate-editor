import { NextResponse } from 'next/server'
import { isPrincipal, requireEditor } from '@/lib/auth/guard'
import { jsonError } from '@/lib/http'
import { archiveNewsletter, duplicateNewsletter, replaceTemplate, restoreRevision } from '@/lib/newsletters/service'
import type { TemplateType } from '@/types/newsletter'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const principal = await requireEditor(request)
  if (!isPrincipal(principal)) return principal
  try {
    const { id } = await context.params
    const body = (await request.json()) as {
      action?: string
      token?: string
      expectedVersion?: number
      template?: TemplateType
      revisionId?: string
    }
    if (body.action === 'duplicate') {
      return NextResponse.json(await duplicateNewsletter(id, principal.userId), { status: 201 })
    }
    if (!body.token || typeof body.expectedVersion !== 'number') {
      return NextResponse.json({ error: 'token and expectedVersion are required.' }, { status: 400 })
    }
    const base = { userId: principal.userId, token: body.token, expectedVersion: body.expectedVersion }
    if (body.action === 'archive') return NextResponse.json(await archiveNewsletter(id, base))
    if (body.action === 'template' && (body.template === 'ff' || body.template === 'briefing' || body.template === 'letter')) {
      return NextResponse.json(await replaceTemplate(id, { ...base, template: body.template }))
    }
    if (body.action === 'restore' && body.revisionId) {
      return NextResponse.json(await restoreRevision(id, { ...base, revisionId: body.revisionId }))
    }
    return NextResponse.json({ error: 'Unknown lifecycle action.' }, { status: 400 })
  } catch (error) {
    return jsonError(error)
  }
}
