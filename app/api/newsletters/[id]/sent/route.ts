import { NextResponse } from 'next/server'
import { isPrincipal, requireEditor } from '@/lib/auth/guard'
import { jsonError } from '@/lib/http'
import { getSentVersion } from '@/lib/newsletters/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const principal = await requireEditor(request)
  if (!isPrincipal(principal)) return principal
  try {
    const { id } = await context.params
    const markId = new URL(request.url).searchParams.get('mark') ?? undefined
    const sent = await getSentVersion(id, markId)
    if (!sent) return NextResponse.json({ error: 'No sent version has been recorded.' }, { status: 404 })
    return NextResponse.json(sent)
  } catch (error) {
    return jsonError(error)
  }
}
