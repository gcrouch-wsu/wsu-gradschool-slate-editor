import { NextResponse } from 'next/server'
import { isPrincipal, requireEditor } from '@/lib/auth/guard'
import { jsonError } from '@/lib/http'
import { restoreArchivedNewsletter } from '@/lib/newsletters/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const principal = await requireEditor(request)
  if (!isPrincipal(principal)) return principal
  try {
    const { id } = await context.params
    return NextResponse.json(await restoreArchivedNewsletter(id, principal.userId))
  } catch (error) {
    return jsonError(error)
  }
}
