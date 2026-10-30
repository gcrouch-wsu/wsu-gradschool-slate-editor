// 'unset' means AUTH_MODE is missing or not recognized; the app reports it and nobody can sign in.
export type AuthMode = 'local' | 'okta' | 'development' | 'unset'

const REQUIRED_OKTA = [
  'OKTA_ISSUER',
  'OKTA_CLIENT_ID',
  'OKTA_CLIENT_SECRET',
  'SESSION_SECRET',
  'PUBLIC_ORIGIN',
  'DATABASE_URL',
] as const

export function authMode(): AuthMode {
  const configured = process.env.AUTH_MODE?.trim()
  if (configured === 'okta') return 'okta'
  if (configured === 'local') return 'local'
  if (configured === 'development') return 'development'
  return 'unset'
}

export function configurationProblems(): string[] {
  const problems: string[] = []
  const mode = authMode()
  if (mode === 'unset') problems.push('AUTH_MODE must be local, okta, or development.')
  if (mode === 'development' && process.env.NODE_ENV === 'production') {
    problems.push('AUTH_MODE=development is not available in production.')
  }
  if (mode === 'local') {
    if (!process.env.DATABASE_URL?.trim()) problems.push('DATABASE_URL is required for local accounts.')
    const secret = process.env.SESSION_SECRET?.trim()
    if (!secret || secret.length < 32) problems.push('SESSION_SECRET must be at least 32 characters.')
  }
  if (mode === 'okta') {
    for (const key of REQUIRED_OKTA) {
      if (!process.env[key]?.trim()) problems.push(`${key} is required in Okta mode.`)
    }
    const origin = process.env.PUBLIC_ORIGIN?.trim()
    if (origin && !/^https?:\/\//.test(origin)) {
      problems.push('PUBLIC_ORIGIN must be an absolute http(s) origin.')
    }
    const secret = process.env.SESSION_SECRET?.trim()
    if (secret && secret.length < 32) {
      problems.push('SESSION_SECRET must be at least 32 characters.')
    }
  }
  return problems
}

export function publicOrigin(request?: Request): string {
  const configured = process.env.PUBLIC_ORIGIN?.trim().replace(/\/+$/, '')
  if (configured) return configured
  if (authMode() === 'okta') {
    throw new Error('PUBLIC_ORIGIN is required in Okta mode.')
  }
  if (request) return new URL(request.url).origin
  throw new Error('PUBLIC_ORIGIN is required.')
}

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim()
  if (!url) throw new Error('DATABASE_URL is required.')
  return url
}

export function sessionTtlSeconds(): number {
  const configured = Number(process.env.SESSION_TTL_SECONDS ?? 8 * 60 * 60)
  if (!Number.isFinite(configured) || configured < 300) return 8 * 60 * 60
  return configured
}
