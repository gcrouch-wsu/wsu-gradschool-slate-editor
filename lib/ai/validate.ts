import { sanitizeRichHtml } from '@/lib/newsletter-document'
import { AiOutputError } from '@/lib/ai/errors'
import type { ReviewFinding, TextSuggestion } from '@/lib/ai/proposals'
import type { AiAction } from '@/lib/ai/instructions'
import type { NewsletterData } from '@/types/newsletter'
import { preserveHtmlContract, preserveTextReferences } from './html-contract'
import { sectionIndexOf } from './proposals'

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AiOutputError('The AI response was not a JSON object.')
  }
  return value as Record<string, unknown>
}

export function parseModelJson(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  try {
    return JSON.parse(trimmed)
  } catch {
    throw new AiOutputError('The AI response was not valid JSON.')
  }
}

function onlyKeys(record: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(record).some((key) => !allowed.includes(key))) {
    throw new AiOutputError('The AI response included unsupported fields or newsletter structure.')
  }
}

function plain(value: unknown, max: number): string {
  if (typeof value !== 'string') throw new AiOutputError('The AI response used an unsupported field.')
  const text = value.trim()
  if (!text || text.length > max) throw new AiOutputError('The suggestion was empty or too long.')
  if (/[<>]/.test(text)) throw new AiOutputError('The suggestion contained unsupported HTML.')
  return text
}

function rich(original: string, proposed: unknown): string {
  if (typeof proposed !== 'string') throw new AiOutputError('The AI response used an unsupported field.')
  if (!proposed.trim() || proposed.length > 20_000) throw new AiOutputError('The suggestion was empty or too long.')
  const clean = sanitizeRichHtml(proposed)
  if (!clean) throw new AiOutputError('The suggestion contained unsupported HTML.')
  preserveHtmlContract(original, proposed, clean)
  return clean
}

function reasons(value: unknown): string {
  const record = asRecord(value)
  const list = Array.isArray(record.reasons) ? record.reasons : []
  const text = list
    .slice(0, 4)
    .map((item) => {
      const reason = asRecord(item)
      onlyKeys(reason, ['guide', 'text'])
      const guide = typeof reason.guide === 'string' ? reason.guide.trim().slice(0, 120) : ''
      const detail = typeof reason.text === 'string' ? reason.text.trim().slice(0, 400) : ''
      if (!guide || !detail) return ''
      return `${guide}: ${detail}`
    })
    .filter(Boolean)
  if (text.length === 0) throw new AiOutputError('The suggestion did not explain which guide section it used.')
  return text.join(' ')
}

export function validateSuggestion(
  action: AiAction,
  original: string,
  payload: unknown,
): TextSuggestion | TextSuggestion[] {
  const record = asRecord(payload)
  if ('sections' in record || 'settings' in record || 'template' in record) {
    throw new AiOutputError('The suggestion tried to change the newsletter structure.')
  }
  if (action === 'headlines' || action === 'preheader') {
    onlyKeys(record, ['suggestions'])
    if (!Array.isArray(record.suggestions) || record.suggestions.length > 3)
      throw new AiOutputError('Invalid suggestion list.')
    const suggestions = record.suggestions
    const parsed = suggestions.slice(0, 3).map((item) => {
      const suggestion = asRecord(item)
      onlyKeys(suggestion, ['text', 'reason'])
      const proposed = plain(suggestion.text, action === 'preheader' ? 180 : 200)
      preserveTextReferences(original, proposed)
      return { proposed, reason: plain(suggestion.reason, 400) }
    })
    if (parsed.length === 0) throw new AiOutputError('The AI response did not include a suggestion.')
    return parsed
  }
  onlyKeys(record, ['proposed', 'reasons'])
  if (!Array.isArray(record.reasons) || record.reasons.length > 4)
    throw new AiOutputError('Invalid suggestion reasons.')
  const proposed = rich(original, record.proposed)
  return { proposed, reason: reasons(record) }
}

export function validateReview(document: NewsletterData, payload: unknown): ReviewFinding[] {
  const record = asRecord(payload)
  if ('sections' in record || 'settings' in record || 'proposedDocument' in record) {
    throw new AiOutputError('The review tried to replace the newsletter.')
  }
  onlyKeys(record, ['findings'])
  if (!Array.isArray(record.findings) || record.findings.length > 12)
    throw new AiOutputError('Invalid review findings.')
  const findings = record.findings
  const parsed: ReviewFinding[] = []
  for (const item of findings.slice(0, 12)) {
    const finding = asRecord(item)
    onlyKeys(finding, [
      'sectionKey',
      'sectionIndex',
      'sectionTitle',
      'cardIndex',
      'field',
      'summary',
      'proposed',
      'reason',
      'kind',
    ])
    const sectionKey = typeof finding.sectionKey === 'string' ? finding.sectionKey : ''
    const sectionIndex = sectionIndexOf(document, {
      sectionKey,
      sectionIndex: typeof finding.sectionIndex === 'number' ? finding.sectionIndex : undefined,
    })
    const section = document.sections[sectionIndex]
    const cardIndex = Number.isInteger(finding.cardIndex) ? Number(finding.cardIndex) : null
    const field =
      finding.field === 'title' || finding.field === 'body_html' || finding.field === 'preheader' ? finding.field : null
    if (!field || (field !== 'preheader' && !section))
      throw new AiOutputError('A review finding did not identify a story in this newsletter.')
    const card = cardIndex === null ? null : section?.cards?.[cardIndex]
    if (field !== 'preheader' && !card)
      throw new AiOutputError('A review finding did not identify a story in this newsletter.')
    if (field === 'title' && card && !('title' in card)) throw new AiOutputError('This story has no title field.')
    const originalText =
      field === 'preheader'
        ? document.masthead.preheader || ''
        : field === 'title'
          ? card && 'title' in card
            ? card.title || ''
            : ''
          : card?.body_html || ''
    const proposed =
      finding.proposed === null || finding.proposed === undefined || finding.proposed === ''
        ? null
        : field === 'body_html'
          ? rich(originalText, finding.proposed)
          : plain(finding.proposed, 500)
    if (proposed !== null && field !== 'body_html') preserveTextReferences(originalText, proposed)
    if (!['accuracy', 'style', 'accessibility'].includes(String(finding.kind)))
      throw new AiOutputError('Invalid review finding kind.')
    const kind = finding.kind === 'accuracy' || finding.kind === 'accessibility' ? finding.kind : 'style'
    parsed.push({
      sectionKey,
      ...(sectionIndex >= 0 ? { sectionIndex } : {}),
      sectionTitle: section?.title || (field === 'preheader' ? 'Newsletter' : sectionKey),
      cardIndex,
      cardTitle: card && 'title' in card && card.title ? card.title : 'Preheader',
      field,
      summary: plain(finding.summary, 400),
      proposed,
      reason: plain(finding.reason, 400),
      kind,
      originalText,
    })
  }
  return parsed
}
