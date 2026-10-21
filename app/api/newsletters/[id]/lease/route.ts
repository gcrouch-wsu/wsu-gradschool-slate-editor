import { NextResponse } from 'next/server'
import { isPrincipal, requireEditor } from '@/lib/auth/guard'
import { jsonError } from '@/lib/http'
import { acquireLease, releaseLease, renewLease, resumeLease, takeoverLease } from '@/lib/newsletters/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const principal = await requireEditor(request)
  if (!isPrincipal(principal)) return principal
  try {
    const { id } = await context.params
    const body = (await request.json()) as { action?: string; token?: string }
    if (body.action === 'acquire') {
      return NextResponse.json(await acquireLease(id, principal.userId))
    }
    if (body.action === 'resume' && typeof body.token === 'string') {
      return NextResponse.json(await resumeLease(id, principal.userId, body.token))
    }
    if (body.action === 'takeover') {
      return NextResponse.json(await takeoverLease(id, principal.userId))
    }
    if (body.action === 'renew' && typeof body.token === 'string') {
      return NextResponse.json(await renewLease(id, principal.userId, body.token))
    }
    if (body.action === 'release' && typeof body.token === 'string') {
      return NextResponse.json(await releaseLease(id, principal.userId, body.token))
    }
    return NextResponse.json({ error: 'Unknown lease action.' }, { status: 400 })
  } catch (error) {
    return jsonError(error)
  }
}
