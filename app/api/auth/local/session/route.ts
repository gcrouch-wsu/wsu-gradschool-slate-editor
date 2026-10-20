import { NextResponse } from 'next/server'
import { rejectCrossOrigin } from '@/lib/auth/guard'
import { authenticateLocalUser, createSession } from '@/lib/auth/session-store'
import { setSessionCookie } from '@/lib/http'
import { authMode } from '@/lib/runtime-config'

function navigationUrl(request: Request, path: string): URL {
  const host = request.headers.get('host')?.trim() ?? ''
  const configured = process.env.PUBLIC_ORIGIN?.trim().replace(/\/+$/, '')
  if (host && !/[\s/@]/.test(host)) {
    if (configured) {
      const configuredUrl = new URL(configured)
      if (configuredUrl.host === host) return new URL(path, configured)
      const localHost = host === 'localhost' || host.startsWith('localhost:') || host.startsWith('127.0.0.1')
      const protocol = localHost ? 'http:' : configuredUrl.protocol
      return new URL(path, `${protocol}//${host}`)
    }
    return new URL(path, `${new URL(request.url).protocol}//${host}`)
  }
  return new URL(path, configured || request.url)
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (authMode() !== 'local') {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }
  const originError = rejectCrossOrigin(request)
  if (originError) return originError
  const contentType = request.headers.get('content-type') ?? ''
  let email = ''
  let password = ''
  let nextPath = '/newsletters'
  let formPost = false
  if (contentType.includes('application/json')) {
    const body = (await request.json().catch(() => null)) as { email?: unknown; password?: unknown } | null
    if (body && typeof body.email === 'string') email = body.email
    if (body && typeof body.password === 'string') password = body.password
  } else {
    formPost = true
    const data = await request.formData()
    email = String(data.get('email') ?? '')
    password = String(data.get('password') ?? '')
    const next = String(data.get('next') ?? '')
    if (next.startsWith('/') && !next.startsWith('//')) nextPath = next
  }
  const userId = email && password ? await authenticateLocalUser(email, password) : null
  if (!userId) {
    if (formPost) {
      return NextResponse.redirect(navigationUrl(request, '/sign-in?error=credentials'), 303)
    }
    return NextResponse.json({ error: 'Email or password is incorrect.' }, { status: 401 })
  }
  const session = await createSession(userId)
  if (formPost) {
    const response = NextResponse.redirect(navigationUrl(request, nextPath), 303)
    setSessionCookie(response, session.token)
    return response
  }
  const response = NextResponse.json({ ok: true, user: session.principal })
  setSessionCookie(response, session.token)
  return response
}
