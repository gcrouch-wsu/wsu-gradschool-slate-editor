import { NextResponse } from 'next/server'
import { OKTA_STATE_COOKIE } from '@/lib/auth/session-store'
import {
  buildAuthorizationUrl,
  callbackUrl,
  createPkcePair,
  createStateCookie,
  fetchOidcDiscovery,
  getOktaConfig,
} from '@/lib/auth/oidc'
import { authMode } from '@/lib/runtime-config'
import { randomToken } from '@/lib/auth/crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (authMode() !== 'okta') {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }
  const config = getOktaConfig()
  if (!config) return NextResponse.json({ error: 'Okta is not configured.' }, { status: 503 })
  try {
    const discovery = await fetchOidcDiscovery(config.issuer)
    const pkce = createPkcePair()
    const state = randomToken(24)
    const nonce = randomToken(24)
    const next = new URL(request.url).searchParams.get('next') || '/newsletters'
    const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/newsletters'
    const redirect = NextResponse.redirect(
      buildAuthorizationUrl({
        discovery,
        config,
        redirectUri: callbackUrl(request),
        state,
        nonce,
        codeChallenge: pkce.challenge,
      })
    )
    redirect.cookies.set({
      name: OKTA_STATE_COOKIE,
      value: createStateCookie({ state, nonce, codeVerifier: pkce.verifier, next: safeNext }),
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 600,
    })
    return redirect
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Okta start failed')
    return NextResponse.redirect(new URL('/sign-in?error=okta-start-failed', request.url))
  }
}
