import type { NewsletterData } from '@/types/newsletter'

export interface StoryLocation {
  sectionIndex: number
  cardIndex: number
}

const generic = new Set(['document', 'headings', 'rich-text table', 'link', 'image'])

/**
 * Accessibility checks run on rendered email HTML, so an issue names text, a link, or an image rather than a story.
 * Find the first story containing that text. Returns null when the location is generic or not found in a story.
 */
export function storyForIssue(data: NewsletterData, location: string): StoryLocation | null {
  const needle = location
    .replace(/^Text:\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  if (needle.length < 3 || generic.has(needle)) return null
  for (const [sectionIndex, section] of (data.sections ?? []).entries()) {
    for (const [cardIndex, card] of (section.cards ?? []).entries()) {
      const text = JSON.stringify(card)
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .toLowerCase()
      if (text.includes(needle)) return { sectionIndex, cardIndex }
    }
  }
  return null
}

/** Review findings name a section key and card index; prefer the recorded section position when it still matches. */
export function storyForFinding(
  data: NewsletterData,
  finding: { sectionKey: string; sectionIndex?: number; cardIndex: number | null; field: string },
): StoryLocation | null {
  if (finding.field === 'preheader' || finding.cardIndex === null) return null
  const sections = data.sections ?? []
  const sectionIndex =
    finding.sectionIndex !== undefined && sections[finding.sectionIndex]?.key === finding.sectionKey
      ? finding.sectionIndex
      : sections.findIndex((section) => section.key === finding.sectionKey)
  if (sectionIndex < 0 || !sections[sectionIndex]?.cards?.[finding.cardIndex]) return null
  return { sectionIndex, cardIndex: finding.cardIndex }
}
