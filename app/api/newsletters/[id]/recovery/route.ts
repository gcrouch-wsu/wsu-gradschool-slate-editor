import { NextResponse } from 'next/server'
import { isPrincipal, requireEditor } from '@/lib/auth/guard'
import { jsonError } from '@/lib/http'
import { getRecoveryDraft, saveRecoveryDraft } from '@/lib/newsletters/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const principal = await requireEditor(request)
  if (!isPrincipal(principal)) return principal
  try {
    const { id } = await context.params
    return NextResponse.json({ draft: await getRecoveryDraft(id, principal.userId) })
  } catch (error) {
    return jsonError(error)
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const principal = await requireEditor(request)
  if (!isPrincipal(principal)) return principal
  try {
    const { id } = await context.params
    const body = (await request.json()) as { snapshot?: unknown; baseVersion?: number }
    if (typeof body.baseVersion !== 'number') {
      return NextResponse.json({ error: 'baseVersion is required.' }, { status: 400 })
    }
    await saveRecoveryDraft(id, principal.userId, body.snapshot, body.baseVersion)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return jsonError(error)
  }
}
