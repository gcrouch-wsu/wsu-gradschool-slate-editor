'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { TemplateType } from '@/types/newsletter'

interface Summary {
  id: string
  title: string
  template: TemplateType
  updatedAt: string
  updatedByName: string
  leaseHeld: boolean
  leaseHolderName: string | null
}

export default function NewsletterLibraryPage() {
  const [newsletters, setNewsletters] = useState<Summary[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch('/api/newsletters')
      .then(async (response) => {
        if (cancelled) return
        if (response.status === 401) {
          window.location.href = '/sign-in?next=/newsletters'
          return
        }
        if (!response.ok) {
          setError('The newsletter library is unavailable.')
          return
        }
        const body = (await response.json()) as { newsletters: Summary[] }
        if (!cancelled) setNewsletters(body.newsletters)
      })
      .catch(() => {
        if (!cancelled) setError('The newsletter library is unavailable.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function create(template: TemplateType) {
    const response = await fetch('/api/newsletters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template }),
    })
    if (!response.ok) return
    const body = (await response.json()) as { id: string }
    window.location.href = `/newsletters/${body.id}`
  }

  return (
    <main className="max-w-4xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">Newsletters</h1>
        <div className="flex gap-3">
          <Link className="text-sm text-wsu-crimson" href="/admin">Accounts</Link>
          <button type="button" onClick={() => void fetch('/api/auth/logout', { method: 'POST' }).then(() => (window.location.href = '/sign-in'))}>
            Sign out
          </button>
        </div>
      </div>
      <div className="flex gap-2 mb-6">
        <button type="button" onClick={() => void create('ff')}>New Friday Focus</button>
        <button type="button" onClick={() => void create('briefing')}>New Briefing</button>
        <button type="button" onClick={() => void create('letter')}>New Slate Campaign</button>
        <label className="border rounded px-3 py-1 cursor-pointer">
          Import HTML
          <input
            className="sr-only"
            type="file"
            accept=".html,text/html"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (!file) return
              void file.text().then(async (html) => {
                const response = await fetch('/api/newsletters/import', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ html }),
                })
                if (!response.ok) return
                const body = (await response.json()) as { id: string }
                window.location.href = `/newsletters/${body.id}`
              })
            }}
          />
        </label>
      </div>
      {error && <p>{error}</p>}
      <ul className="space-y-3">
        {newsletters.map((newsletter) => (
          <li key={newsletter.id} className="border rounded p-4">
            <Link className="font-medium text-wsu-crimson" href={`/newsletters/${newsletter.id}`}>
              {newsletter.title}
            </Link>
            <p className="text-sm text-wsu-text-muted">
              {newsletter.template} · last saved by {newsletter.updatedByName} · {new Date(newsletter.updatedAt).toLocaleString()} ·{' '}
              {newsletter.leaseHeld ? `Being edited by ${newsletter.leaseHolderName}` : 'Available to edit'}
            </p>
          </li>
        ))}
      </ul>
    </main>
  )
}
