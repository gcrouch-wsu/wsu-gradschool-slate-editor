'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useDialogFocus } from '@/lib/client/use-dialog-focus'
import { errorMessage, jsonBody, requestJson } from '@/lib/client/request'
import type { NewsletterData, PreviewResponse } from '@/types/newsletter'

interface Revision {
  id: string
  revisionNumber: number
  actorName: string
  action: string
  createdAt: string
}

const actionNames: Record<string, string> = {
  create: 'Created',
  save: 'Saved',
  restore: 'Restored an earlier version',
  archive: 'Archived',
  unarchive: 'Restored from archive',
  duplicate: 'Duplicated from another issue',
  import: 'Imported',
  template: 'Template replaced',
}

const button =
  'inline-flex min-h-11 items-center justify-center rounded-md border px-3 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wsu-crimson disabled:opacity-50 disabled:cursor-not-allowed'

/** Saved versions preview in the sandboxed renderer. Restore hands the version to normal editor state. */
export default function VersionHistory({
  newsletterId,
  canRestore,
  onRestore,
  onClose,
}: {
  newsletterId: string
  canRestore: boolean
  onRestore: (content: NewsletterData) => void
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const [revisions, setRevisions] = useState<Revision[] | null>(null)
  const [selected, setSelected] = useState<{ revision: Revision; content: NewsletterData; html: string } | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')
  const request = useRef(0)
  useDialogFocus(dialogRef, onClose)

  useEffect(() => {
    const controller = new AbortController()
    requestJson<{ revisions: Revision[] }>(`/api/newsletters/${newsletterId}/revisions`, { signal: controller.signal })
      .then((body) => setRevisions(body.revisions))
      .catch((failure) => {
        if (!controller.signal.aborted) setError(errorMessage(failure))
      })
    return () => controller.abort()
  }, [newsletterId])

  async function select(revision: Revision) {
    const current = ++request.current
    setLoading(revision.id)
    setError('')
    try {
      const { content } = await requestJson<{ content: NewsletterData }>(
        `/api/newsletters/${newsletterId}/revisions?revision=${encodeURIComponent(revision.id)}`,
      )
      const preview = await requestJson<PreviewResponse>('/api/preview', jsonBody(content))
      if (current !== request.current) return
      setSelected({ revision, content, html: preview.html || '' })
    } catch (failure) {
      if (current === request.current) setError(errorMessage(failure))
    } finally {
      if (current === request.current) setLoading(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex max-h-[95dvh] w-full max-w-6xl min-w-0 flex-col overflow-hidden rounded-lg bg-white shadow-lg"
      >
        <div className="shrink-0 border-b border-wsu-border-light p-4">
          <h2 id={titleId} className="text-lg font-semibold">
            Version history
          </h2>
          <p className="mt-1 text-sm text-wsu-text-muted">
            Select a saved version to preview it. Restoring replaces the current draft content as one Undo step and
            saves it like any other edit. Progress and sent records do not change.
          </p>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
          <div className="min-w-0">
            {revisions === null && !error && <p role="status">Loading saved versions…</p>}
            {revisions?.length === 0 && <p>No saved versions yet.</p>}
            {revisions && revisions.length > 0 && (
              <ol className="space-y-2" aria-label="Saved versions, newest first">
                {revisions.map((revision) => (
                  <li key={revision.id}>
                    <button
                      type="button"
                      aria-pressed={selected?.revision.id === revision.id}
                      className={`${button} w-full flex-col items-start text-left ${
                        selected?.revision.id === revision.id
                          ? 'border-wsu-crimson bg-wsu-bg-light'
                          : 'border-wsu-border-light bg-white'
                      }`}
                      onClick={() => void select(revision)}
                    >
                      <span>{actionNames[revision.action] ?? revision.action}</span>
                      <span className="text-xs font-normal">
                        {revision.actorName} · <time dateTime={revision.createdAt}>{new Date(revision.createdAt).toLocaleString()}</time>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div className="min-w-0">
            <div role="status" aria-live="polite" className="text-sm">
              {loading ? 'Loading this version…' : ''}
            </div>
            {error && (
              <p role="alert" className="text-red-800">
                {error}
              </p>
            )}
            {selected ? (
              <>
                <p className="mb-2 text-sm font-semibold">
                  {actionNames[selected.revision.action] ?? selected.revision.action} by {selected.revision.actorName},{' '}
                  {new Date(selected.revision.createdAt).toLocaleString()}
                </p>
                <iframe
                  title="Saved version preview"
                  sandbox=""
                  srcDoc={selected.html}
                  className="h-[60vh] w-full border border-wsu-border-light bg-white"
                />
              </>
            ) : (
              !loading && <p className="text-sm">Select a version to preview it.</p>
            )}
          </div>
        </div>
        <footer className="shrink-0 border-t border-wsu-border-light p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" className={`${button} border-wsu-border-light bg-white`} onClick={onClose}>
              Close
            </button>
            <div className="flex flex-wrap items-center gap-3">
              {!canRestore && <p className="text-sm">Take over editing to restore a version.</p>}
              <button
                type="button"
                className={`${button} border-wsu-crimson bg-wsu-crimson text-white`}
                disabled={!selected || !canRestore || loading !== null}
                onClick={() => selected && onRestore(selected.content)}
              >
                Restore this version
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
