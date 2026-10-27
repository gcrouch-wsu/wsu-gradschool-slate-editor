import { canonicalJson } from '@/lib/canonical-json'
import type { ContentOrigin, NewsletterData } from '@/types/newsletter'
import type { AiAction } from '@/lib/ai/instructions'

export interface AiTarget {
  kind: 'card' | 'preheader' | 'review'
  sectionKey: string
  sectionIndex?: number
  cardIndex: number | null
  field: 'title' | 'body_html' | 'preheader'
  originalText: string
  label: string
}

export function isAiTarget(value: unknown, action: AiAction): value is AiTarget {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const target = value as Record<string, unknown>
  if (
    Object.keys(target).some(
      (key) => !['kind', 'sectionKey', 'sectionIndex', 'cardIndex', 'field', 'originalText', 'label'].includes(key),
    )
  )
    return false
  if (target.sectionIndex !== undefined && (!Number.isInteger(target.sectionIndex) || Number(target.sectionIndex) < 0))
    return false
  if (
    typeof target.originalText !== 'string' ||
    target.originalText.length > 20_000 ||
    typeof target.label !== 'string' ||
    target.label.length > 300 ||
    typeof target.sectionKey !== 'string'
  )
    return false
  if (action === 'review' || action === 'preheader') {
    return (
      target.kind === (action === 'review' ? 'review' : 'preheader') &&
      target.field === 'preheader' &&
      target.sectionKey === '' &&
      target.cardIndex === null
    )
  }
  return (
    target.kind === 'card' &&
    target.sectionKey.length > 0 &&
    target.sectionKey.length <= 100 &&
    Number.isInteger(target.cardIndex) &&
    Number(target.cardIndex) >= 0 &&
    target.field === (action === 'headlines' ? 'title' : 'body_html')
  )
}

export interface ProposalBase {
  newsletterId: string
  saveVersion: number
  fingerprint: string
  document: NewsletterData
  target: AiTarget
}

export interface TextSuggestion {
  proposed: string
  reason: string
}

export interface ReviewFinding {
  sectionKey: string
  sectionIndex?: number
  sectionTitle: string
  cardIndex: number | null
  cardTitle: string
  field: 'title' | 'body_html' | 'preheader'
  summary: string
  proposed: string | null
  reason: string
  kind: 'accuracy' | 'style' | 'accessibility'
  originalText: string
}

export function sectionIndexOf(
  document: NewsletterData,
  target: Pick<AiTarget, 'sectionKey' | 'sectionIndex'>,
): number {
  if (target.sectionIndex !== undefined)
    return document.sections[target.sectionIndex]?.key === target.sectionKey ? target.sectionIndex : -1
  const matches = document.sections
    .map((section, index) => (section.key === target.sectionKey ? index : -1))
    .filter((index) => index >= 0)
  return matches.length === 1 ? matches[0] : -1
}

export function fieldText(document: NewsletterData, target: AiTarget): string | null {
  if (target.kind === 'preheader' || target.field === 'preheader') return document.masthead.preheader ?? ''
  const section = document.sections[sectionIndexOf(document, target)]
  if (!section || target.cardIndex === null) return null
  const card = section.cards?.[target.cardIndex]
  if (!card) return null
  if (target.field === 'title') return 'title' in card ? (card.title ?? '') : null
  return card.body_html ?? ''
}

export function proposalIsCurrent(input: {
  base: ProposalBase
  newsletterId: string
  saveVersion: number
  canWrite: boolean
  document: NewsletterData
  replacementOriginal?: string
}): { ok: true } | { ok: false; message: string } {
  if (input.base.newsletterId !== input.newsletterId) {
    return {
      ok: false,
      message: 'This suggestion belongs to a different draft. Generate it again.',
    }
  }
  if (!input.canWrite) {
    return {
      ok: false,
      message: 'Editing authority changed. Generate the suggestion again after you can edit this draft.',
    }
  }
  if (
    input.base.saveVersion !== input.saveVersion ||
    canonicalJson(input.base.document) !== canonicalJson(input.document)
  ) {
    return {
      ok: false,
      message: 'This suggestion is out of date because the draft changed. Generate it again.',
    }
  }
  const target = {
    ...input.base.target,
    originalText: input.replacementOriginal ?? input.base.target.originalText,
  }
  const current = fieldText(input.document, target)
  if (current === null || current !== target.originalText) {
    return {
      ok: false,
      message: 'The selected story is no longer in the same place. Generate the suggestion again.',
    }
  }
  return { ok: true }
}

export function applyFieldChange(document: NewsletterData, target: AiTarget, proposed: string): NewsletterData {
  if (target.field === 'preheader' || target.kind === 'preheader') {
    return {
      ...document,
      masthead: { ...document.masthead, preheader: proposed },
    }
  }
  return {
    ...document,
    sections: document.sections.map((section, sectionIndex) => {
      if (sectionIndex !== sectionIndexOf(document, target)) return section
      return {
        ...section,
        cards: (section.cards ?? []).map((card, index) => {
          if (index !== target.cardIndex) return card
          if (target.field === 'title' && 'title' in card) return { ...card, title: proposed }
          if (target.field === 'body_html') return { ...card, body_html: proposed }
          return card
        }),
      }
    }),
  }
}

export function storyOrigin(document: NewsletterData, target: AiTarget): ContentOrigin | 'unspecified' {
  if (target.cardIndex === null) return 'unspecified'
  const section = document.sections[sectionIndexOf(document, target)]
  const card = section?.cards?.[target.cardIndex]
  return card?.content_origin ?? 'unspecified'
}

export function targetForCard(
  document: NewsletterData,
  sectionIndex: number,
  cardIndex: number,
  field: 'title' | 'body_html',
): AiTarget | null {
  const section = document.sections[sectionIndex]
  const card = section?.cards?.[cardIndex]
  if (!section || !card) return null
  const originalText = field === 'title' ? ('title' in card ? card.title || '' : '') : card.body_html || ''
  const label = ('title' in card && card.title?.trim()) || `card ${cardIndex + 1}`
  return {
    kind: 'card',
    sectionKey: section.key,
    sectionIndex,
    cardIndex,
    field,
    originalText,
    label,
  }
}

export type { AiAction }
