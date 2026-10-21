import { NextResponse } from 'next/server'
import { isPrincipal, requireEditor } from '@/lib/auth/guard'
import { jsonError } from '@/lib/http'
import { discardNewsletter, getNewsletter } from '@/lib/newsletters/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const principal = await requireEditor(request)
  if (!isPrincipal(principal)) return principal
  try {
    const { id } = await context.params
    const newsletter = await getNewsletter(id)
    if (!newsletter) return NextResponse.json({ error: 'Newsletter not found.' }, { status: 404 })
    return NextResponse.json(newsletter)
  } catch (error) {
    return jsonError(error)
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const principal = await requireEditor(request)
  if (!isPrincipal(principal)) return principal
  try {
    const { id } = await context.params
    return NextResponse.json(await discardNewsletter(id, principal.userId))
  } catch (error) {
    return jsonError(error)
  }
}
