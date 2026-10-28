'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import ConfirmModal from '@/components/ConfirmModal'
import IssueDialog from '@/components/IssueDialog'
import { errorMessage, RequestError, requestJson, jsonBody } from '@/lib/client/request'
import type { NewsletterProgress, TemplateType } from '@/types/newsletter'

interface Summary {
  id: string
  title: string
  template: TemplateType
  updatedAt: string
  updatedByName: string
  leaseHeld: boolean
  leaseHolderName: string | null
  leaseHolderUserId: string | null
  progress: NewsletterProgress
  issueDate: string | null
  changedSinceSent: boolean
}
const progressLabels: Record<NewsletterProgress, string> = {
  draft: 'Draft',
  ready: 'Ready for Slate',
  sent: 'Sent via Slate',
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
  const [templateFilter, setTemplateFilter] = useState<TemplateType | 'all'>('all')
  const [query, setQuery] = useState('')
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
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
  const [pendingPurge, setPendingPurge] = useState<Summary | null>(null)
  const [duplicateTarget, setDuplicateTarget] = useState<Summary | null>(null)
  const [createTemplate, setCreateTemplate] = useState<TemplateType | null>(null)
  const duplicateRequest = useRef<string | null>(null)
  const [lastDeleted, setLastDeleted] = useState<Summary | null>(null)
  const [notice, setNotice] = useState('')

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      const sequence = ++requestSequence.current
      try {
        const params = new URLSearchParams({ archived: String(archived) })
        if (templateFilter !== 'all') params.set('template', templateFilter)
        if (query.trim()) params.set('q', query.trim())
        const body = await requestJson<LibraryResponse>(`/api/newsletters?${params}`, { signal })
        if (sequence !== requestSequence.current || signal?.aborted) return
        setNewsletters(body.newsletters)
        setUser(body.user)
        setLoadedKey(`${archived}|${templateFilter}|${query.trim()}`)
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
    [archived, templateFilter, query],
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

  async function create(template: TemplateType, issue: { title: string; date: string }) {
    if (!begin(`Creating ${templateNames[template]}…`)) return
    try {
      const body = await requestJson<{ id: string }>(
        '/api/newsletters',
        jsonBody({ template, issueTitle: issue.title, issueDate: issue.date }),
      )
      setCreateTemplate(null)
      routerRef.current.push(`/newsletters/${body.id}`)
    } catch (failure) {
      setCreateTemplate(null)
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
    if (!pendingDelete || !begin('Archiving draft…')) return
    const target = pendingDelete
    try {
      await requestJson(`/api/newsletters/${target.id}`, { method: 'DELETE' })
      ++requestSequence.current
      setNewsletters((current) => current.filter((item) => item.id !== target.id))
      setLastDeleted(target)
      setNotice(`“${target.title}” was archived. Its saved versions are retained.`)
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
  async function confirmPurge() {
    if (!pendingPurge || !begin('Deleting permanently…')) return
    const target = pendingPurge
    try {
      await requestJson(`/api/newsletters/${target.id}/purge`, {
        method: 'DELETE',
      })
      ++requestSequence.current
      setNewsletters((current) => current.filter((item) => item.id !== target.id))
      setLastDeleted(null)
      setNotice(`“${target.title}” and its saved versions were permanently deleted.`)
    } catch (failure) {
      setRowError({
        id: target.id,
        message: `${errorMessage(failure)} The draft was not removed. Refresh to check its current status.`,
      })
    } finally {
      setPendingPurge(null)
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
  function openDuplicate(target: Summary) {
    duplicateRequest.current = crypto.randomUUID()
    setDuplicateTarget(target)
  }
  async function confirmDuplicate(issue: { title: string; date: string }) {
    if (!duplicateTarget || !duplicateRequest.current || !begin('Duplicating for the next issue…')) return
    const requestId = duplicateRequest.current
    try {
      const created = await requestJson<{ id: string }>(
        `/api/newsletters/${duplicateTarget.id}/lifecycle`,
        jsonBody({
          action: 'duplicate',
          requestId,
          issueTitle: issue.title,
          issueDate: issue.date,
        }),
      )
      duplicateRequest.current = null
      setDuplicateTarget(null)
      routerRef.current.push(`/newsletters/${created.id}`)
    } catch (failure) {
      setError(`The next issue could not be created. ${errorMessage(failure)} Retry uses the same request and will not create another copy.`)
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
        <button className={primaryButton} type="button" disabled={busy !== null} onClick={() => setCreateTemplate('ff')}>
          New Friday Focus
        </button>
        <button
          className={primaryButton}
          type="button"
          disabled={busy !== null}
          onClick={() => setCreateTemplate('briefing')}
        >
          New Briefing
        </button>
        <button
          className={primaryButton}
          type="button"
          disabled={busy !== null}
          onClick={() => setCreateTemplate('letter')}
        >
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
      <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)_auto] sm:items-end">
        <label className="text-sm font-semibold" htmlFor="template-filter">
          Template
          <select
            id="template-filter"
            className="mt-1 min-h-11 w-full rounded-md border-2 border-wsu-crimson bg-white px-3"
            value={templateFilter}
            disabled={busy !== null}
            onChange={(event) => setTemplateFilter(event.target.value as TemplateType | 'all')}
          >
            <option value="all">All types</option>
            <option value="ff">Friday Focus</option>
            <option value="briefing">Briefing</option>
            <option value="letter">Slate Campaign</option>
          </select>
        </label>
        <label className="text-sm font-semibold" htmlFor="title-search">
          Search titles
          <input
            id="title-search"
            type="search"
            value={query}
            disabled={busy !== null}
            onChange={(event) => setQuery(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-md border border-wsu-border-light px-3"
          />
        </label>
        <button
          className={secondaryButton}
          type="button"
          disabled={busy !== null || (templateFilter === 'all' && query.trim() === '')}
          onClick={() => {
            setTemplateFilter('all')
            setQuery('')
          }}
        >
          Clear filters
        </button>
      </div>
      <div className="flex flex-wrap gap-3 mb-4">
        <button
          className={archived ? secondaryButton : primaryButton}
          type="button"
          aria-pressed={!archived}
          disabled={busy !== null}
          onClick={() => setArchived(false)}
        >
          Active drafts
        </button>
        <button
          className={archived ? primaryButton : secondaryButton}
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
        {busy || (loadedKey !== `${archived}|${templateFilter}|${query.trim()}` && !loadError ? 'Loading newsletters…' : '')}
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
              Undo archive
            </button>
          )}
        </div>
      )}
      {loadedKey === `${archived}|${templateFilter}|${query.trim()}` && newsletters.length === 0 && !loadError && (
        <div className="text-wsu-text-muted">
          {templateFilter !== 'all' || query.trim() ? (
            <p>
              No newsletters match these filters.{' '}
              <button
                type="button"
                className="font-semibold text-wsu-crimson underline"
                onClick={() => {
                  setTemplateFilter('all')
                  setQuery('')
                }}
              >
                Clear filters
              </button>
            </p>
          ) : (
            <p>
              {archived
                ? 'No archived drafts. Archived drafts appear here and can be restored. An administrator can permanently delete an archived draft, and that cannot be undone.'
                : 'No drafts yet. Choose New Friday Focus, New Briefing, New Slate Campaign, or Import HTML above.'}
            </p>
          )}
        </div>
      )}
      <ul
        className="space-y-3"
        aria-label={archived ? 'Archived newsletters' : 'Active newsletters'}
        aria-busy={refreshing || loadedKey !== `${archived}|${templateFilter}|${query.trim()}`}
      >
        {loadedKey === `${archived}|${templateFilter}|${query.trim()}` &&
          newsletters.map((newsletter) => (
            <li key={newsletter.id} className="border border-wsu-border-light rounded-lg p-4 bg-white">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h2 id={`title-${newsletter.id}`} className="text-lg font-semibold text-wsu-text-dark break-words">
                    <Link className="hover:underline focus-visible:underline" href={`/newsletters/${newsletter.id}`}>
                      {newsletter.title}
                    </Link>
                  </h2>
                  <p className="text-sm font-semibold text-wsu-text-dark">{templateNames[newsletter.template]}</p>
                  <p className="text-sm text-wsu-text-dark">
                    {progressLabels[newsletter.progress] ?? 'Draft'}
                    {newsletter.changedSinceSent ? ' · Changed since sent' : ''}
                    {newsletter.issueDate ? ` · ${newsletter.issueDate}` : ''}
                  </p>
                  <p className="text-sm text-wsu-text-dark break-words">
                    Last {archived ? 'archived' : 'saved'} by <span className="font-semibold">{newsletter.updatedByName}</span>{' '}
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
                  <button
                    className={secondaryButton}
                    type="button"
                    disabled={busy !== null}
                    aria-describedby={`title-${newsletter.id}`}
                    onClick={() => openDuplicate(newsletter)}
                  >
                    Duplicate for next issue
                  </button>
                  {archived ? (
                    <>
                      <button
                        className={secondaryButton}
                        disabled={busy !== null}
                        type="button"
                        aria-describedby={`title-${newsletter.id}`}
                        onClick={() => void restore(newsletter)}
                      >
                        Restore draft
                      </button>
                      {user?.role === 'administrator' && (
                        <button
                          className={`${button} text-red-800 bg-white border-2 border-red-700 hover:bg-red-50`}
                          disabled={busy !== null}
                          type="button"
                          aria-describedby={`title-${newsletter.id}`}
                          onClick={() => setPendingPurge(newsletter)}
                        >
                          Delete permanently
                        </button>
                      )}
                    </>
                  ) : (
                    <button
                      className={`${button} text-red-800 bg-white border-2 border-red-700 hover:bg-red-50`}
                      type="button"
                      disabled={busy !== null}
                      aria-describedby={`title-${newsletter.id}`}
                      onClick={() => setPendingDelete(newsletter)}
                    >
                      Archive
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
        variant="warning"
        title="Archive this draft?"
        message={
          pendingDelete
            ? `“${pendingDelete.title}” will move to Archived drafts. Its saved content and revision history are kept, and you can restore it. Unsaved changes in another tab are not included.`
            : ''
        }
        confirmLabel="Archive draft"
        cancelLabel="Keep draft"
        busy={busy === 'Archiving draft…'}
        busyLabel="Archiving draft…"
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          if (!busyRef.current) setPendingDelete(null)
        }}
      />
      <ConfirmModal
        isOpen={pendingPurge !== null}
        variant="danger"
        title="Permanently delete this archived draft?"
        message={
          pendingPurge
            ? `“${pendingPurge.title}”, its revision history, and recovery data will be permanently removed. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete permanently"
        cancelLabel="Keep archived draft"
        busy={busy === 'Deleting permanently…'}
        busyLabel="Deleting permanently…"
        onConfirm={() => void confirmPurge()}
        onCancel={() => {
          if (!busyRef.current) setPendingPurge(null)
        }}
      />
      {createTemplate && (
        <IssueDialog
          title={`New ${templateNames[createTemplate]}`}
          description="Name this issue. You can change the title and date later in Masthead."
          confirmLabel="Create draft"
          busyLabel="Creating…"
          busy={busy !== null}
          onConfirm={(issue) => void create(createTemplate, issue)}
          onCancel={() => setCreateTemplate(null)}
        />
      )}
      {duplicateTarget && (
        <IssueDialog
          title="Duplicate for next issue"
          description={`Creates a new draft from “${duplicateTarget.title}”. Progress, editing holds, and sent records stay with the original.`}
          confirmLabel="Create next issue"
          busyLabel="Duplicating…"
          busy={busy !== null}
          onConfirm={(issue) => void confirmDuplicate(issue)}
          onCancel={() => {
            duplicateRequest.current = null
            setDuplicateTarget(null)
          }}
        />
      )}
    </main>
  )
}
