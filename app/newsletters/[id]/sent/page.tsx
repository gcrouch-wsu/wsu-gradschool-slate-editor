'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { errorMessage, jsonBody, requestJson } from '@/lib/client/request'
import type { NewsletterData } from '@/types/newsletter'

interface SentVersion {
  id: string
  saveVersion: number
  markedAt: string
  actorName: string
  changedSinceSent: boolean
  snapshot: NewsletterData
}

export default function SentVersionPage() {
  const params = useParams<{ id: string }>()
  const [sent, setSent] = useState<SentVersion | null>(null)
  const [html, setHtml] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    try {
      const body = await requestJson<SentVersion>(`/api/newsletters/${params.id}/sent`)
      setSent(body)
      const preview = await requestJson<{ html: string }>('/api/preview', jsonBody(body.snapshot))
      setHtml(preview.html)
      setError('')
    } catch (failure) {
      setError(errorMessage(failure))
    }
  }, [params.id])
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0)
    return () => clearTimeout(timer)
  }, [load])
  async function download() {
    if (!sent) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/newsletters/${params.id}/sent/export`, jsonBody({ markId: sent.id }))
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error || 'The sent version could not be exported.')
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || 'sent-newsletter.html'
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6">
      <Link className="inline-flex min-h-11 items-center font-semibold text-wsu-crimson underline" href={`/newsletters/${params.id}`}>
        Back to current draft
      </Link>
      <h1 className="mt-3 text-2xl font-semibold">Sent version</h1>
      {!sent && !error && <p role="status">Loading sent version…</p>}
      {error && (
        <p role="alert" className="mt-3 text-red-800">
          {error}
        </p>
      )}
      {sent && (
        <>
          <p className="mt-2 text-sm">
            Marked by <span className="font-semibold">{sent.actorName}</span> on{' '}
            <time dateTime={sent.markedAt}>{new Date(sent.markedAt).toLocaleString()}</time>. Saved version{' '}
            {sent.saveVersion}.
          </p>
          <p className="mt-2 text-sm">
            {sent.changedSinceSent
              ? 'Changed since sent. This recorded version is what was marked. The current draft is not what recipients were recorded as receiving.'
              : 'This is the version that was marked as sent via Slate. It does not confirm that Slate delivered it.'}
          </p>
          <button
            type="button"
            className="mt-3 inline-flex min-h-11 items-center rounded-md bg-wsu-crimson px-4 font-semibold text-white"
            disabled={busy}
            onClick={() => void download()}
          >
            {busy ? 'Preparing HTML…' : 'Export sent version'}
          </button>
          <iframe title="Sent newsletter preview" className="mt-4 h-[70vh] w-full border" sandbox="" srcDoc={html} />
        </>
      )}
    </main>
  )
}
