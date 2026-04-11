// app/editor/hooks/usePreview.ts - Preview generation hook

import { useState, useCallback, useRef } from 'react'
import type { NewsletterData, PreviewResponse } from '@/types/newsletter'
import { debounce } from '@/lib/utils'

export function usePreview(initialHtml = '') {
  const [html, setHtml] = useState(initialHtml)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const updatePreview = useCallback(async (data: NewsletterData) => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      const result: PreviewResponse = await response.json()

      if (result.success && result.html) {
        setHtml(result.html)
      } else {
        setError(result.error || 'Preview generation failed')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounced version for real-time updates
  const debouncedUpdatePreview = useRef(
    debounce((data: NewsletterData) => {
      updatePreview(data)
    }, 400)
  ).current

  return {
    html,
    loading,
    error,
    updatePreview,
    debouncedUpdatePreview,
  }
}

