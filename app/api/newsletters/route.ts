import { NextResponse } from 'next/server'
import { isPrincipal, requireEditor } from '@/lib/auth/guard'
import { jsonError } from '@/lib/http'
import { createNewsletter, listNewsletters } from '@/lib/newsletters/service'
import type { TemplateType } from '@/types/newsletter'

function templateFilter(value: string | null): TemplateType | 'all' {
  if (value === 'ff' || value === 'briefing' || value === 'letter') return value
  return 'all'
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const principal = await requireEditor(request)
  if (!isPrincipal(principal)) return principal
  try {
    const url = new URL(request.url)
    const archived = url.searchParams.get('archived') === 'true'
    return NextResponse.json({
      newsletters: await listNewsletters(undefined, {
        archived,
        template: templateFilter(url.searchParams.get('template')),
        query: url.searchParams.get('q') ?? '',
      }),
      user: principal,
    })
  } catch (error) {
    return jsonError(error)
  }
}

export async function POST(request: Request) {
  const principal = await requireEditor(request)
  if (!isPrincipal(principal)) return principal
  try {
    const body = (await request.json()) as { template?: TemplateType }
    const template = body.template === 'briefing' || body.template === 'letter' ? body.template : 'ff'
    const created = await createNewsletter(principal.userId, template)
    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    return jsonError(error)
  }
}
