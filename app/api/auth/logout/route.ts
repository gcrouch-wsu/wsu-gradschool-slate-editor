import { NextResponse } from 'next/server'
import { readCookie, rejectCrossOrigin } from '@/lib/auth/guard'
import { OKTA_ID_TOKEN_COOKIE, SESSION_COOKIE, revokeSession } from '@/lib/auth/session-store'
import { buildOktaLogoutUrl, fetchOidcDiscovery, getOktaConfig, postLogoutUrl } from '@/lib/auth/oidc'
import { clearAuthCookies } from '@/lib/http'
import { authMode } from '@/lib/runtime-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const originError = rejectCrossOrigin(request)
  if (originError) return originError
  const token = readCookie(request, SESSION_COOKIE)
  if (token) await revokeSession(token).catch(() => undefined)
  let oktaLogoutUrl: string | null = null
  let oktaLogout: 'started' | 'unavailable' = 'unavailable'
  if (authMode() === 'okta') {
    try {
      const config = getOktaConfig()
      const idToken = readCookie(request, OKTA_ID_TOKEN_COOKIE)
      if (config && idToken) {
        const discovery = await fetchOidcDiscovery(config.issuer)
        oktaLogoutUrl = buildOktaLogoutUrl({
          discovery,
          config,
          postLogoutRedirectUri: postLogoutUrl(request),
          idToken,
        })
        if (oktaLogoutUrl) oktaLogout = 'started'
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'Okta logout discovery failed')
    }
  }
  const response = NextResponse.json({
    applicationSignedOut: true,
    oktaLogout,
    oktaLogoutUrl,
  })
  clearAuthCookies(response)
  return response
}
