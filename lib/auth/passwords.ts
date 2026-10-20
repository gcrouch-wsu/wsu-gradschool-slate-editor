import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt)
const KEY_LENGTH = 32

export function passwordProblems(password: string): string | null {
  if (password.length < 12) return 'Password must be at least 12 characters.'
  return null
}

export async function hashPassword(password: string): Promise<string> {
  const problem = passwordProblems(password)
  if (problem) throw new Error(problem)
  const salt = randomBytes(16)
  const hash = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer
  return `scrypt:${salt.toString('base64url')}:${hash.toString('base64url')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, salt, hash] = stored.split(':')
    if (scheme !== 'scrypt' || !salt || !hash) return false
    const saltBytes = Buffer.from(salt, 'base64url')
    const expected = Buffer.from(hash, 'base64url')
    if (saltBytes.length === 0 || expected.length !== KEY_LENGTH) return false
    const actual = (await scryptAsync(password, saltBytes, KEY_LENGTH)) as Buffer
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}
