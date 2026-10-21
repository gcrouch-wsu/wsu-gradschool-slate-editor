import { NextResponse } from 'next/server'
import { isPrincipal, requireEditor } from '@/lib/auth/guard'
import { jsonError } from '@/lib/http'
import { purgeArchivedNewsletter } from '@/lib/newsletters/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const principal = await requireEditor(request)
  if (!isPrincipal(principal)) return principal
  try {
    const { id } = await context.params
    return NextResponse.json(await purgeArchivedNewsletter(id))
  } catch (error) {
    return jsonError(error)
  }
}
