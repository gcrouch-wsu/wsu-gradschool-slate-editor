// components/editor/ClosureEditor.tsx - Closure editor component

'use client'

import { useState } from 'react'
import type { Closure } from '@/types/newsletter'
import { Trash2 } from 'lucide-react'

interface ClosureEditorProps {
  closure: Closure
  onSave: (closure: Closure) => void
  onCancel: () => void
  onDelete?: () => void
}

export default function ClosureEditor({
  closure,
  onSave,
  onCancel,
  onDelete,
}: ClosureEditorProps) {
  const [editedClosure, setEditedClosure] = useState<Closure>(closure)

  const handleSave = () => {
    onSave(editedClosure)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-white border-b border-wsu-border-light p-4 flex items-center justify-between shadow-sm">
          <h2 className="text-xl font-semibold text-wsu-text-dark">
            Edit Closure
          </h2>
          <div className="flex gap-2">
            {onDelete && (
              <button
                onClick={onDelete}
                className="px-3 py-1.5 text-sm font-medium text-red-600 border border-red-600 rounded-md hover:bg-red-50 transition-colors flex items-center gap-1"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            )}
            <button
              onClick={onCancel}
              className="px-3 py-1.5 text-sm font-medium text-wsu-text-muted border border-wsu-border-light rounded-md hover:bg-wsu-bg-light transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-3 py-1.5 text-sm font-medium text-white bg-wsu-crimson border border-wsu-crimson-dark rounded-md hover:bg-wsu-crimson-dark transition-colors"
            >
              Save
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block mb-1 text-sm font-medium text-wsu-text-dark">
              Date *
            </label>
            <input
              type="text"
              value={editedClosure.date || ''}
              onChange={(e) =>
                setEditedClosure({ ...editedClosure, date: e.target.value })
              }
              className="w-full px-3 py-2 border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
              placeholder="e.g., January 15, 2025"
            />
            <p className="mt-1 text-xs text-wsu-text-muted">
              Enter the closure date (e.g., &quot;January 15, 2025&quot; or &quot;Monday, January 15&quot;)
            </p>
          </div>

          <div>
            <label className="block mb-1 text-sm font-medium text-wsu-text-dark">
              Reason *
            </label>
            <textarea
              value={editedClosure.reason || ''}
              onChange={(e) =>
                setEditedClosure({ ...editedClosure, reason: e.target.value })
              }
              rows={3}
              className="w-full px-3 py-2 border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
              placeholder="e.g., Martin Luther King Jr. Day"
            />
            <p className="mt-1 text-xs text-wsu-text-muted">
              Enter the reason for the closure (e.g., holiday, office event, etc.)
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

