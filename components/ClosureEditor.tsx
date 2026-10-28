// components/editor/ClosureEditor.tsx - Closure editor component

'use client'

import { useId, useRef, useState } from 'react'
import { useDialogFocus } from '@/lib/client/use-dialog-focus'
import type { Closure } from '@/types/newsletter'
import { Trash2 } from 'lucide-react'

interface ClosureEditorProps {
  closure: Closure
  onSave: (closure: Closure) => void
  onCancel: () => void
  onDelete?: () => void
  isNew?: boolean
}

export default function ClosureEditor({ closure, onSave, onCancel, onDelete, isNew = false }: ClosureEditorProps) {
  const [editedClosure, setEditedClosure] = useState<Closure>(closure)
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const discardRef = useRef<HTMLButtonElement>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const keepRef = useRef<HTMLButtonElement>(null)
  const dirty = JSON.stringify(editedClosure) !== JSON.stringify(closure)
  function requestClose() {
    if (confirmDelete) {
      setConfirmDelete(false)
      return
    }
    if (confirmDiscard) {
      setConfirmDiscard(false)
      return
    }
    if (!dirty) {
      onCancel()
      return
    }
    setConfirmDiscard(true)
    requestAnimationFrame(() => discardRef.current?.focus())
  }
  useDialogFocus(dialogRef, requestClose)

  const handleSave = () => {
    onSave(editedClosure)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="bg-white rounded-lg min-w-0 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
      >
        <div className="sticky top-0 z-10 bg-white border-b border-wsu-border-light p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
          <h2 id={titleId} className="text-xl font-semibold text-wsu-text-dark">
            {isNew ? 'New closure' : 'Edit closure'}
          </h2>
          <div className="flex gap-2">
            <button
              onClick={requestClose}
              className="min-h-11 inline-flex items-center justify-center px-3 py-2 text-sm font-medium text-wsu-text-muted border border-wsu-border-light rounded-md hover:bg-wsu-bg-light transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="min-h-11 inline-flex items-center justify-center px-3 py-2 text-sm font-medium text-white bg-wsu-crimson border border-wsu-crimson-dark rounded-md hover:bg-wsu-crimson-dark transition-colors"
            >
              Save closure
            </button>
          </div>
        </div>

        <div className="px-4 pt-3 text-sm" role="status">
          {isNew
            ? 'This closure is added to the newsletter when you choose Save closure. Cancel leaves the newsletter unchanged.'
            : 'Changes here are not saved until you choose Save closure. The draft then saves automatically.'}
        </div>
        {confirmDiscard && (
          <div role="alert" className="m-4 rounded-md border border-amber-300 bg-amber-50 p-3">
            <p className="font-semibold">Discard unsaved closure changes?</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                ref={discardRef}
                type="button"
                className="min-h-11 rounded-md border border-wsu-crimson bg-white px-3 font-semibold text-wsu-crimson"
                onClick={() => setConfirmDiscard(false)}
              >
                Keep editing
              </button>
              <button
                type="button"
                className="min-h-11 rounded-md border border-red-700 bg-white px-3 font-semibold text-red-800"
                onClick={onCancel}
              >
                Discard closure changes
              </button>
            </div>
          </div>
        )}
        <div className="p-6 space-y-4">
          <div>
            <label className="block mb-1 text-sm font-medium text-wsu-text-dark" htmlFor="closure-date">
              Date *
            </label>
            <input
              id="closure-date"
              type="text"
              value={editedClosure.date || ''}
              onChange={(e) => setEditedClosure({ ...editedClosure, date: e.target.value })}
              className="w-full px-3 py-2 border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
              placeholder="e.g., January 15, 2025"
            />
            <p className="mt-1 text-xs text-wsu-text-muted">
              Enter the closure date (e.g., &quot;January 15, 2025&quot; or &quot;Monday, January 15&quot;)
            </p>
          </div>

          <div>
            <label className="block mb-1 text-sm font-medium text-wsu-text-dark" htmlFor="closure-reason">
              Reason *
            </label>
            <textarea
              id="closure-reason"
              value={editedClosure.reason || ''}
              onChange={(e) => setEditedClosure({ ...editedClosure, reason: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
              placeholder="e.g., Martin Luther King Jr. Day"
            />
            <p className="mt-1 text-xs text-wsu-text-muted">
              Enter the reason for the closure (e.g., holiday, office event, etc.)
            </p>
          </div>
        </div>
        {onDelete && (
          <div className="border-t border-wsu-border-light p-4">
            {confirmDelete ? (
              <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-3">
                <p className="font-semibold">Delete this closure? You can use Undo afterward.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    ref={keepRef}
                    type="button"
                    className="min-h-11 rounded-md border border-wsu-crimson bg-white px-3 font-semibold text-wsu-crimson"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Keep closure
                  </button>
                  <button
                    type="button"
                    className="min-h-11 rounded-md border border-red-700 bg-white px-3 font-semibold text-red-800"
                    onClick={onDelete}
                  >
                    Delete closure
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(true)
                  requestAnimationFrame(() => keepRef.current?.focus())
                }}
                className="min-h-11 inline-flex items-center justify-center gap-1 px-3 py-2 text-sm font-medium text-red-700 border border-red-700 rounded-md hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete closure
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
