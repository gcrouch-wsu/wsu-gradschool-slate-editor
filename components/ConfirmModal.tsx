// components/editor/ConfirmModal.tsx - Confirmation modal component

'use client'

import { useEffect, useId, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'

interface ConfirmModalProps {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  variant?: 'danger' | 'warning' | 'info'
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'warning',
}: ConfirmModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descId = useId()

  // Focus trap, Escape key, and focus restoration
  useEffect(() => {
    if (!isOpen) return
    const previouslyFocused = document.activeElement as HTMLElement
    const modalEl = modalRef.current
    if (!modalEl) return
    const getFocusable = () =>
      modalEl.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    const focusable = getFocusable()
    if (focusable.length > 0) focusable[0].focus()
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel()
        return
      }
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
  }, [isOpen, onCancel])

  if (!isOpen) return null

  const variantStyles = {
    danger: {
      confirmBg: 'bg-red-600 hover:bg-red-700',
      iconColor: 'text-red-600',
    },
    warning: {
      confirmBg: 'bg-wsu-crimson hover:bg-wsu-crimson-dark',
      iconColor: 'text-wsu-crimson',
    },
    info: {
      confirmBg: 'bg-blue-600 hover:bg-blue-700',
      iconColor: 'text-blue-600',
    },
  }

  const styles = variantStyles[variant]
  const dialogRole = variant === 'danger' ? 'alertdialog' : 'dialog'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        ref={modalRef}
        role={dialogRole}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="bg-white rounded-lg max-w-md w-full shadow-xl"
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`flex-shrink-0 ${styles.iconColor}`}>
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 id={titleId} className="text-lg font-semibold text-wsu-text-dark mb-2">
                {title}
              </h3>
              <p id={descId} className="text-sm text-wsu-text-body">{message}</p>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 bg-wsu-bg-light border-t border-wsu-border-light flex justify-end gap-3 rounded-b-lg">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-wsu-text-muted border border-wsu-border-light rounded-md hover:bg-white transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium text-white ${styles.confirmBg} rounded-md transition-colors`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

