import { NextResponse } from 'next/server'
import { isPrincipal, requireEditor } from '@/lib/auth/guard'
import { jsonError } from '@/lib/http'
import { importNewsletterFromHtml } from '@/lib/newsletter-document'
import { importNewsletterDraft } from '@/lib/newsletters/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const principal = await requireEditor(request)
  if (!isPrincipal(principal)) return principal
  try {
    const body = (await request.json()) as { html?: string }
    if (!body.html) return NextResponse.json({ error: 'html is required.' }, { status: 400 })
    const data = importNewsletterFromHtml(body.html)
    const created = await importNewsletterDraft(principal.userId, data)
    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    return jsonError(error)
  }
}
