'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import SharedNewsletterEditor from '@/components/SharedNewsletterEditor'
import type { NewsletterData } from '@/types/newsletter'

export default function NewsletterEditorPage() {
  const params = useParams<{ id: string }>()
  const [loaded, setLoaded] = useState<{
    userId: string
    content: NewsletterData
    saveVersion: number
  } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const session = await fetch('/api/auth/session')
      if (session.status === 401) {
        window.location.href = `/sign-in?next=/newsletters/${params.id}`
        return
      }
      const sessionBody = (await session.json()) as { user: { userId: string } }
      const newsletter = await fetch(`/api/newsletters/${params.id}`)
      if (!newsletter.ok) {
        if (!cancelled) setError('This newsletter is unavailable.')
        return
      }
      const body = (await newsletter.json()) as { content: NewsletterData; summary: { saveVersion: number } }
      if (!cancelled) {
        setLoaded({
          userId: sessionBody.user.userId,
          content: body.content,
          saveVersion: body.summary.saveVersion,
        })
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [params.id])

  if (error) return <main className="p-6">{error}</main>
  if (!loaded) return <main className="p-6">Loading newsletter…</main>
  return (
    <SharedNewsletterEditor
      newsletterId={params.id}
      userId={loaded.userId}
      initialContent={loaded.content}
      initialVersion={loaded.saveVersion}
    />
  )
}
