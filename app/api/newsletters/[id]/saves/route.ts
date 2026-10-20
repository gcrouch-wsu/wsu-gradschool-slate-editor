import { NextResponse } from 'next/server'
import { isPrincipal, requireEditor } from '@/lib/auth/guard'
import { jsonError } from '@/lib/http'
import { saveNewsletter } from '@/lib/newsletters/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const principal = await requireEditor(request)
  if (!isPrincipal(principal)) return principal
  try {
    const { id } = await context.params
    const body = (await request.json()) as {
      token?: string
      expectedVersion?: number
      saveId?: string
      snapshot?: unknown
    }
    if (!body.token || !body.saveId || typeof body.expectedVersion !== 'number') {
      return NextResponse.json({ error: 'token, expectedVersion, and saveId are required.' }, { status: 400 })
    }
    const saved = await saveNewsletter(id, {
      userId: principal.userId,
      token: body.token,
      expectedVersion: body.expectedVersion,
      saveId: body.saveId,
      snapshot: body.snapshot,
    })
    return NextResponse.json(saved)
  } catch (error) {
    return jsonError(error)
  }
}
