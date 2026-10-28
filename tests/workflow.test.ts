import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { afterEach, expect, test, vi } from 'vitest'
import { requestEditorialSuggestion } from '@/lib/ai/assist'
import { completeChat } from '@/lib/ai/provider'
import { editorialInstructions } from '@/lib/ai/instructions'
import { loadStyleGuide } from '@/lib/ai/guide'
import {
  applyFieldChange,
  isAiTarget,
  proposalIsCurrent,
  targetForCard,
  type AiTarget,
  type ProposalBase,
} from '@/lib/ai/proposals'
import { parseModelJson, validateReview, validateSuggestion } from '@/lib/ai/validate'
import { canonicalJson } from '@/lib/canonical-json'
import { formatIssueDate } from '@/lib/issue'
import { baselineAfterSave, differsFromSent } from '@/lib/sent-baseline'
import { documentFingerprint, normalizeNewsletter } from '@/lib/newsletter-document'
import { defaultFFModel } from '@/lib/defaults'
import type { NewsletterData } from '@/types/newsletter'

const config = createRequire(import.meta.url)('../next.config.js')
afterEach(() => vi.unstubAllEnvs())

function draft(): NewsletterData {
  return normalizeNewsletter(defaultFFModel(), { requireShape: true })
}

function base(document: NewsletterData, target: AiTarget, version = 2): ProposalBase {
  return {
    newsletterId: 'newsletter-1',
    saveVersion: version,
    fingerprint: documentFingerprint(document),
    document,
    target,
  }
}

const cardTarget: AiTarget = {
  kind: 'card',
  sectionKey: 'deadlines',
  cardIndex: 0,
  field: 'body_html',
  originalText: '<p>Placeholder body copy for a standard item.</p>',
  label: 'Sample Announcement',
}

test('new issue dates use Pacific time and are not inferred from UTC', () => {
  expect(formatIssueDate(new Date('2026-10-28T06:30:00Z'))).toBe('October 27, 2026')
  expect(formatIssueDate(new Date('2026-10-28T07:30:00Z'))).toBe('October 28, 2026')
})

test('normalization keeps issue and story origin and drops sent status', () => {
  const document = normalizeNewsletter({
    ...draft(),
    issue: { title: 'October 31, 2026', date: 'October 31, 2026' },
    progress: 'sent',
    sections: draft().sections.map((section, index) =>
      index === 0
        ? {
            ...section,
            cards: section.cards?.map((card, cardIndex) =>
              cardIndex === 0 ? { ...card, content_origin: 'contributed' } : card,
            ),
          }
        : section,
    ),
  })
  expect(document.issue).toEqual({
    title: 'October 31, 2026',
    date: 'October 31, 2026',
  })
  expect(document.sections[0].cards?.[0].content_origin).toBe('contributed')
  expect(document).not.toHaveProperty('progress')
  expect(normalizeNewsletter(draft()).issue).toBeUndefined()
})

test('house style is formal only for Graduate School writing or an explicit request', () => {
  expect(
    editorialInstructions({
      origin: 'graduate_school',
      applyHouseStyle: false,
      action: 'edit',
    }),
  ).toContain('Do not use contractions.')
  const contributed = editorialInstructions({
    origin: 'contributed',
    applyHouseStyle: false,
    action: 'shorten',
  })
  expect(contributed).toContain("Preserve the contributor's voice")
  expect(contributed).toContain('Do not impose')
  expect(
    editorialInstructions({
      origin: 'contributed',
      applyHouseStyle: true,
      action: 'edit',
    }),
  ).toContain('explicitly requested full Graduate School house style')
  expect(
    editorialInstructions({
      origin: 'unspecified',
      applyHouseStyle: false,
      action: 'review',
    }),
  ).toContain('Do not assume formal treatment')
})

test('style.md is loaded with its version and included in the production trace', () => {
  const guide = loadStyleGuide()
  expect(guide.version).toBe('1.1')
  expect(guide.text).toContain('Graduate School')
  expect(readFileSync('style.md', 'utf8')).toContain(`**Version:** ${guide.version}`)
  expect(config.outputFileTracingIncludes['/api/newsletters/[id]/ai']).toContain('./style.md')
})

test('provider failure, invalid JSON, and unsafe HTML are rejected', async () => {
  vi.stubEnv('AI_GATEWAY_API_KEY', 'test-key')
  await expect(
    completeChat({
      model: 'test/model',
      endpoint: 'https://ai-gateway.vercel.sh/v1/chat/completions',
      messages: [{ role: 'user', content: 'data' }],
      fetchImpl: vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: 'overloaded' } }), {
            status: 503,
          }),
      ),
    }),
  ).rejects.toThrow(/overloaded/)
  expect(() => parseModelJson('not json')).toThrow(/not valid JSON/)
  expect(() =>
    validateSuggestion('edit', '<p>Keep https://gradschool.wsu.edu.</p>', {
      proposed: '<script>alert(1)</script><p>Keep https://gradschool.wsu.edu.</p>',
      reasons: [{ guide: 'Section 8', text: 'Remove unsafe markup.' }],
    }),
  ).toThrow(/HTML that newsletters don't allow \(<script>\)/)
  expect(() =>
    validateSuggestion('edit', '<p>See https://gradschool.wsu.edu.</p>', {
      proposed: '<p>See the site.</p>',
      reasons: [{ guide: 'Section 2', text: 'The URL was dropped.' }],
    }),
  ).toThrow(/removed or changed the web address https:\/\/gradschool\.wsu\.edu/)
  expect(() => validateReview(draft(), { proposedDocument: {}, findings: [] })).toThrow(/replace the newsletter/)
})

test('a suggestion applies once and is rejected when the draft or authority changes', () => {
  const document = draft()
  const current = base(document, cardTarget)
  expect(
    proposalIsCurrent({
      base: current,
      newsletterId: 'newsletter-1',
      saveVersion: 2,
      canWrite: true,
      document,
    }).ok,
  ).toBe(true)
  const typed = applyFieldChange(document, cardTarget, '<p>The deadline is October 30.</p>')
  expect(
    proposalIsCurrent({
      base: current,
      newsletterId: 'newsletter-1',
      saveVersion: 2,
      canWrite: true,
      document: typed,
    }).ok,
  ).toBe(false)
  const reordered = { ...document, sections: [...document.sections].reverse() }
  expect(
    proposalIsCurrent({
      base: current,
      newsletterId: 'newsletter-1',
      saveVersion: 2,
      canWrite: true,
      document: reordered,
    }).ok,
  ).toBe(false)
  const removed = {
    ...document,
    sections: document.sections.map((section) => (section.key === 'deadlines' ? { ...section, cards: [] } : section)),
  }
  expect(
    proposalIsCurrent({
      base: current,
      newsletterId: 'newsletter-1',
      saveVersion: 2,
      canWrite: true,
      document: removed,
    }).ok,
  ).toBe(false)
  expect(
    proposalIsCurrent({
      base: current,
      newsletterId: 'newsletter-1',
      saveVersion: 3,
      canWrite: true,
      document,
    }).ok,
  ).toBe(false)
  expect(
    proposalIsCurrent({
      base: current,
      newsletterId: 'newsletter-1',
      saveVersion: 2,
      canWrite: false,
      document,
    }).ok,
  ).toBe(false)
  const applied = applyFieldChange(document, cardTarget, '<p>Clearer copy.</p>')
  expect(applied.sections[0].cards?.[0].body_html).toBe('<p>Clearer copy.</p>')
  expect(document.sections[0].cards?.[0].body_html).toBe(cardTarget.originalText)
})

test('headlines receive the story and preheaders receive full newsletter context', async () => {
  vi.stubEnv('AI_GATEWAY_API_KEY', 'test-key')
  vi.stubEnv('AI_GATEWAY_MODEL', 'test/model')
  const document = draft()
  document.masthead.preheader = ''
  document.sections[0].cards![0].body_html = `<p>${'Context '.repeat(300)}Important detail at the end.</p>`
  const sent: Record<string, unknown>[] = []
  const fetchImpl: typeof fetch = async (_url, options) => {
    const request = JSON.parse(String(options?.body))
    sent.push(JSON.parse(request.messages[1].content).data)
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                suggestions: [
                  {
                    text: 'A clear announcement',
                    reason: 'Section 7: a precise summary.',
                  },
                ],
              }),
            },
          },
        ],
      }),
    )
  }
  await requestEditorialSuggestion({
    action: 'headlines',
    document,
    target: {
      ...cardTarget,
      field: 'title',
      originalText: 'Sample Announcement',
    },
    instruction: '',
    applyHouseStyle: false,
    fetchImpl,
  })
  expect(JSON.stringify(sent[0])).toContain('Important detail at the end.')
  await requestEditorialSuggestion({
    action: 'preheader',
    document,
    target: {
      kind: 'preheader',
      field: 'preheader',
      originalText: '',
      label: 'preheader',
      sectionKey: '',
      cardIndex: null,
    },
    instruction: '',
    applyHouseStyle: false,
    fetchImpl,
  })
  expect(JSON.stringify(sent[1])).toContain('Important detail at the end.')
  expect(sent[1]).toHaveProperty('stories')
})

test('strict AI output rejects unknown fields and protects links, images, layout, and placeholders', () => {
  const reasons = [{ guide: 'Section 8', text: 'Preserve formatting and destinations.' }]
  expect(() =>
    validateSuggestion('edit', '<p>Original.</p>', {
      proposed: '<p>Clear.</p>',
      reasons,
      unrelated: true,
    }),
  ).toThrow(/unsupported/)
  const original =
    '<p><a href="mailto:gradschool@example.edu">Contact us</a><img src="https://example.edu/image.png" alt="Campus" width="200" /></p>'
  for (const [proposed, reason] of [
    [original.replace('mailto:gradschool@example.edu', 'mailto:other@example.edu'), /removed or changed the link to mailto:gradschool@example\.edu/],
    [original.replace('alt="Campus"', 'alt="Building"'), /changed the description \(alt text\) of the image "Campus"/],
    [original.replace('https://example.edu/image.png', 'https://example.edu/other.png'), /removed or changed the image "Campus"/],
    [original + '<h1>Another heading</h1>', /heading or divider/],
    [original + '<table><tr><td>Added</td></tr></table>', /layout of a table/],
    [original + '<p><a href="https://example.edu/new">More</a></p>', /added a link to https:\/\/example\.edu\/new/],
  ] as const)
    expect(() => validateSuggestion('edit', original, { proposed, reasons })).toThrow(reason)
  // Formatting may change with the wording; harmless extras are removed rather than rejected.
  const formatted =
    '<p style="text-align:center">Apply soon.</p><p>Read <a href="https://example.edu/a">A</a> and <a href="https://example.edu/b">B</a>.</p>' +
    '<ul><li style="margin-bottom:8px"><p>One</p></li><li style="margin-bottom:8px"><p>Two</p></li></ul>'
  for (const proposed of [
    original.replace('width="200"', 'width="300"'),
    original.replace('<p>', '<p style="color:#ffffff">'),
    original.replace('<a href', '<a target="_blank" rel="noopener" href'),
    '<font>' + original + '</font>',
  ]) {
    const result = validateSuggestion('edit', original, { proposed, reasons }) as { proposed: string }
    expect(result.proposed).not.toMatch(/target=|<font/)
  }
  for (const proposed of [
    '<p>Apply soon. Read <a href="https://example.edu/b">B</a> and <a href="https://example.edu/a">A</a>.</p><ul><li><p>One and two</p></li></ul>',
    formatted.replace(/ style="margin-bottom:8px"/g, ''),
  ]) {
    expect(validateSuggestion('edit', formatted, { proposed, reasons })).toHaveProperty('proposed')
  }
  const httpText = '<p>Details are at http://gradschool.wsu.edu/dates.</p>'
  expect(() =>
    validateSuggestion('edit', httpText, {
      proposed: '<p>Details are at http://gradschool.wsu.edu/moved.</p>',
      reasons,
    }),
  ).toThrow(/web address http:\/\/gradschool\.wsu\.edu\/dates/)
  expect(
    validateSuggestion('edit', httpText, {
      proposed: '<p>See the dates at http://gradschool.wsu.edu/dates.</p>',
      reasons,
    }),
  ).toHaveProperty('proposed')
  expect(() =>
    validateSuggestion('headlines', 'Hello {{name}}', {
      suggestions: [{ text: 'Hello', reason: 'Shorter' }],
    }),
  ).toThrow(/removed or changed the Slate placeholder \{\{name\}\}/)
  const queryLink = '<p><a href="https://example.edu/?confirmation=1&amp;registration=open">Register</a></p>'
  expect(
    validateSuggestion('edit', queryLink, {
      proposed: queryLink.replace('>Register<', '>Apply now<'),
      reasons,
    }),
  ).toHaveProperty('proposed')
  expect(validateReview(draft(), { findings: [] })).toEqual([])
  expect(() => validateReview(draft(), { findings: [], surprise: 'ignored before' })).toThrow(/unsupported/)
})

test('AI targets must match the requested operation', () => {
  expect(isAiTarget(cardTarget, 'edit')).toBe(true)
  expect(isAiTarget({ ...cardTarget, field: 'preheader' }, 'edit')).toBe(false)
  expect(isAiTarget({ ...cardTarget, cardIndex: -1 }, 'edit')).toBe(false)
  expect(isAiTarget({ ...cardTarget, field: 'title' }, 'headlines')).toBe(true)
  expect(isAiTarget({ ...cardTarget, kind: 'review' }, 'review')).toBe(false)
})

test('duplicate imported section keys cannot make an AI edit replace multiple stories', () => {
  const document = draft()
  document.sections[1] = structuredClone(document.sections[0])
  const target = targetForCard(document, 1, 0, 'body_html')!
  const updated = applyFieldChange(document, target, '<p>Only the selected story.</p>')
  expect(updated.sections[0].cards![0].body_html).toBe(cardTarget.originalText)
  expect(updated.sections[1].cards![0].body_html).toBe('<p>Only the selected story.</p>')
  expect(
    proposalIsCurrent({
      base: base(document, cardTarget),
      newsletterId: 'newsletter-1',
      saveVersion: 2,
      canWrite: true,
      document,
    }).ok,
  ).toBe(false)
})

test('Undo restores Changed since sent from the kept baseline before the next save returns', () => {
  const sent = canonicalJson({ title: 'Sent issue' })
  const edited = canonicalJson({ title: 'Edited issue' })
  let baseline = baselineAfterSave(sent, edited, true)
  expect(baseline).toBe(sent)
  expect(differsFromSent(baseline, edited, true)).toBe(true)
  expect(differsFromSent(baseline, sent, true)).toBe(false)
  baseline = baselineAfterSave(baseline, edited, true)
  expect(differsFromSent(baseline, sent, true)).toBe(false)
  baseline = baselineAfterSave(baseline, sent, false)
  expect(baseline).toBe(sent)
  expect(differsFromSent(null, sent, true)).toBe(true)
})

test('oversized editorial context fails instead of omitting content', async () => {
  vi.stubEnv('AI_GATEWAY_API_KEY', 'test-key')
  vi.stubEnv('AI_GATEWAY_MODEL', 'test/model')
  const document = draft()
  document.sections[0].cards![0].body_html = `<p>${'A'.repeat(50_000)}</p>`
  const fetchImpl = vi.fn<typeof fetch>()
  const reviewTarget: AiTarget = {
    kind: 'review',
    sectionKey: '',
    cardIndex: null,
    field: 'preheader',
    originalText: '',
    label: 'newsletter',
  }
  await expect(
    requestEditorialSuggestion({
      action: 'review',
      document,
      target: reviewTarget,
      instruction: '',
      applyHouseStyle: false,
      fetchImpl,
    }),
  ).rejects.toThrow(/too large to review/)
  await expect(
    requestEditorialSuggestion({
      action: 'headlines',
      document,
      target: { ...cardTarget, field: 'title', originalText: 'Sample Announcement' },
      instruction: '',
      applyHouseStyle: false,
      fetchImpl,
    }),
  ).rejects.toThrow(/too large to send/)
  expect(fetchImpl).not.toHaveBeenCalled()
})

test('provider responses are bounded while reading the body', async () => {
  vi.stubEnv('AI_GATEWAY_API_KEY', 'test-key')
  await expect(
    completeChat({
      model: 'test/model',
      endpoint: 'https://example.edu',
      messages: [],
      fetchImpl: async () => new Response('x'.repeat(100_001)),
    }),
  ).rejects.toThrow(/too large/)
  await expect(
    completeChat({
      model: 'test/model',
      endpoint: 'https://example.edu',
      messages: [],
      fetchImpl: async () =>
        ({
          ok: true,
          body: null,
          text: async () => 'x'.repeat(100_001),
        }) as unknown as Response,
    }),
  ).rejects.toThrow(/too large/)
})
