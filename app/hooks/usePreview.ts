// app/editor/hooks/usePreview.ts - Preview generation hook

import { useState, useCallback, useRef, useEffect } from 'react'
import type { NewsletterData, PreviewResponse } from '@/types/newsletter'

export function usePreview(initialHtml = '') {
  const previewRequest = useRef(0)
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      previewRequest.current++
      if (previewTimer.current) clearTimeout(previewTimer.current)
    },
    [],
  )
  const [html, setHtml] = useState(initialHtml)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const updatePreview = useCallback(async (data: NewsletterData) => {
    const current = ++previewRequest.current
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      const result: PreviewResponse = await response.json()
      if (current !== previewRequest.current) return

      if (result.success && result.html) {
        setHtml(result.html)
      } else {
        setError(result.error || 'Preview generation failed')
      }
    } catch (err) {
      if (current !== previewRequest.current) return
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
    } finally {
      if (current === previewRequest.current) setLoading(false)
    }
  }, [])

  const debouncedUpdatePreview = useCallback(
    (data: NewsletterData) => {
      if (previewTimer.current) clearTimeout(previewTimer.current)
      previewTimer.current = setTimeout(() => {
        void updatePreview(data)
      }, 400)
    },
    [updatePreview],
  )

  return {
    html,
    loading,
    error,
    updatePreview,
    debouncedUpdatePreview,
  }
}
