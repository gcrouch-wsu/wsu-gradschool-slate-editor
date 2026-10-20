import { NextResponse } from 'next/server'
import { createSession } from '@/lib/auth/session-store'
import { rejectCrossOrigin } from '@/lib/auth/guard'
import { setSessionCookie } from '@/lib/http'
import { authMode } from '@/lib/runtime-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (authMode() !== 'development' || process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }
  const originError = rejectCrossOrigin(request)
  if (originError) return originError
  const contentType = request.headers.get('content-type') ?? ''
  let userId = ''
  let nextPath = '/newsletters'
  let formPost = false
  if (contentType.includes('application/json')) {
    const body = (await request.json().catch(() => null)) as { userId?: unknown } | null
    if (body && typeof body.userId === 'string') userId = body.userId
  } else {
    formPost = true
    const data = await request.formData()
    userId = String(data.get('userId') ?? '')
    const next = String(data.get('next') ?? '')
    if (next.startsWith('/') && !next.startsWith('//')) nextPath = next
  }
  if (!userId) return NextResponse.json({ error: 'userId is required.' }, { status: 400 })
  try {
    const session = await createSession(userId)
    if (formPost) {
      const response = NextResponse.redirect(new URL(nextPath, request.url), 303)
      setSessionCookie(response, session.token)
      return response
    }
    const response = NextResponse.json({ ok: true, user: session.principal })
    setSessionCookie(response, session.token)
    return response
  } catch {
    return NextResponse.json({ error: 'Active application account not found.' }, { status: 401 })
  }
}
