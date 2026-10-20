import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function signPayload(payload: string, secret: string): string {
  const body = Buffer.from(payload, 'utf8').toString('base64url')
  const signature = createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${signature}`
}

export function readSignedPayload(value: string, secret: string): string | null {
  const [body, signature] = value.split('.')
  if (!body || !signature) return null
  const expected = createHmac('sha256', secret).update(body).digest('base64url')
  const left = Buffer.from(signature)
  const right = Buffer.from(expected)
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null
  return Buffer.from(body, 'base64url').toString('utf8')
}
