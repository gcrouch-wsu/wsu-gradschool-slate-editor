'use client'

import { useCallback, useEffect, useId, useRef } from 'react'
import type { AiAction } from '@/lib/ai/instructions'
import type { ReviewFinding, TextSuggestion } from '@/lib/ai/proposals'
import SuggestionComparison from '@/components/SuggestionComparison'

const button =
  'inline-flex min-h-11 items-center justify-center rounded-md border px-3 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wsu-crimson disabled:opacity-50'

export default function AiAssistDialog({
  open,
  title,
  actions,
  action,
  instruction,
  applyHouseStyle,
  showHouseStyle,
  busy,
  error,
  guideVersion,
  model,
  suggestions,
  originalText,
  findings,
  onAction,
  onInstruction,
  onHouseStyle,
  onGenerate,
  onApply,
  onApplyFinding,
  onDiscard,
}: {
  open: boolean
  title: string
  actions: { id: AiAction; label: string }[]
  action: AiAction
  instruction: string
  applyHouseStyle: boolean
  showHouseStyle: boolean
  busy: boolean
  error: string
  guideVersion: string
  model: string
  suggestions: TextSuggestion[]
  originalText: string
  findings: ReviewFinding[]
  onAction: (action: AiAction) => void
  onInstruction: (value: string) => void
  onHouseStyle: (value: boolean) => void
  onGenerate: () => void
  onApply: (suggestion: TextSuggestion) => void
  onApplyFinding: (finding: ReviewFinding, index: number) => void
  onDiscard: () => void
}) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const chosen = useRef(new Map<string, string>())
  const remember = useCallback((key: string, text: string) => {
    chosen.current.set(key, text)
  }, [])
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (event.key === 'Escape') onDiscard()
      if (event.key !== 'Tab') return
      const elements = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), summary, [href]',
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0)
      if (!elements?.length) {
        event.preventDefault()
        dialogRef.current?.focus()
        return
      }
      const first = elements[0],
        last = elements[elements.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus()
    }
  }, [open, onDiscard])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`flex max-h-[95dvh] w-full min-w-0 flex-col overflow-hidden rounded-lg bg-white shadow-lg ${suggestions.length || findings.length ? 'max-w-6xl' : 'max-w-2xl'}`}
      >
        <div className="shrink-0 border-b border-wsu-border-light p-4">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <p className="mt-1 text-sm text-wsu-text-muted">
            Suggestions do not change the draft until you apply one. The editorial guide remains authoritative, and this
            does not certify accessibility or mark the newsletter as sent.
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <details open={!suggestions.length && !findings.length} className="mb-3">
            <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-wsu-crimson">
              Adjust instruction and AI action
            </summary>
            <div className="pt-2">
              <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="AI action">
                {actions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`${button} ${action === item.id ? 'border-wsu-crimson bg-wsu-crimson text-white' : 'border-wsu-crimson bg-white text-wsu-crimson'}`}
                    aria-pressed={action === item.id}
                    disabled={busy}
                    onClick={() => onAction(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <label className="mt-3 block text-sm font-medium" htmlFor="ai-instruction">
                Optional instruction
              </label>
              <textarea
                id="ai-instruction"
                value={instruction}
                maxLength={1000}
                disabled={busy}
                onChange={(event) => onInstruction(event.target.value)}
                className="mt-1 min-h-20 w-full rounded-md border border-wsu-border-light px-3 py-2"
              />
              {showHouseStyle && (
                <label className="mt-3 flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={applyHouseStyle}
                    disabled={busy}
                    onChange={(event) => onHouseStyle(event.target.checked)}
                  />
                  Apply full house style
                </label>
              )}
            </div>
          </details>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={`${button} border-wsu-crimson ${
                suggestions.length || findings.length ? 'bg-white text-wsu-crimson' : 'bg-wsu-crimson text-white'
              }`}
              disabled={busy}
              onClick={() => {
                chosen.current.clear()
                onGenerate()
              }}
            >
              {busy
                ? 'Preparing suggestion…'
                : suggestions.length || findings.length
                  ? 'Try again'
                  : 'Prepare suggestion'}
            </button>
          </div>
          <div role="status" aria-live="polite" className="mt-2 text-sm">
            {busy ? 'Preparing suggestion…' : ''}
            {!busy && (guideVersion || model) ? `Guide ${guideVersion}${model ? `, model ${model}` : ''}` : ''}
          </div>
          {error && (
            <p role="alert" className="mt-2 text-red-800">
              {error}
            </p>
          )}
          {!busy && action === 'review' && guideVersion && findings.length === 0 && !error && (
            <p className="mt-3" role="status">
              The AI review returned no findings. Human review and accessibility checks are still needed.
            </p>
          )}
          <ul className="mt-3 space-y-3">
            {(Array.isArray(suggestions) ? suggestions : []).map((suggestion, index) => (
              <li key={index} className="min-w-0 rounded-md border border-wsu-border-light p-3">
                <SuggestionComparison
                  original={originalText}
                  proposed={suggestion.proposed}
                  plain={action === 'headlines' || action === 'preheader'}
                  onResolve={(text) => remember(JSON.stringify([originalText, suggestion.proposed, index]), text)}
                />
                <p className="mt-2 text-sm text-wsu-text-muted">{suggestion.reason}</p>
                {suggestions.length > 1 && (
                  <button
                    type="button"
                    disabled={busy}
                    className={`${button} mt-2 border-wsu-crimson bg-white text-wsu-crimson`}
                    onClick={() =>
                      onApply({
                        ...suggestion,
                        proposed:
                          chosen.current.get(JSON.stringify([originalText, suggestion.proposed, index])) ??
                          suggestion.proposed,
                      })
                    }
                  >
                    Apply suggestion
                  </button>
                )}
              </li>
            ))}
            {(Array.isArray(findings) ? findings : []).map((finding, index) => (
              <li key={index} className="min-w-0 rounded-md border border-wsu-border-light p-3">
                <p className="text-sm font-semibold">
                  {finding.sectionTitle} / {finding.cardTitle} / {finding.field}
                </p>
                <p className="mt-1 text-sm">{finding.summary}</p>
                {finding.proposed && (
                  <SuggestionComparison
                    original={finding.originalText}
                    proposed={finding.proposed}
                    plain={finding.field !== 'body_html'}
                    onResolve={(text) =>
                      remember(JSON.stringify([finding.originalText, finding.proposed, index]), text)
                    }
                  />
                )}
                <p className="mt-2 text-sm text-wsu-text-muted">{finding.reason}</p>
                {finding.proposed && (
                  <button
                    type="button"
                    disabled={busy}
                    className={`${button} mt-2 border-wsu-crimson bg-white text-wsu-crimson`}
                    onClick={() =>
                      onApplyFinding(
                        {
                          ...finding,
                          proposed:
                            chosen.current.get(JSON.stringify([finding.originalText, finding.proposed, index])) ??
                            finding.proposed,
                        },
                        index,
                      )
                    }
                  >
                    Apply suggestion
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
        <footer className="shrink-0 border-t border-wsu-border-light bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" className={`${button} border-wsu-border-light bg-white`} onClick={onDiscard}>
              {action === 'review' ? 'Close' : 'Discard'}
            </button>
            {suggestions.length === 1 && (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm">Unreviewed edits will also be included.</p>
                <button
                  type="button"
                  disabled={busy}
                  className={`${button} border-wsu-crimson bg-wsu-crimson text-white`}
                  onClick={() =>
                    onApply({
                      ...suggestions[0],
                      proposed:
                        chosen.current.get(JSON.stringify([originalText, suggestions[0].proposed, 0])) ??
                        suggestions[0].proposed,
                    })
                  }
                >
                  Apply suggestion
                </button>
              </div>
            )}
            {(suggestions.length > 1 || findings.length > 0) && (
              <p className="text-sm">
                Apply a suggestion above. Unreviewed edits in it will also be included.
                {findings.length > 0 ? ' The review stays available as a checklist after you close or apply.' : ''}
              </p>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}
