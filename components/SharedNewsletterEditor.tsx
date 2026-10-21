'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import EditorPanel from '@/components/EditorPanel'
import PreviewPanel from '@/components/PreviewPanel'
import ConfirmModal from '@/components/ConfirmModal'
import { useNewsletterState } from '@/app/hooks/useNewsletterState'
import { usePreview } from '@/app/hooks/usePreview'
import { beginLeaseRequest, clearTabLease, currentLeaseToken, rememberLease } from '@/lib/client/tab-lease'
import { SerializedSaver, type SaveResponse, type SaveStatus } from '@/lib/client/save-queue'
import { errorMessage, jsonBody, RequestError, requestJson } from '@/lib/client/request'
import type { NewsletterData, ValidationIssue, ValidationResult } from '@/types/newsletter'

interface Props {
  newsletterId: string
  userId: string
  initialContent: NewsletterData
  initialVersion: number
}
type Banner =
  | 'connecting'
  | 'idle'
  | 'lease_lost'
  | 'session_expired'
  | 'release_pending'
  | 'conflict'
  | 'view_only'
  | 'deleted'
interface Lease {
  token: string
  saveVersion: number
  content: NewsletterData
}
const button =
  'inline-flex min-h-11 items-center justify-center rounded-md border px-3 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wsu-crimson disabled:opacity-50 disabled:cursor-not-allowed'
const secondary = `${button} bg-white border-wsu-crimson text-wsu-crimson hover:bg-wsu-bg-light`
const primary = `${button} bg-wsu-crimson border-wsu-crimson text-white hover:bg-wsu-crimson-dark`

export default function SharedNewsletterEditor({ newsletterId, userId, initialContent, initialVersion }: Props) {
  const router = useRouter()
  const [document, setDocument] = useState(initialContent)
  const { state, updateState, undo, redo, canUndo, canRedo, resetState } = useNewsletterState(document, false)
  const stateRef = useRef(state)
  const [canWrite, setCanWrite] = useState(false)
  const [banner, setBanner] = useState<Banner>('connecting')
  const [status, setStatus] = useState<SaveStatus>('saved')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const operationRef = useRef(false)
  const [leavePrompt, setLeavePrompt] = useState(false)
  const [recovery, setRecovery] = useState<NewsletterData | null>(null)
  const [staleRecovery, setStaleRecovery] = useState(false)
  const [issues, setIssues] = useState<ValidationIssue[] | null>(null)
  const [mobileView, setMobileView] = useState<'edit' | 'preview'>('edit')
  const saverRef = useRef<SerializedSaver | null>(null)
  const versionRef = useRef(initialVersion)
  const lastNoted = useRef(JSON.stringify(initialContent))
  const mounted = useRef(false)
  const { html, loading, updatePreview } = usePreview()
  const backupKey = `wsu_newsletter_backup:${userId}:${newsletterId}`

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    stateRef.current = state
  }, [state])
  useEffect(() => {
    void updatePreview(state)
  }, [state, updatePreview])

  const backup = useCallback(
    (snapshot: NewsletterData, baseVersion: number) => {
      try {
        localStorage.setItem(
          backupKey,
          JSON.stringify({
            snapshot,
            baseVersion,
            savedAt: new Date().toISOString(),
          }),
        )
      } catch {
        /* Server saves still run if local recovery storage is unavailable. */
      }
    },
    [backupKey],
  )
  const readRecovery = useCallback(
    (version: number) => {
      try {
        const raw = localStorage.getItem(backupKey)
        if (!raw) {
          setRecovery(null)
          setStaleRecovery(false)
          return
        }
        const parsed = JSON.parse(raw) as {
          snapshot?: NewsletterData
          baseVersion?: number
        }
        setRecovery(parsed.snapshot && parsed.baseVersion === version ? parsed.snapshot : null)
        setStaleRecovery(Boolean(parsed.snapshot && parsed.baseVersion !== version))
      } catch {
        setRecovery(null)
      }
    },
    [backupKey],
  )
  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) readRecovery(initialVersion)
    })
    return () => {
      cancelled = true
    }
  }, [readRecovery, initialVersion])

  const sendSave = useCallback(
    async (request: { saveId: string; expectedVersion: number; snapshot: unknown }): Promise<SaveResponse> => {
      const token = currentLeaseToken(newsletterId)
      if (!token) return { ok: false, code: 'lease' }
      try {
        const response = await fetch(`/api/newsletters/${newsletterId}/saves`, jsonBody({ ...request, token }))
        if (response.status === 401) return { ok: false, code: 'session' }
        const body = await response.json().catch(() => null)
        if (response.status === 409) {
          if (body?.code === 'archived') {
            if (mounted.current) setBanner('deleted')
            return { ok: false, code: 'archived' }
          }
          return {
            ok: false,
            code: body?.code === 'lease' ? 'lease' : body?.code === 'fingerprint' ? 'fingerprint' : 'version',
          }
        }
        if (!response.ok || !Number.isInteger(body?.saveVersion) || !Number.isInteger(body?.currentVersion))
          return { ok: false, code: 'network' }
        versionRef.current = body.saveVersion
        if (JSON.stringify(stateRef.current) === JSON.stringify(request.snapshot)) {
          try {
            localStorage.removeItem(backupKey)
          } catch {
            /* Keep the acknowledged server save. */
          }
        } else backup(stateRef.current, body.saveVersion)
        return {
          ok: true,
          saveVersion: body.saveVersion,
          currentVersion: body.currentVersion,
        }
      } catch {
        return { ok: false, code: 'network' }
      }
    },
    [newsletterId, backupKey, backup],
  )

  const onSaveStatus = useCallback((next: SaveStatus) => {
    if (!mounted.current) return
    setStatus(next)
    if (next === 'lease_lost' || next === 'session_expired' || next === 'conflict') {
      setCanWrite(false)
      setBanner((current) => (current === 'deleted' ? current : next))
    }
  }, [])
  const adopt = useCallback(
    (lease: Lease) => {
      rememberLease(newsletterId, lease.token)
      stateRef.current = lease.content
      lastNoted.current = JSON.stringify(lease.content)
      versionRef.current = lease.saveVersion
      saverRef.current = new SerializedSaver(lease.saveVersion, sendSave, () => crypto.randomUUID(), onSaveStatus)
      setDocument(lease.content)
      resetState(lease.content)
      setCanWrite(true)
      setBanner('idle')
      setStatus('saved')
      setError('')
      readRecovery(lease.saveVersion)
    },
    [newsletterId, sendSave, onSaveStatus, resetState, readRecovery],
  )

  useEffect(() => {
    let stopped = false
    beginLeaseRequest(newsletterId, async () => {
      const cached = currentLeaseToken(newsletterId)
      if (cached) {
        try {
          return await requestJson<Lease>(
            `/api/newsletters/${newsletterId}/lease`,
            jsonBody({ action: 'resume', token: cached }),
          )
        } catch (failure) {
          if (!(failure instanceof RequestError) || failure.status !== 409) throw failure
          rememberLease(newsletterId, null)
        }
      }
      return requestJson<Lease>(`/api/newsletters/${newsletterId}/lease`, jsonBody({ action: 'acquire' }))
    })
      .then((lease) => {
        if (!stopped) adopt(lease)
      })
      .catch((failure) => {
        if (stopped) return
        setCanWrite(false)
        setBanner(failure instanceof RequestError && failure.status === 401 ? 'session_expired' : 'view_only')
        setError(errorMessage(failure))
      })
    return () => {
      stopped = true
    }
  }, [newsletterId, adopt])

  const noteSnapshot = useCallback(
    (snapshot: NewsletterData) => {
      const serialized = JSON.stringify(snapshot)
      if (serialized === lastNoted.current) return
      lastNoted.current = serialized
      saverRef.current?.note(snapshot)
      backup(snapshot, versionRef.current)
      setNotice('')
      setIssues(null)
    },
    [backup],
  )
  // All history changes (including Undo/Redo) enter the same save queue.
  useEffect(() => {
    if (canWrite) noteSnapshot(state)
  }, [state, canWrite, noteSnapshot])
  const onEdit = useCallback(
    (updater: (prev: NewsletterData) => NewsletterData, pushHistory = true) => {
      if (!canWrite || operationRef.current) return
      const next = updater(stateRef.current)
      stateRef.current = next
      updateState(() => next, pushHistory)
      noteSnapshot(next)
    },
    [canWrite, updateState, noteSnapshot],
  )

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!saverRef.current?.hasPending) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])
  useEffect(() => {
    if (!canWrite) return
    const timer = setInterval(() => {
      if (!operationRef.current && saverRef.current?.status === 'unsaved') void saverRef.current.flush()
    }, 1500)
    let stopped = false
    const renew = async () => {
      if (operationRef.current) return
      const token = currentLeaseToken(newsletterId)
      if (!token) return
      try {
        await requestJson(`/api/newsletters/${newsletterId}/lease`, jsonBody({ action: 'renew', token }))
      } catch (failure) {
        if (stopped) return
        setCanWrite(false)
        setBanner(failure instanceof RequestError && failure.status === 401 ? 'session_expired' : 'lease_lost')
        setError(errorMessage(failure))
        rememberLease(newsletterId, null)
      }
    }
    const configured = Number(process.env.NEXT_PUBLIC_LEASE_RENEW_MS || 60000)
    const heartbeat = setInterval(
      () => void renew(),
      Number.isFinite(configured) && configured >= 1000 ? configured : 60000,
    )
    return () => {
      stopped = true
      clearInterval(timer)
      clearInterval(heartbeat)
    }
  }, [canWrite, newsletterId])

  async function operation(label: string, action: () => Promise<void>) {
    if (operationRef.current) return
    operationRef.current = true
    setBusy(label)
    setError('')
    try {
      await action()
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      operationRef.current = false
      setBusy(null)
    }
  }
  async function takeOver() {
    await operation('Starting editing…', async () => {
      const lease = await requestJson<Lease>(`/api/newsletters/${newsletterId}/lease`, jsonBody({ action: 'takeover' }))
      clearTabLease(newsletterId)
      adopt(lease)
    })
  }
  async function flushChanges(): Promise<boolean> {
    const saver = saverRef.current
    if (!saver) return true
    const result = await saver.flush()
    if (result === 'saved') return true
    setError('Your changes have not been saved. Retry when connected, or keep the local recovery copy before leaving.')
    return false
  }
  async function release(): Promise<boolean> {
    const token = currentLeaseToken(newsletterId)
    if (!token) {
      if (banner === 'idle') return true
      setError('Editing authority changed. Your saved draft remains in the library.')
      return false
    }
    try {
      const result = await requestJson<{ released: boolean }>(
        `/api/newsletters/${newsletterId}/lease`,
        jsonBody({ action: 'release', token }),
      )
      if (!result.released) {
        setBanner('lease_lost')
        setCanWrite(false)
        setError('Another editing session now holds this draft.')
        return false
      }
      rememberLease(newsletterId, null)
      try {
        localStorage.removeItem(backupKey)
      } catch {
        /* Server save is authoritative. */
      }
      setCanWrite(false)
      setBanner('idle')
      setNotice('Saved. Ready for the next editor.')
      return true
    } catch {
      setCanWrite(false)
      setBanner('release_pending')
      setNotice('Saved; editing lease release pending. Retry only the release.')
      return false
    }
  }
  async function finish(leave = false) {
    await operation('Saving and finishing…', async () => {
      if (canWrite) noteSnapshot(stateRef.current)
      if (!(await flushChanges())) return
      if (!(await release())) return
      if (leave) router.push('/newsletters')
    })
  }
  function leave() {
    if (operationRef.current) return
    if (canWrite || banner === 'release_pending') {
      void finish(true)
      return
    }
    if (saverRef.current?.hasPending) {
      setLeavePrompt(true)
      return
    }
    router.push('/newsletters')
  }
  async function checkAccessibility() {
    await operation('Checking accessibility…', async () => {
      const result = await requestJson<ValidationResult>('/api/validate', jsonBody(stateRef.current))
      setIssues(result.issues || [])
    })
  }
  async function exportHtml() {
    await operation('Preparing HTML…', async () => {
      if (!(await flushChanges())) return
      const response = await fetch(
        `/api/newsletters/${newsletterId}/export`,
        jsonBody({ expectedVersion: versionRef.current }),
      )
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        if (body?.issues) setIssues(body.issues)
        throw new Error(body?.error || 'HTML could not be exported. Please retry.')
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = window.document.createElement('a')
      link.href = url
      link.download = response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || 'Newsletter.html'
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setNotice(
        'HTML exported from the saved draft. Review links, image descriptions, and the email preview in Slate before sending.',
      )
    })
  }
  const statusLabel =
    banner === 'connecting'
      ? 'Checking editing access…'
      : banner === 'deleted'
        ? 'This draft was deleted.'
        : banner === 'release_pending'
          ? 'Saved; editing lease release pending'
          : banner === 'session_expired'
            ? 'Session expired'
            : banner === 'lease_lost'
              ? 'Editing lease lost'
              : status === 'saving'
                ? 'Saving'
                : status === 'unsaved' || status === 'conflict'
                  ? 'Changes not saved'
                  : canWrite
                    ? 'Saved'
                    : 'View only'

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex flex-col gap-4 px-4 py-3 bg-white border-b lg:flex-row lg:justify-between lg:items-start">
        <div className="min-w-0">
          <Link
            className="inline-flex min-h-11 items-center font-semibold text-wsu-crimson underline"
            href="/newsletters"
            onNavigate={(event) => {
              event.preventDefault()
              leave()
            }}
          >
            All newsletters
          </Link>
          <h1 className="text-xl font-semibold break-words">{state.masthead.title || 'Newsletter'}</h1>
          <p className="text-sm text-wsu-text-muted">
            Changes save automatically. Finish editing to make this draft available to the next person.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0 lg:max-w-xl">
          <span role="status" aria-live="polite" data-testid="save-status" className="w-full text-sm font-medium">
            {statusLabel}
          </span>
          <button className={secondary} type="button" onClick={undo} disabled={!canUndo || !canWrite || busy !== null}>
            Undo
          </button>
          <button className={secondary} type="button" onClick={redo} disabled={!canRedo || !canWrite || busy !== null}>
            Redo
          </button>
          {!canWrite && banner !== 'connecting' && banner !== 'deleted' && banner !== 'session_expired' && (
            <button className={secondary} disabled={busy !== null} type="button" onClick={() => void takeOver()}>
              Take over editing
            </button>
          )}
          {canWrite && (
            <button className={primary} type="button" disabled={busy !== null} onClick={() => void finish()}>
              Save and finish editing
            </button>
          )}
          {banner === 'release_pending' && (
            <button
              className={primary}
              type="button"
              disabled={busy !== null}
              onClick={() =>
                void operation('Releasing editing…', async () => {
                  await release()
                })
              }
            >
              Retry lease release
            </button>
          )}
          <button
            className={secondary}
            type="button"
            disabled={busy !== null || banner === 'connecting' || banner === 'deleted'}
            onClick={() => void checkAccessibility()}
          >
            Check accessibility
          </button>
          <button
            className={primary}
            type="button"
            disabled={busy !== null || banner === 'connecting' || banner === 'deleted' || banner === 'session_expired'}
            onClick={() => void exportHtml()}
          >
            Export HTML
          </button>
        </div>
      </header>
      <div className="px-4 space-y-2">
        {busy && (
          <p role="status" className="py-2">
            {busy}
          </p>
        )}
        {notice && (
          <p role="status" className="py-2 text-green-900">
            {notice}
          </p>
        )}
        {error && (
          <div role="alert" className="py-2 text-red-800">
            {error}{' '}
            {banner === 'session_expired' && (
              <a className="underline font-semibold" href={`/sign-in?next=/newsletters/${newsletterId}`}>
                Sign in again
              </a>
            )}
          </div>
        )}
        {banner === 'view_only' && (
          <p className="py-2 text-sm">
            This draft is view only. Taking over editing stops the other editing session from saving.
          </p>
        )}
        {staleRecovery && (
          <p className="py-2 bg-amber-50 text-sm">
            A newer server save exists. The local recovery draft was not applied.
          </p>
        )}
        {recovery && (
          <div className="py-2 bg-amber-50 text-sm">
            A local recovery draft matches this saved version.{' '}
            <button
              className="underline font-semibold"
              type="button"
              disabled={!canWrite || busy !== null}
              onClick={() => {
                onEdit(() => recovery, false)
                setRecovery(null)
              }}
            >
              Restore locally
            </button>
          </div>
        )}
        {issues && (
          <section aria-label="Accessibility results" className="border rounded p-4 my-3 bg-white">
            <h2 className="font-semibold">Accessibility results</h2>
            {issues.length === 0 ? (
              <p>No issues found by the automated content checks.</p>
            ) : (
              <ul className="list-disc pl-5 space-y-2">
                {issues.map((issue, index) => (
                  <li key={index}>
                    <strong>
                      {issue.severity === 'error' ? 'Fix before exporting' : 'Review'}: {issue.location}
                    </strong>{' '}
                    — {issue.message} {issue.fix}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-sm mt-2">
              Automated checks do not assess the accuracy of image descriptions or every email client. Review your
              content and the rendered message before sending.
            </p>
          </section>
        )}
      </div>
      <div className="flex gap-2 p-4 lg:hidden" aria-label="Editor view">
        <button
          className={secondary}
          type="button"
          aria-pressed={mobileView === 'edit'}
          onClick={() => setMobileView('edit')}
        >
          Edit draft
        </button>
        <button
          className={secondary}
          type="button"
          aria-pressed={mobileView === 'preview'}
          onClick={() => setMobileView('preview')}
        >
          Preview
        </button>
      </div>
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 min-w-0">
        <div className={`min-w-0 ${mobileView === 'edit' ? '' : 'hidden lg:block'}`}>
          <EditorPanel
            state={state}
            updateState={onEdit}
            templateType={state.template}
            readOnly={!canWrite || busy !== null}
          />
        </div>
        <div className={`min-w-0 ${mobileView === 'preview' ? '' : 'hidden lg:block'}`}>
          <PreviewPanel html={html} loading={loading} onRefresh={() => void updatePreview(state)} />
        </div>
      </main>
      <ConfirmModal
        isOpen={leavePrompt}
        title="Leave with changes not saved?"
        message="The server has not saved all your changes. A recovery copy remains in this browser for your account. Stay here to retry, or leave without changing the saved draft."
        confirmLabel="Leave draft"
        cancelLabel="Keep editing"
        onConfirm={() => {
          setLeavePrompt(false)
          router.push('/newsletters')
        }}
        onCancel={() => setLeavePrompt(false)}
      />
    </div>
  )
}
