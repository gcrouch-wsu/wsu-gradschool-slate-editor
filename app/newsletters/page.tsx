'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import ConfirmModal from '@/components/ConfirmModal'
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

const templateNames: Record<TemplateType, string> = {
  ff: 'Friday Focus',
  briefing: 'Briefing',
  letter: 'Slate Campaign',
}

const primaryButton =
  'inline-flex items-center justify-center px-4 py-2.5 text-sm font-semibold text-white bg-wsu-crimson border border-wsu-crimson-dark rounded-md shadow-sm hover:bg-wsu-crimson-dark transition-colors disabled:opacity-60'
const secondaryButton =
  'inline-flex items-center justify-center px-4 py-2.5 text-sm font-semibold text-wsu-crimson bg-white border-2 border-wsu-crimson rounded-md hover:bg-wsu-crimson/10 transition-colors'
const dangerButton =
  'inline-flex items-center justify-center px-4 py-2.5 text-sm font-semibold text-white bg-red-700 border border-red-800 rounded-md hover:bg-red-800 transition-colors'

export default function NewsletterLibraryPage() {
  const [newsletters, setNewsletters] = useState<Summary[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState<TemplateType | 'import' | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Summary | null>(null)
  const [deleting, setDeleting] = useState(false)

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
        if (!cancelled) {
          setNewsletters(body.newsletters)
          setLoaded(true)
        }
      })
      .catch(() => {
        if (!cancelled) setError('The newsletter library is unavailable.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function create(template: TemplateType) {
    setCreating(template)
    setError('')
    const response = await fetch('/api/newsletters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template }),
    })
    if (!response.ok) {
      setCreating(null)
      setError('The draft could not be created.')
      return
    }
    const body = (await response.json()) as { id: string }
    window.location.href = `/newsletters/${body.id}`
  }

  async function confirmDelete() {
    if (!pendingDelete || deleting) return
    const target = pendingDelete
    setDeleting(true)
    setError('')
    const response = await fetch(`/api/newsletters/${target.id}`, { method: 'DELETE' })
    setDeleting(false)
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null
      setError(body?.error || 'This draft could not be deleted.')
      setPendingDelete(null)
      return
    }
    setNewsletters((current) => current.filter((item) => item.id !== target.id))
    setPendingDelete(null)
  }

  return (
    <main className="max-w-4xl mx-auto p-6">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
        <h1 className="text-2xl font-semibold">Newsletters</h1>
        <div className="flex flex-wrap gap-3">
          <Link className={secondaryButton} href="/admin">Accounts</Link>
          <button
            className={secondaryButton}
            type="button"
            onClick={() => void fetch('/api/auth/logout', { method: 'POST' }).then(() => (window.location.href = '/sign-in'))}
          >
            Sign out
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-3 mb-6">
        <button className={primaryButton} type="button" disabled={creating !== null} onClick={() => void create('ff')}>
          New Friday Focus
        </button>
        <button className={primaryButton} type="button" disabled={creating !== null} onClick={() => void create('briefing')}>
          New Briefing
        </button>
        <button className={primaryButton} type="button" disabled={creating !== null} onClick={() => void create('letter')}>
          New Slate Campaign
        </button>
        <label className={`${secondaryButton} cursor-pointer ${creating !== null ? 'opacity-60 pointer-events-none' : ''}`}>
          Import HTML
          <input
            className="sr-only"
            type="file"
            accept=".html,text/html"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (!file) return
              setCreating('import')
              setError('')
              void file.text().then(async (html) => {
                const response = await fetch('/api/newsletters/import', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ html }),
                })
                if (!response.ok) {
                  setCreating(null)
                  setError('That HTML file could not be imported.')
                  return
                }
                const body = (await response.json()) as { id: string }
                window.location.href = `/newsletters/${body.id}`
              })
            }}
          />
        </label>
      </div>
      {error && <p className="mb-4 text-red-700">{error}</p>}
      {loaded && newsletters.length === 0 && !error && (
        <p className="text-wsu-text-muted">No drafts yet. Use the buttons above to start one.</p>
      )}
      <ul className="space-y-3">
        {newsletters.map((newsletter) => (
          <li key={newsletter.id} className="border border-wsu-border-light rounded-lg p-4 bg-white flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-wsu-text-dark">{newsletter.title}</h2>
              <p className="text-sm text-wsu-text-muted">
                {templateNames[newsletter.template]} · last saved by {newsletter.updatedByName} · {new Date(newsletter.updatedAt).toLocaleString()} ·{' '}
                {newsletter.leaseHeld ? `Being edited by ${newsletter.leaseHolderName}` : 'Available to edit'}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link className={primaryButton} href={`/newsletters/${newsletter.id}`}>
                Open
              </Link>
              <button className={dangerButton} type="button" onClick={() => setPendingDelete(newsletter)}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
      <ConfirmModal
        isOpen={pendingDelete !== null}
        variant="danger"
        title="Delete this draft?"
        message={pendingDelete ? `${pendingDelete.title} will be removed from the library.` : ''}
        confirmLabel="Delete draft"
        cancelLabel="Keep draft"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </main>
  )
}
