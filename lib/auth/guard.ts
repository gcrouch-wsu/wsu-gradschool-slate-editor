import { NextResponse } from 'next/server'
import { principalFromToken, SESSION_COOKIE, type Principal } from '@/lib/auth/session-store'
import { publicOrigin } from '@/lib/runtime-config'
import { canEdit } from '@/lib/newsletters/service'

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return null
}

export function rejectCrossOrigin(request: Request): NextResponse | null {
  if (request.method === 'GET' || request.method === 'HEAD') return null
  const origin = request.headers.get('origin')
  let expected: string
  try {
    expected = publicOrigin(request)
  } catch {
    expected = new URL(request.url).origin
  }
  if (!origin) {
    const site = request.headers.get('sec-fetch-site')
    if (site === 'same-origin' || site === 'none') return null
    return NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403 })
  }
  if (origin !== expected) {
    return NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403 })
  }
  return null
}

export async function principalFromRequest(request: Request): Promise<Principal | null> {
  const token = readCookie(request, SESSION_COOKIE)
  if (!token) return null
  return principalFromToken(token)
}

export async function requirePrincipal(request: Request): Promise<Principal | NextResponse> {
  const originError = rejectCrossOrigin(request)
  if (originError) return originError
  const principal = await principalFromRequest(request)
  if (!principal) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  return principal
}

export async function requireEditor(request: Request): Promise<Principal | NextResponse> {
  const principal = await requirePrincipal(request)
  if (principal instanceof NextResponse) return principal
  if (!canEdit(principal.role)) {
    return NextResponse.json({ error: 'Editing permission is required.' }, { status: 403 })
  }
  return principal
}

export async function requireAdministrator(request: Request): Promise<Principal | NextResponse> {
  const principal = await requirePrincipal(request)
  if (principal instanceof NextResponse) return principal
  if (principal.role !== 'administrator') {
    return NextResponse.json({ error: 'Administrator permission is required.' }, { status: 403 })
  }
  return principal
}

export function isPrincipal(value: Principal | NextResponse): value is Principal {
  return !(value instanceof NextResponse)
}

export async function allowContentRoute(request: Request): Promise<NextResponse | null> {
  const principal = await requireEditor(request)
  return isPrincipal(principal) ? null : principal
}
