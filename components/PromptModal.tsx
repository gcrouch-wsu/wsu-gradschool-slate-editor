// components/editor/PromptModal.tsx - Prompt modal component

'use client'

import { useState, useEffect, useId, useRef } from 'react'
import { Edit } from 'lucide-react'

interface PromptModalProps {
  isOpen: boolean
  title: string
  message: string
  defaultValue?: string
  placeholder?: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: (value: string) => void
  onCancel: () => void
}

export default function PromptModal({
  isOpen,
  title,
  message,
  defaultValue = '',
  placeholder = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: PromptModalProps) {
  const [value, setValue] = useState(defaultValue)
  const inputRef = useRef<HTMLInputElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descId = useId()

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue)
      // Focus input after modal opens
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 100)
    }
  }, [isOpen, defaultValue])

  // Focus trap and focus restoration
  useEffect(() => {
    if (!isOpen) return
    const previouslyFocused = document.activeElement as HTMLElement
    const modalEl = modalRef.current
    if (!modalEl) return
    const getFocusable = () =>
      modalEl.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const elements = getFocusable()
      if (elements.length === 0) return
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus()
    }
  }, [isOpen])

  const handleConfirm = () => {
    if (value.trim()) {
      onConfirm(value.trim())
      setValue('')
    }
  }

  const handleCancel = () => {
    setValue('')
    onCancel()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleConfirm()
    } else if (e.key === 'Escape') {
      handleCancel()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="bg-white rounded-lg max-w-md w-full shadow-xl"
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 text-wsu-crimson">
              <Edit className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 id={titleId} className="text-lg font-semibold text-wsu-text-dark mb-2">
                {title}
              </h3>
              <p id={descId} className="text-sm text-wsu-text-body mb-4">{message}</p>
              <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className="w-full px-3 py-2 border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
                autoFocus
              />
            </div>
          </div>
        </div>
        <div className="px-6 py-4 bg-wsu-bg-light border-t border-wsu-border-light flex justify-end gap-3 rounded-b-lg">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-sm font-medium text-wsu-text-muted border border-wsu-border-light rounded-md hover:bg-white transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!value.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-wsu-crimson hover:bg-wsu-crimson-dark rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

