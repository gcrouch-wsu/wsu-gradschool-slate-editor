import { NextResponse } from 'next/server'
import { DocumentValidationError } from '@/lib/newsletter-document'
import { AccountConflictError } from '@/lib/auth/session-store'
import { EditConflictError } from '@/lib/newsletters/service'
import { sessionTtlSeconds } from '@/lib/runtime-config'
import { OKTA_ID_TOKEN_COOKIE, SESSION_COOKIE } from '@/lib/auth/session-store'

export function jsonError(error: unknown): NextResponse {
  if (error instanceof EditConflictError) {
    const status = error.code === 'not_found' ? 404 : 409
    return NextResponse.json({ error: error.message, code: error.code }, { status })
  }
  if (error instanceof AccountConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 })
  }
  if (error instanceof DocumentValidationError || error instanceof SyntaxError) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  console.error(
    JSON.stringify({
      event: 'request_failed',
      name: error instanceof Error ? error.name : 'Error',
    })
  )
  return NextResponse.json({ error: 'Request failed.' }, { status: 500 })
}

function cookieBase() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  }
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set({ ...cookieBase(), name: SESSION_COOKIE, value: token, maxAge: sessionTtlSeconds() })
}

export function setIdTokenCookie(response: NextResponse, idToken: string) {
  response.cookies.set({ ...cookieBase(), name: OKTA_ID_TOKEN_COOKIE, value: idToken, maxAge: sessionTtlSeconds() })
}

export function clearAuthCookies(response: NextResponse) {
  for (const name of [SESSION_COOKIE, OKTA_ID_TOKEN_COOKIE]) {
    response.cookies.set({ ...cookieBase(), name, value: '', maxAge: 0 })
  }
}
