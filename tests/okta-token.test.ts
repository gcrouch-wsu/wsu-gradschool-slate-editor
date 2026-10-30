import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from 'jose'
import { afterEach, expect, test } from 'vitest'
import { buildOktaLogoutUrl, createStateCookie, readStateCookie, verifyIdToken } from '@/lib/auth/oidc'
import { POST as developmentSession } from '@/app/api/auth/development/session/route'
import { access } from 'node:fs/promises'
import { authMode, configurationProblems } from '@/lib/runtime-config'

const issuer = 'https://issuer.example.edu'
const clientId = 'editor-client'
const previous: Record<string, string | undefined> = {}

function setEnv(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    if (!(key in previous)) previous[key] = process.env[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

afterEach(() => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
    delete previous[key]
  }
})

async function token(input: {
  subject?: string
  nonce?: string
  audience?: string
  issuer?: string
  omitSubject?: boolean
}) {
  const keys = await generateKeyPair('RS256')
  const jwk = await exportJWK(keys.publicKey)
  const jwks = createLocalJWKSet({ keys: [{ ...jwk, alg: 'RS256', use: 'sig' }] }) as JWTVerifyGetKey
  const claims = new SignJWT({ nonce: input.nonce ?? 'nonce-1', email: 'person@example.edu' })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(input.issuer ?? issuer)
    .setAudience(input.audience ?? clientId)
    .setExpirationTime('2m')
  if (!input.omitSubject) claims.setSubject(input.subject ?? 'subject-1')
  return { idToken: await claims.sign(keys.privateKey), jwks }
}

const discovery = {
  authorization_endpoint: `${issuer}/auth`,
  token_endpoint: `${issuer}/token`,
  jwks_uri: `${issuer}/keys`,
  end_session_endpoint: `${issuer}/logout`,
  issuer,
}

test('verifies a matching Okta ID token', async () => {
  const signed = await token({})
  const identity = await verifyIdToken({
    discovery,
    config: { issuer, clientId, clientSecret: 'secret' },
    idToken: signed.idToken,
    nonce: 'nonce-1',
    jwks: signed.jwks,
  })
  expect(identity).toMatchObject({ issuer, subject: 'subject-1', email: 'person@example.edu' })
})

test('rejects a wrong issuer, audience, nonce, or missing subject', async () => {
  const config = { issuer, clientId, clientSecret: 'secret' }
  const wrongIssuer = await token({ issuer: 'https://other.example.edu' })
  await expect(
    verifyIdToken({ discovery, config, idToken: wrongIssuer.idToken, nonce: 'nonce-1', jwks: wrongIssuer.jwks })
  ).rejects.toThrow()
  const wrongAudience = await token({ audience: 'other-client' })
  await expect(
    verifyIdToken({ discovery, config, idToken: wrongAudience.idToken, nonce: 'nonce-1', jwks: wrongAudience.jwks })
  ).rejects.toThrow()
  const badNonce = await token({ nonce: 'other-nonce' })
  await expect(
    verifyIdToken({ discovery, config, idToken: badNonce.idToken, nonce: 'nonce-1', jwks: badNonce.jwks })
  ).rejects.toThrow(/nonce/)
  const missingSubject = await token({ omitSubject: true })
  await expect(
    verifyIdToken({ discovery, config, idToken: missingSubject.idToken, nonce: 'nonce-1', jwks: missingSubject.jwks })
  ).rejects.toThrow(/subject/)
})

test('logout URL requires an ID token and uses the bare origin', () => {
  const config = { issuer, clientId, clientSecret: 'secret' }
  expect(buildOktaLogoutUrl({ discovery, config, postLogoutRedirectUri: 'https://editor.example.edu', idToken: null })).toBeNull()
  const url = new URL(
    buildOktaLogoutUrl({
      discovery,
      config,
      postLogoutRedirectUri: 'https://editor.example.edu',
      idToken: 'header.payload.sig',
    })!
  )
  expect(url.searchParams.get('post_logout_redirect_uri')).toBe('https://editor.example.edu')
  expect(url.searchParams.get('id_token_hint')).toBe('header.payload.sig')
})

test('state cookies are signed and expire', () => {
  setEnv({ SESSION_SECRET: 'x'.repeat(40) })
  const cookie = createStateCookie({
    state: 'state-1',
    nonce: 'nonce-1',
    codeVerifier: 'verifier',
    next: '/newsletters',
  })
  expect(readStateCookie(cookie)?.state).toBe('state-1')
  expect(readStateCookie(`${cookie}tampered`)).toBeNull()
})

test('Okta mode has no development or password sign-in', async () => {
  setEnv({
    AUTH_MODE: 'okta',
    NODE_ENV: 'test',
    OKTA_ISSUER: '',
    OKTA_CLIENT_ID: '',
    OKTA_CLIENT_SECRET: '',
    SESSION_SECRET: 'short',
    PUBLIC_ORIGIN: 'not-a-url',
    DATABASE_URL: '',
  })
  expect(authMode()).toBe('okta')
  expect(configurationProblems().join('\n')).toMatch(/OKTA_ISSUER/)
  expect(configurationProblems().join('\n')).toMatch(/SESSION_SECRET/)
  const response = await developmentSession(new Request('http://localhost/api/auth/development/session', { method: 'POST' }))
  expect(response.status).toBe(404)
  for (const path of ['app/api/auth/password/route.ts', 'app/api/auth/login/route.ts', 'app/api/auth/reset/route.ts']) {
    await expect(access(path)).rejects.toThrow()
  }
})

test('production refuses development mode', () => {
  setEnv({ NODE_ENV: 'production', AUTH_MODE: 'development' })
  expect(configurationProblems()).toContain('AUTH_MODE=development is not available in production.')
})

test('local sign-in is unavailable unless local mode is selected', async () => {
  setEnv({ AUTH_MODE: undefined, NODE_ENV: 'production' })
  const { POST } = await import('@/app/api/auth/local/session/route')
  const response = await POST(new Request('http://localhost/api/auth/local/session', { method: 'POST' }))
  expect(response.status).toBe(404)
})

test('a missing auth mode is reported instead of opening an unsigned editor', () => {
  setEnv({
    NODE_ENV: 'production',
    AUTH_MODE: undefined,
    DATABASE_URL: undefined,
    OKTA_ISSUER: undefined,
    PUBLIC_ORIGIN: undefined,
  })
  expect(authMode()).toBe('unset')
  expect(configurationProblems()).toEqual(['AUTH_MODE must be local, okta, or development.'])
})
