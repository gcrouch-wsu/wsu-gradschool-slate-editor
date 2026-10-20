import { NextResponse } from 'next/server'
import { findUserByIdentity, OKTA_STATE_COOKIE, createSession } from '@/lib/auth/session-store'
import { readCookie } from '@/lib/auth/guard'
import {
  callbackUrl,
  exchangeAuthorizationCode,
  fetchOidcDiscovery,
  getOktaConfig,
  readStateCookie,
  verifyIdToken,
} from '@/lib/auth/oidc'
import { authMode } from '@/lib/runtime-config'
import { setIdTokenCookie, setSessionCookie } from '@/lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (authMode() !== 'okta') {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }
  const url = new URL(request.url)
  const stored = readStateCookie(readCookie(request, OKTA_STATE_COOKIE))
  const fail = (message: string) => {
    const dest = new URL('/sign-in', request.url)
    dest.searchParams.set('error', message)
    const response = NextResponse.redirect(dest)
    response.cookies.set({ name: OKTA_STATE_COOKIE, value: '', maxAge: 0, path: '/', httpOnly: true })
    return response
  }
  if (url.searchParams.get('error')) return fail('okta-denied')
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code || !state || !stored || stored.state !== state) return fail('invalid-state')
  const config = getOktaConfig()
  if (!config) return fail('okta-not-configured')
  try {
    const discovery = await fetchOidcDiscovery(config.issuer)
    const tokens = await exchangeAuthorizationCode({
      discovery,
      config,
      code,
      codeVerifier: stored.codeVerifier,
      redirectUri: callbackUrl(request),
    })
    const identity = await verifyIdToken({ discovery, config, idToken: tokens.id_token, nonce: stored.nonce })
    const account = await findUserByIdentity(identity.issuer, identity.subject)
    if (!account || !account.active) return fail('no-application-account')
    const session = await createSession(account.id)
    const response = NextResponse.redirect(new URL(stored.next || '/newsletters', request.url))
    setSessionCookie(response, session.token)
    setIdTokenCookie(response, tokens.id_token)
    response.cookies.set({
      name: OKTA_STATE_COOKIE,
      value: '',
      maxAge: 0,
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
    })
    return response
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Okta callback failed')
    return fail('okta-callback-failed')
  }
}
