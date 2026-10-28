'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import SharedNewsletterEditor from '@/components/SharedNewsletterEditor'
import { errorMessage, RequestError, requestJson } from '@/lib/client/request'
import { canonicalJson } from '@/lib/canonical-json'
import type { NewsletterData, NewsletterProgress } from '@/types/newsletter'

export default function NewsletterEditorPage() {
  const params = useParams<{ id: string }>()
  return <DraftLoader key={params.id} newsletterId={params.id} />
}

function DraftLoader({ newsletterId }: { newsletterId: string }) {
  const router = useRouter()
  const routerRef = useRef(router)
  useEffect(() => {
    routerRef.current = router
  }, [router])
  const [loaded, setLoaded] = useState<{
    userId: string
    content: NewsletterData
    saveVersion: number
    progress: NewsletterProgress
    changedSinceSent: boolean
    sentMarkId: string | null
    sentCanonical: string | null
  } | null>(null)
  const [error, setError] = useState('')
  const [deleted, setDeleted] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const load = useCallback(
    async (signal: AbortSignal) => {
      try {
        const [session, newsletter] = await Promise.all([
          requestJson<{ user: { userId: string } }>('/api/auth/session', {
            signal,
          }),
          requestJson<{
            content: NewsletterData
            summary: {
              saveVersion: number
              archived: boolean
              progress: NewsletterProgress
              changedSinceSent: boolean
              sentMarkId: string | null
            }
            sentCanonical?: string | null
          }>(`/api/newsletters/${newsletterId}`, { signal }),
        ])
        if (signal.aborted) return
        setDeleted(newsletter.summary.archived)
        if (!newsletter.summary.archived)
          setLoaded({
            userId: session.user.userId,
            content: newsletter.content,
            saveVersion: newsletter.summary.saveVersion,
            progress: newsletter.summary.progress ?? 'draft',
            changedSinceSent: Boolean(newsletter.summary.changedSinceSent),
            sentMarkId: newsletter.summary.sentMarkId ?? null,
            sentCanonical:
              newsletter.sentCanonical ??
              (newsletter.summary.changedSinceSent ? null : canonicalJson(newsletter.content)),
          })
      } catch (failure) {
        if (signal.aborted) return
        if (failure instanceof RequestError && failure.status === 401)
          routerRef.current.replace(`/sign-in?next=/newsletters/${newsletterId}`)
        else setError(errorMessage(failure))
      }
    },
    [newsletterId],
  )
  useEffect(() => {
    const controller = new AbortController()
    queueMicrotask(() => {
      if (!controller.signal.aborted) void load(controller.signal)
    })
    return () => controller.abort()
  }, [load, attempt])
  async function restore() {
    setRestoring(true)
    setError('')
    try {
      await requestJson(`/api/newsletters/${newsletterId}/restore`, {
        method: 'POST',
      })
      setDeleted(false)
      setAttempt((current) => current + 1)
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setRestoring(false)
    }
  }
  if (loaded && !deleted)
    return (
      <SharedNewsletterEditor
        newsletterId={newsletterId}
        userId={loaded.userId}
        initialContent={loaded.content}
        initialVersion={loaded.saveVersion}
        initialProgress={loaded.progress}
        initialChangedSinceSent={loaded.changedSinceSent}
        initialSentMarkId={loaded.sentMarkId}
        initialSentCanonical={loaded.sentCanonical}
      />
    )
  return (
    <main className="max-w-xl mx-auto p-6 space-y-4">
      <Link className="inline-flex min-h-11 items-center text-wsu-crimson font-semibold underline" href="/newsletters">
        All newsletters
      </Link>
      {deleted ? (
        <>
          <h1 className="text-2xl font-semibold">This draft is archived.</h1>
          <p>Its saved content and revision history are kept. Restore it to continue editing.</p>
          <button
            type="button"
            disabled={restoring}
            className="bg-wsu-crimson text-white rounded px-4 py-3"
            onClick={() => void restore()}
          >
            {restoring ? 'Restoring draft…' : 'Restore draft'}
          </button>
        </>
      ) : (
        !error && <p role="status">Loading newsletter…</p>
      )}
      {error && (
        <div role="alert">
          <p>{error}</p>
          {!deleted && (
            <button
              type="button"
              className="underline font-semibold mt-3"
              onClick={() => {
                setError('')
                setAttempt((current) => current + 1)
              }}
            >
              Retry
            </button>
          )}
        </div>
      )}
    </main>
  )
}
