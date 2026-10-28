'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useDialogFocus } from '@/lib/client/use-dialog-focus'
import { formatIssueDate } from '@/lib/issue'

const button =
  'inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold rounded-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wsu-crimson disabled:opacity-60 disabled:cursor-wait'

/** Names a new issue: used when creating a draft and when duplicating one for the next issue. */
export default function IssueDialog({
  title,
  description,
  confirmLabel,
  busyLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string
  description: string
  confirmLabel: string
  busyLabel: string
  busy: boolean
  onConfirm: (issue: { title: string; date: string }) => void
  onCancel: () => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const titleId = useId()
  const fieldId = useId()
  const [issueTitle, setIssueTitle] = useState(() => formatIssueDate())
  const [issueDate, setIssueDate] = useState(() => formatIssueDate())
  const [problem, setProblem] = useState('')
  useDialogFocus(dialogRef, () => {
    if (!busy) onCancel()
  })
  // The focus hook focuses the dialog first; start in the title field instead.
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-lg rounded-lg bg-white p-4"
      >
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        <p className="mt-2 text-sm">{description}</p>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (!issueTitle.trim()) {
              setProblem('Enter an issue title.')
              return
            }
            onConfirm({ title: issueTitle.trim(), date: issueDate.trim() })
          }}
        >
          <label className="mt-3 block text-sm font-semibold" htmlFor={`${fieldId}-title`}>
            Issue title
          </label>
          <input
            id={`${fieldId}-title`}
            ref={inputRef}
            maxLength={200}
            aria-describedby={problem ? `${fieldId}-problem` : undefined}
            className="mt-1 min-h-11 w-full rounded-md border border-wsu-border-light px-3"
            value={issueTitle}
            onChange={(event) => {
              setIssueTitle(event.target.value)
              setProblem('')
            }}
          />
          <label className="mt-3 block text-sm font-semibold" htmlFor={`${fieldId}-date`}>
            Issue date
          </label>
          <input
            id={`${fieldId}-date`}
            maxLength={80}
            className="mt-1 min-h-11 w-full rounded-md border border-wsu-border-light px-3"
            value={issueDate}
            onChange={(event) => setIssueDate(event.target.value)}
          />
          {problem && (
            <p id={`${fieldId}-problem`} role="alert" className="mt-2 text-sm text-red-800">
              {problem}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className={`${button} text-white bg-wsu-crimson border border-wsu-crimson-dark hover:bg-wsu-crimson-dark`}
              type="submit"
              disabled={busy}
            >
              {busy ? busyLabel : confirmLabel}
            </button>
            <button
              className={`${button} text-wsu-crimson bg-white border-2 border-wsu-crimson hover:bg-wsu-crimson/10`}
              type="button"
              disabled={busy}
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
