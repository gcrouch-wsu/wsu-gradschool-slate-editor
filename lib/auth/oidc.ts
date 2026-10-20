import { createHash, randomBytes } from 'node:crypto'
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'
import { readSignedPayload, signPayload } from '@/lib/auth/crypto'
import { authMode, publicOrigin } from '@/lib/runtime-config'

export const OKTA_CALLBACK_PATH = '/authorization-code/callback'
export const OKTA_POST_LOGOUT_PATH = '/'

export interface OktaConfig {
  issuer: string
  clientId: string
  clientSecret: string
}

export interface OidcDiscovery {
  authorization_endpoint: string
  token_endpoint: string
  jwks_uri: string
  end_session_endpoint?: string
  issuer: string
}

export interface VerifiedOktaIdentity {
  issuer: string
  subject: string
  email: string | null
  name?: string
}

interface StatePayload {
  state: string
  nonce: string
  codeVerifier: string
  next: string
  expiresAt: number
}

const discoveryCache = new Map<string, { at: number; doc: OidcDiscovery }>()

export function getOktaConfig(): OktaConfig | null {
  const issuer = process.env.OKTA_ISSUER?.trim().replace(/\/+$/, '') ?? ''
  const clientId = process.env.OKTA_CLIENT_ID?.trim() ?? ''
  const clientSecret = process.env.OKTA_CLIENT_SECRET?.trim() ?? ''
  if (!issuer || !clientId || !clientSecret) return null
  return { issuer, clientId, clientSecret }
}

export function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim()
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET is required.')
  }
  return secret
}

function base64Url(buffer: Buffer) {
  return buffer.toString('base64url')
}

export function createPkcePair() {
  const verifier = base64Url(randomBytes(32))
  const challenge = base64Url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

export async function fetchOidcDiscovery(issuer: string): Promise<OidcDiscovery> {
  const cached = discoveryCache.get(issuer)
  if (cached && Date.now() - cached.at < 60 * 60 * 1000) return cached.doc
  const response = await fetch(`${issuer}/.well-known/openid-configuration`, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Unable to load Okta discovery document (${response.status}).`)
  const doc = (await response.json()) as OidcDiscovery
  if (!doc.authorization_endpoint || !doc.token_endpoint || !doc.jwks_uri || !doc.issuer) {
    throw new Error('Okta discovery document is missing required endpoints.')
  }
  if (doc.issuer.replace(/\/+$/, '') !== issuer) {
    throw new Error('Okta discovery issuer does not match the configured issuer.')
  }
  discoveryCache.set(issuer, { at: Date.now(), doc })
  return doc
}

export function callbackUrl(request?: Request): string {
  return `${publicOrigin(request)}${OKTA_CALLBACK_PATH}`
}

export function postLogoutUrl(request?: Request): string {
  return publicOrigin(request)
}

export function buildAuthorizationUrl(input: {
  discovery: OidcDiscovery
  config: OktaConfig
  redirectUri: string
  state: string
  nonce: string
  codeChallenge: string
}): string {
  const url = new URL(input.discovery.authorization_endpoint)
  url.searchParams.set('client_id', input.config.clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'openid email profile')
  url.searchParams.set('redirect_uri', input.redirectUri)
  url.searchParams.set('state', input.state)
  url.searchParams.set('nonce', input.nonce)
  url.searchParams.set('code_challenge', input.codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

export function createStateCookie(payload: Omit<StatePayload, 'expiresAt'>): string {
  const encoded = JSON.stringify({ ...payload, expiresAt: Date.now() + 10 * 60 * 1000 })
  return signPayload(encoded, sessionSecret())
}

export function readStateCookie(value: string | undefined | null): StatePayload | null {
  if (!value) return null
  let secret: string
  try {
    secret = sessionSecret()
  } catch {
    return null
  }
  const json = readSignedPayload(value, secret)
  if (!json) return null
  const parsed = JSON.parse(json) as StatePayload
  if (!parsed.state || !parsed.nonce || !parsed.codeVerifier || parsed.expiresAt <= Date.now()) return null
  if (!parsed.next.startsWith('/') || parsed.next.startsWith('//')) parsed.next = '/newsletters'
  return parsed
}

export async function exchangeAuthorizationCode(input: {
  discovery: OidcDiscovery
  config: OktaConfig
  code: string
  codeVerifier: string
  redirectUri: string
}): Promise<{ id_token: string }> {
  const basic = Buffer.from(`${input.config.clientId}:${input.config.clientSecret}`, 'utf8').toString('base64')
  const response = await fetch(input.discovery.token_endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.codeVerifier,
    }),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Okta token exchange failed (${response.status}).`)
  const tokens = (await response.json()) as { id_token?: string }
  if (!tokens.id_token) throw new Error('Okta token response did not include an ID token.')
  return { id_token: tokens.id_token }
}

export async function verifyIdToken(input: {
  discovery: OidcDiscovery
  config: OktaConfig
  idToken: string
  nonce: string
  jwks?: JWTVerifyGetKey
}): Promise<VerifiedOktaIdentity> {
  const issuer = input.config.issuer
  if (input.discovery.issuer.replace(/\/+$/, '') !== issuer) {
    throw new Error('Okta discovery issuer does not match the configured issuer.')
  }
  const jwks = input.jwks ?? createRemoteJWKSet(new URL(input.discovery.jwks_uri))
  const { payload } = await jwtVerify(input.idToken, jwks, {
    issuer,
    audience: input.config.clientId,
  })
  if (payload.nonce !== input.nonce) throw new Error('Okta ID token nonce mismatch.')
  if (typeof payload.sub !== 'string' || !payload.sub) {
    throw new Error('Okta ID token did not include a subject.')
  }
  const email = typeof payload.email === 'string' && payload.email.includes('@') ? payload.email.trim().toLowerCase() : null
  const name = typeof payload.name === 'string' ? payload.name.trim() : undefined
  return { issuer, subject: payload.sub, email, name: name || undefined }
}

export function buildOktaLogoutUrl(input: {
  discovery: OidcDiscovery
  config: OktaConfig
  postLogoutRedirectUri: string
  idToken?: string | null
}): string | null {
  if (!input.idToken || !input.discovery.end_session_endpoint) return null
  const url = new URL(input.discovery.end_session_endpoint)
  url.searchParams.set('id_token_hint', input.idToken)
  url.searchParams.set('post_logout_redirect_uri', input.postLogoutRedirectUri)
  url.searchParams.set('client_id', input.config.clientId)
  return url.toString()
}

export function oktaModeEnabled(): boolean {
  return authMode() === 'okta'
}
