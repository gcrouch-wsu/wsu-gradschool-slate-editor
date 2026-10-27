import { NextResponse } from 'next/server'
import { requestEditorialSuggestion } from '@/lib/ai/assist'
import { assertAiConfigured } from '@/lib/ai/provider'
import { releaseAiRequest, reserveAiRequest } from '@/lib/ai/limits'
import { AiOutputError } from '@/lib/ai/errors'
import type { AiAction } from '@/lib/ai/instructions'
import { fieldText, isAiTarget, type AiTarget } from '@/lib/ai/proposals'
import { isPrincipal, requireEditor } from '@/lib/auth/guard'
import { documentFingerprint } from '@/lib/newsletter-document'
import { jsonError } from '@/lib/http'
import { assertEditingAuthority } from '@/lib/newsletters/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const ACTIONS = new Set<AiAction>(['edit', 'shorten', 'headlines', 'preheader', 'review'])

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const principal = await requireEditor(request)
  if (!isPrincipal(principal)) return principal
  let reservation: string | null = null
  try {
    const raw = await request.text()
    if (raw.length > 80_000) return NextResponse.json({ error: 'The AI request is too large.' }, { status: 413 })
    const body = JSON.parse(raw) as {
      action?: AiAction
      token?: string
      expectedVersion?: number
      instruction?: string
      applyHouseStyle?: boolean
      target?: AiTarget
    }
    if (
      !body ||
      typeof body.token !== 'string' ||
      !body.token ||
      typeof body.expectedVersion !== 'number' ||
      !Number.isInteger(body.expectedVersion) ||
      !body.action ||
      !ACTIONS.has(body.action) ||
      !isAiTarget(body.target, body.action)
    ) {
      return NextResponse.json(
        {
          error: 'An editing action, target, and current version are required.',
        },
        { status: 400 },
      )
    }
    const instruction = typeof body.instruction === 'string' ? body.instruction.trim().slice(0, 1000) : ''
    const { id } = await context.params
    const current = await assertEditingAuthority(id, principal.userId, body.token, body.expectedVersion)
    const fingerprint = documentFingerprint(current.content)
    const live = fieldText(current.content, body.target)
    if (body.action !== 'review' && (live === null || live !== body.target.originalText)) {
      throw new AiOutputError('The selected story changed before the suggestion was prepared. Generate it again.')
    }
    assertAiConfigured()
    reservation = await reserveAiRequest(principal.userId)
    const result = await requestEditorialSuggestion({
      action: body.action,
      document: current.content,
      target: body.target,
      instruction,
      applyHouseStyle: body.applyHouseStyle === true,
    })
    await assertEditingAuthority(id, principal.userId, body.token, body.expectedVersion!)
    return NextResponse.json({
      ...result,
      base: {
        newsletterId: id,
        saveVersion: current.saveVersion,
        fingerprint,
        document: current.content,
        target: body.target,
      },
    })
  } catch (error) {
    return jsonError(error)
  } finally {
    if (reservation) {
      try {
        await releaseAiRequest(principal.userId, reservation)
      } catch {
        // The suggestion response is unchanged if the in-flight lock cannot be cleared.
      }
    }
  }
}
