'use client'

import { useEffect, useRef, type RefObject } from 'react'

/** Contain focus in the topmost modal, including nested link/confirmation dialogs. */
export function useDialogFocus(ref: RefObject<HTMLDivElement | null>, onEscape: () => void) {
  const escape = useRef(onEscape)
  useEffect(() => {
    escape.current = onEscape
  }, [onEscape])
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const previous = document.activeElement as HTMLElement | null
    const topmost = () =>
      Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]')).at(-1) === dialog
    dialog.focus()
    const keydown = (event: KeyboardEvent) => {
      if (!topmost() || event.defaultPrevented) return
      if (event.key === 'Escape') {
        event.preventDefault()
        escape.current()
        return
      }
      if (event.key !== 'Tab') return
      const controls = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [contenteditable="true"], [tabindex="0"]',
        ),
      ).filter((item) => item.getClientRects().length > 0)
      const first = controls[0],
        last = controls.at(-1)
      if (!first) {
        event.preventDefault()
        dialog.focus()
        return
      }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
        event.preventDefault()
        first.focus()
      }
    }
    const focusin = (event: FocusEvent) => {
      if (topmost() && !dialog.contains(event.target as Node)) dialog.focus()
    }
    document.addEventListener('keydown', keydown)
    document.addEventListener('focusin', focusin)
    return () => {
      document.removeEventListener('keydown', keydown)
      document.removeEventListener('focusin', focusin)
      if (previous?.isConnected) previous.focus()
    }
  }, [ref])
}
