'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import ConfirmModal from '@/components/ConfirmModal'
import { errorMessage, RequestError, requestJson, jsonBody } from '@/lib/client/request'
import type { TemplateType } from '@/types/newsletter'

interface Summary {
  id: string
  title: string
  template: TemplateType
  updatedAt: string
  updatedByName: string
  leaseHeld: boolean
  leaseHolderName: string | null
  leaseHolderUserId: string | null
}
interface LibraryResponse {
  newsletters: Summary[]
  user: { userId: string; role: string }
}
const templateNames: Record<TemplateType, string> = {
  ff: 'Friday Focus',
  briefing: 'Briefing',
  letter: 'Slate Campaign',
}
const button =
  'inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold rounded-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wsu-crimson disabled:opacity-60 disabled:cursor-wait'
const primaryButton = `${button} text-white bg-wsu-crimson border border-wsu-crimson-dark hover:bg-wsu-crimson-dark`
const secondaryButton = `${button} text-wsu-crimson bg-white border-2 border-wsu-crimson hover:bg-wsu-crimson/10`

export default function NewsletterLibraryPage() {
  const router = useRouter()
  const routerRef = useRef(router)
  useEffect(() => {
    routerRef.current = router
  }, [router])
  const [newsletters, setNewsletters] = useState<Summary[]>([])
  const [archived, setArchived] = useState(false)
  const [loadedView, setLoadedView] = useState<boolean | null>(null)
  const [user, setUser] = useState<LibraryResponse['user'] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [rowError, setRowError] = useState<{
    id: string
    message: string
  } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const busyRef = useRef(false)
  const requestSequence = useRef(0)
  const [refreshing, setRefreshing] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Summary | null>(null)
  const [lastDeleted, setLastDeleted] = useState<Summary | null>(null)
  const [notice, setNotice] = useState('')

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      const sequence = ++requestSequence.current
      try {
        const body = await requestJson<LibraryResponse>(`/api/newsletters?archived=${archived}`, { signal })
        if (sequence !== requestSequence.current || signal?.aborted) return
        setNewsletters(body.newsletters)
        setUser(body.user)
        setLoadedView(archived)
        setLoadError('')
      } catch (failure) {
        if (signal?.aborted || sequence !== requestSequence.current) return
        if (failure instanceof RequestError && failure.status === 401) {
          routerRef.current.replace('/sign-in?next=/newsletters')
          return
        }
        setLoadError(`The newsletter library is unavailable. ${errorMessage(failure)}`)
      } finally {
        if (sequence === requestSequence.current) setRefreshing(false)
      }
    },
    [archived],
  )

  useEffect(() => {
    const controller = new AbortController()
    queueMicrotask(() => {
      if (!controller.signal.aborted) void refresh(controller.signal)
    })
    const onFocus = () => {
      if (!busyRef.current) void refresh(controller.signal)
    }
    const timer = setInterval(onFocus, 30000)
    window.addEventListener('focus', onFocus)
    return () => {
      controller.abort()
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [refresh])

  function begin(label: string): boolean {
    if (busyRef.current) return false
    busyRef.current = true
    setBusy(label)
    setError('')
    setRowError(null)
    setNotice('')
    return true
  }
  function end() {
    busyRef.current = false
    setBusy(null)
  }

  async function create(template: TemplateType) {
    if (!begin(`Creating ${templateNames[template]}…`)) return
    try {
      const body = await requestJson<{ id: string }>('/api/newsletters', jsonBody({ template }))
      routerRef.current.push(`/newsletters/${body.id}`)
    } catch (failure) {
      setError(`${errorMessage(failure)} Creation could not be confirmed; refresh the library before trying again.`)
    } finally {
      end()
    }
  }
  async function importFile(file: File) {
    if (!begin('Importing HTML…')) return
    try {
      const body = await requestJson<{ id: string }>('/api/newsletters/import', jsonBody({ html: await file.text() }))
      routerRef.current.push(`/newsletters/${body.id}`)
    } catch (failure) {
      setError(`That HTML file could not be imported. ${errorMessage(failure)}`)
    } finally {
      end()
    }
  }
  async function confirmDelete() {
    if (!pendingDelete || !begin('Deleting draft…')) return
    const target = pendingDelete
    try {
      await requestJson(`/api/newsletters/${target.id}`, { method: 'DELETE' })
      ++requestSequence.current
      setNewsletters((current) => current.filter((item) => item.id !== target.id))
      setLastDeleted(target)
      setNotice(`“${target.title}” was moved to Archived drafts. Its saved versions are retained.`)
    } catch (failure) {
      setRowError({
        id: target.id,
        message: `${errorMessage(failure)} Refresh to check the draft's current status.`,
      })
    } finally {
      setPendingDelete(null)
      end()
      void refresh()
    }
  }
  async function restore(target: Summary) {
    if (!begin('Restoring draft…')) return
    try {
      await requestJson(`/api/newsletters/${target.id}/restore`, {
        method: 'POST',
      })
      setLastDeleted(null)
      setNotice(`“${target.title}” was restored. It is available in Active drafts.`)
      await refresh()
    } catch (failure) {
      setError(`The draft could not be restored. ${errorMessage(failure)}`)
    } finally {
      end()
    }
  }
  async function signOut() {
    if (!begin('Signing out…')) return
    try {
      await requestJson('/api/auth/logout', { method: 'POST' })
      routerRef.current.replace('/sign-in')
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      end()
    }
  }

  return (
    <main className="max-w-4xl mx-auto p-4 sm:p-6">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
        <h1 className="text-2xl font-semibold">Newsletters</h1>
        <div className="flex flex-wrap gap-3">
          {user?.role === 'administrator' && (
            <Link className={secondaryButton} href="/admin">
              Accounts
            </Link>
          )}
          <button className={secondaryButton} type="button" disabled={busy !== null} onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-3 mb-3" aria-label="Create a newsletter">
        <button className={primaryButton} type="button" disabled={busy !== null} onClick={() => void create('ff')}>
          New Friday Focus
        </button>
        <button
          className={primaryButton}
          type="button"
          disabled={busy !== null}
          onClick={() => void create('briefing')}
        >
          New Briefing
        </button>
        <button className={primaryButton} type="button" disabled={busy !== null} onClick={() => void create('letter')}>
          New Slate Campaign
        </button>
        <label
          className={`${secondaryButton} relative cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 ${busy ? 'opacity-60' : ''}`}
        >
          Import HTML
          <input
            className="sr-only"
            type="file"
            accept=".html,text/html"
            disabled={busy !== null}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void importFile(file)
            }}
          />
        </label>
      </div>
      <p className="text-sm text-wsu-text-muted mb-6">
        Start a new newsletter or import HTML previously exported from this editor. Open a draft to continue editing.
      </p>
      <div className="flex flex-wrap gap-3 mb-4">
        <button
          className={secondaryButton}
          type="button"
          aria-pressed={!archived}
          disabled={busy !== null}
          onClick={() => setArchived(false)}
        >
          Active drafts
        </button>
        <button
          className={secondaryButton}
          type="button"
          aria-pressed={archived}
          disabled={busy !== null}
          onClick={() => setArchived(true)}
        >
          Archived drafts
        </button>
        <button
          className={secondaryButton}
          type="button"
          disabled={refreshing || busy !== null}
          onClick={() => {
            setRefreshing(true)
            void refresh()
          }}
        >
          Refresh library
        </button>
      </div>
      <div role="status" aria-live="polite" className="mb-3 text-sm">
        {busy || (loadedView !== archived && !loadError ? 'Loading newsletters…' : '')}
      </div>
      {loadError && (
        <div role="alert" className="mb-4 text-red-800">
          {loadError}{' '}
          <button type="button" className="underline font-semibold" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mb-4 text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <div role="status" className="mb-4 p-3 bg-white border rounded-md">
          {notice}{' '}
          {lastDeleted && (
            <button
              type="button"
              disabled={busy !== null}
              className="underline font-semibold text-wsu-crimson ml-2"
              onClick={() => void restore(lastDeleted)}
            >
              Undo delete
            </button>
          )}
        </div>
      )}
      {loadedView === archived && newsletters.length === 0 && !loadError && (
        <p className="text-wsu-text-muted">
          {archived
            ? 'No archived drafts. Deleted drafts appear here and can be restored.'
            : 'No drafts yet. Choose New Friday Focus, New Briefing, New Slate Campaign, or Import HTML above.'}
        </p>
      )}
      <ul
        className="space-y-3"
        aria-label={archived ? 'Archived newsletters' : 'Active newsletters'}
        aria-busy={refreshing || loadedView !== archived}
      >
        {loadedView === archived &&
          newsletters.map((newsletter) => (
            <li key={newsletter.id} className="border border-wsu-border-light rounded-lg p-4 bg-white">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h2 id={`title-${newsletter.id}`} className="text-lg font-semibold text-wsu-text-dark break-words">
                    <Link className="hover:underline focus-visible:underline" href={`/newsletters/${newsletter.id}`}>
                      {newsletter.title}
                    </Link>
                  </h2>
                  <p className="text-sm text-wsu-text-muted break-words">
                    {templateNames[newsletter.template]} · last {archived ? 'archived' : 'saved'} by{' '}
                    {newsletter.updatedByName} ·{' '}
                    <time dateTime={newsletter.updatedAt}>{new Date(newsletter.updatedAt).toLocaleString()}</time>
                  </p>
                  {!archived && (
                    <p className="text-sm text-wsu-text-muted">
                      {newsletter.leaseHeld
                        ? `Being edited by ${newsletter.leaseHolderName}${newsletter.leaseHolderUserId === user?.userId ? ' (you)' : ''}`
                        : 'Available to edit'}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-3 shrink-0">
                  <Link
                    className={primaryButton}
                    aria-describedby={`title-${newsletter.id}`}
                    href={`/newsletters/${newsletter.id}`}
                  >
                    Open
                  </Link>
                  {archived ? (
                    <button
                      className={secondaryButton}
                      disabled={busy !== null}
                      type="button"
                      aria-describedby={`title-${newsletter.id}`}
                      onClick={() => void restore(newsletter)}
                    >
                      Restore draft
                    </button>
                  ) : (
                    <button
                      className={`${button} text-red-800 bg-white border-2 border-red-700 hover:bg-red-50`}
                      type="button"
                      disabled={busy !== null}
                      aria-describedby={`title-${newsletter.id}`}
                      onClick={() => setPendingDelete(newsletter)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
              {rowError?.id === newsletter.id && (
                <p role="alert" className="mt-3 text-red-800">
                  {rowError.message}
                </p>
              )}
            </li>
          ))}
      </ul>
      <ConfirmModal
        isOpen={pendingDelete !== null}
        variant="danger"
        title="Delete this draft?"
        message={
          pendingDelete
            ? `“${pendingDelete.title}” will move to Archived drafts. Its saved content and revision history are kept, and you can restore it. Unsaved changes in another tab are not included.`
            : ''
        }
        confirmLabel="Delete draft"
        cancelLabel="Keep draft"
        busy={busy === 'Deleting draft…'}
        busyLabel="Deleting draft…"
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          if (!busyRef.current) setPendingDelete(null)
        }}
      />
    </main>
  )
}
