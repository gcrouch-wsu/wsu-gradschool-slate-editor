import { NextResponse } from 'next/server'
import { isPrincipal, requireEditor } from '@/lib/auth/guard'
import { jsonError } from '@/lib/http'
import { getNewsletter, setNewsletterProgress } from '@/lib/newsletters/service'
import type { NewsletterProgress } from '@/types/newsletter'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const principal = await requireEditor(request)
  if (!isPrincipal(principal)) return principal
  try {
    const { id } = await context.params
    const body = (await request.json()) as {
      progress?: NewsletterProgress
      token?: string
      expectedVersion?: number
    }
    if (!body.token || typeof body.expectedVersion !== 'number') {
      return NextResponse.json({ error: 'token and expectedVersion are required.' }, { status: 400 })
    }
    if (body.progress !== 'draft' && body.progress !== 'ready' && body.progress !== 'sent') {
      return NextResponse.json({ error: 'Choose Draft, Ready for Slate, or Sent via Slate.' }, { status: 400 })
    }
    const updated = await setNewsletterProgress(id, {
      userId: principal.userId,
      token: body.token,
      expectedVersion: body.expectedVersion,
      progress: body.progress,
    })
    const newsletter = await getNewsletter(id)
    return NextResponse.json({ ...updated, summary: newsletter?.summary ?? null })
  } catch (error) {
    return jsonError(error)
  }
}
