import { NextResponse } from 'next/server'
import { isPrincipal, requireEditor } from '@/lib/auth/guard'
import { jsonError } from '@/lib/http'
import { getRevisionSnapshot, listRevisions } from '@/lib/newsletters/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const principal = await requireEditor(request)
  if (!isPrincipal(principal)) return principal
  try {
    const { id } = await context.params
    const revisionId = new URL(request.url).searchParams.get('revision')
    if (revisionId) {
      const content = /^[0-9a-f-]{36}$/i.test(revisionId) ? await getRevisionSnapshot(id, revisionId) : null
      if (!content) return NextResponse.json({ error: 'Revision not found.' }, { status: 404 })
      return NextResponse.json({ content })
    }
    return NextResponse.json({ revisions: await listRevisions(id) })
  } catch (error) {
    return jsonError(error)
  }
}
