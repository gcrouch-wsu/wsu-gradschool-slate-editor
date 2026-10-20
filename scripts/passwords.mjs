import { randomBytes, scrypt } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt)

export async function hashPassword(password) {
  if (password.length < 12) throw new Error('Password must be at least 12 characters.')
  const salt = randomBytes(16)
  const hash = await scryptAsync(password, salt, 32)
  return `scrypt:${salt.toString('base64url')}:${hash.toString('base64url')}`
}
