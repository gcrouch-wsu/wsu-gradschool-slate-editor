import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let cached: { version: string; text: string } | null = null

export function loadStyleGuide(): { version: string; text: string } {
  if (cached) return cached
  const text = readFileSync(join(process.cwd(), 'style.md'), 'utf8')
  const version = text.match(/\*\*Version:\*\*\s*([0-9]+(?:\.[0-9]+)*)/)?.[1]
  if (!version) throw new Error('style.md is missing a version.')
  cached = { version, text }
  return cached
}
