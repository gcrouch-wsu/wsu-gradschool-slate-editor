'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import EditorPanel from '@/components/EditorPanel'
import PreviewPanel from '@/components/PreviewPanel'
import ConfirmModal from '@/components/ConfirmModal'
import { useNewsletterState } from '@/app/hooks/useNewsletterState'
import { usePreview } from '@/app/hooks/usePreview'
import { beginLeaseRequest, clearTabLease, currentLeaseToken, rememberLease } from '@/lib/client/tab-lease'
import { finishNotice, SerializedSaver, type SaveResponse, type SaveStatus } from '@/lib/client/save-queue'
import type { NewsletterData, TemplateType } from '@/types/newsletter'

interface SharedNewsletterEditorProps {
  newsletterId: string
  userId: string
  initialContent: NewsletterData
  initialVersion: number
}

type Banner = 'idle' | 'lease_lost' | 'session_expired' | 'release_pending' | 'conflict' | 'view_only'

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export default function SharedNewsletterEditor({
  newsletterId,
  userId,
  initialContent,
  initialVersion,
}: SharedNewsletterEditorProps) {
  const [document, setDocument] = useState(initialContent)
  const [canWrite, setCanWrite] = useState(false)
  const [banner, setBanner] = useState<Banner>('view_only')
  const [status, setStatus] = useState<SaveStatus>('saved')
  const [templatePrompt, setTemplatePrompt] = useState<TemplateType | null>(null)
  const [recovery, setRecovery] = useState<NewsletterData | null>(null)
  const [staleRecovery, setStaleRecovery] = useState(false)
  const saverRef = useRef<SerializedSaver | null>(null)
  const versionRef = useRef(initialVersion)
  const { state, updateState, undo, redo, canUndo, canRedo, resetState } = useNewsletterState(document, false)
  const { html, loading, updatePreview } = usePreview()

  const backupKey = `wsu_newsletter_backup:${userId}:${newsletterId}`

  const sendSave = useCallback(
    async (request: { saveId: string; expectedVersion: number; snapshot: unknown }): Promise<SaveResponse> => {
      const token = currentLeaseToken(newsletterId)
      if (!token) return { ok: false, code: 'lease' }
      let response: Response | null = null
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          response = await postJson(`/api/newsletters/${newsletterId}/saves`, { ...request, token })
          break
        } catch {
          if (attempt === 1) return { ok: false, code: 'network' }
        }
      }
      if (!response) return { ok: false, code: 'network' }
      if (response.status === 401) return { ok: false, code: 'session' }
      if (response.status === 409) {
        const body = (await response.json().catch(() => ({}))) as { code?: string }
        if (body.code === 'lease') return { ok: false, code: 'lease' }
        if (body.code === 'fingerprint') return { ok: false, code: 'fingerprint' }
        return { ok: false, code: 'version' }
      }
      if (!response.ok) return { ok: false, code: 'network' }
      const body = (await response.json()) as { saveVersion: number; currentVersion: number }
      versionRef.current = body.saveVersion
      return { ok: true, saveVersion: body.saveVersion, currentVersion: body.currentVersion }
    },
    [newsletterId]
  )

  useEffect(() => {
    saverRef.current = new SerializedSaver(initialVersion, sendSave, () => crypto.randomUUID())
  }, [initialVersion, sendSave])

  useEffect(() => {
    updatePreview(state)
  }, [state, updatePreview])

  useEffect(() => {
    let stopped = false
    const existing = currentLeaseToken(newsletterId)
    if (existing) {
      queueMicrotask(() => {
        if (stopped) return
        setCanWrite(true)
        setBanner('idle')
      })
      return () => {
        stopped = true
      }
    }
    beginLeaseRequest(newsletterId, async () => {
      const response = await postJson(`/api/newsletters/${newsletterId}/lease`, { action: 'acquire' })
      if (!response.ok) throw new Error('lease-held')
      const body = (await response.json()) as { token: string; saveVersion: number }
      return { token: body.token, saveVersion: body.saveVersion }
    })
      .then((lease) => {
        if (stopped) return
        rememberLease(newsletterId, lease.token)
        setCanWrite(true)
        setBanner('idle')
      })
      .catch(() => {
        if (stopped) return
        setCanWrite(false)
        setBanner('view_only')
      })
    return () => {
      stopped = true
    }
  }, [newsletterId])

  useEffect(() => {
    if (!canWrite) return
    const renew = async () => {
      const token = currentLeaseToken(newsletterId)
      if (!token) return
      try {
        const response = await postJson(`/api/newsletters/${newsletterId}/lease`, { action: 'renew', token })
        if (response.status === 401) {
          setBanner('session_expired')
          setStatus('session_expired')
          setCanWrite(false)
          return
        }
        if (!response.ok) {
          setBanner('lease_lost')
          setStatus('lease_lost')
          setCanWrite(false)
          rememberLease(newsletterId, null)
        }
      } catch {
        setBanner('lease_lost')
        setStatus('lease_lost')
        setCanWrite(false)
      }
    }
    const renewMs = Number(process.env.NEXT_PUBLIC_LEASE_RENEW_MS || 60000)
    const timer = setInterval(renew, Number.isFinite(renewMs) && renewMs >= 1000 ? renewMs : 60000)
    return () => {
      clearInterval(timer)
    }
  }, [canWrite, newsletterId])

  useEffect(() => {
    const raw = localStorage.getItem(backupKey)
    queueMicrotask(() => {
      if (!raw) return
      try {
        const parsed = JSON.parse(raw) as { snapshot?: NewsletterData; baseVersion?: number }
        if (!parsed.snapshot || typeof parsed.baseVersion !== 'number') return
        if (parsed.baseVersion === initialVersion) setRecovery(parsed.snapshot)
        else setStaleRecovery(true)
      } catch {
        localStorage.removeItem(backupKey)
      }
    })
  }, [backupKey, initialVersion])

  const onEdit = useCallback(
    (updater: (prev: NewsletterData) => NewsletterData, pushHistory = true) => {
      if (!canWrite || banner === 'lease_lost' || banner === 'session_expired') return
      updateState((prev) => {
        const next = updater(prev)
        saverRef.current?.note(next)
        setStatus('unsaved')
        try {
          localStorage.setItem(
            backupKey,
            JSON.stringify({ snapshot: next, baseVersion: versionRef.current, savedAt: new Date().toISOString() })
          )
        } catch {
          // Recovery storage can be full; the server save is still attempted.
        }
        return next
      }, pushHistory)
    },
    [backupKey, banner, canWrite, updateState]
  )

  useEffect(() => {
    if (!canWrite) return
    const timer = setInterval(() => {
      if (saverRef.current?.status === 'unsaved') {
        void saverRef.current.flush().then(setStatus)
      }
    }, 1500)
    return () => clearInterval(timer)
  }, [canWrite])

  async function takeOver() {
    const response = await postJson(`/api/newsletters/${newsletterId}/lease`, { action: 'takeover' })
    if (!response.ok) return
    const body = (await response.json()) as { token: string; saveVersion: number; content: NewsletterData }
    clearTabLease(newsletterId)
    rememberLease(newsletterId, body.token)
    setDocument(body.content)
    resetState(body.content)
    versionRef.current = body.saveVersion
    saverRef.current = new SerializedSaver(body.saveVersion, sendSave, () => crypto.randomUUID())
    setCanWrite(true)
    setBanner('idle')
    setStatus('saved')
  }

  async function finish() {
    setCanWrite(false)
    const saver = saverRef.current
    const result = saver ? await saver.flush() : 'saved'
    setStatus(result)
    if (result !== 'saved') {
      setCanWrite(result === 'unsaved')
      setBanner(result === 'lease_lost' ? 'lease_lost' : result === 'session_expired' ? 'session_expired' : 'conflict')
      return
    }
    const token = currentLeaseToken(newsletterId)
    let release: { released: boolean } | null = null
    if (token) {
      try {
        const response = await postJson(`/api/newsletters/${newsletterId}/lease`, { action: 'release', token })
        if (response.ok) release = (await response.json()) as { released: boolean }
      } catch {
        release = null
      }
    }
    const notice = finishNotice(result, release)
    if (notice === 'saved') {
      rememberLease(newsletterId, null)
      localStorage.removeItem(backupKey)
      setBanner('idle')
      setStatus('saved')
      return
    }
    setBanner(notice === 'lease_lost' ? 'lease_lost' : 'release_pending')
    setStatus(notice === 'lease_lost' ? 'lease_lost' : 'saved')
  }

  async function retryRelease() {
    const token = currentLeaseToken(newsletterId)
    if (!token) return
    const response = await postJson(`/api/newsletters/${newsletterId}/lease`, { action: 'release', token })
    if (!response.ok) return
    const body = (await response.json()) as { released?: boolean }
    if (body.released) {
      rememberLease(newsletterId, null)
      setBanner('idle')
    }
  }

  async function changeTemplate(template: TemplateType) {
    const token = currentLeaseToken(newsletterId)
    if (!token) return
    const response = await postJson(`/api/newsletters/${newsletterId}/lifecycle`, {
      action: 'template',
      token,
      expectedVersion: versionRef.current,
      template,
    })
    if (!response.ok) return
    const body = (await response.json()) as { token: string; saveVersion: number; content: NewsletterData }
    rememberLease(newsletterId, body.token)
    setDocument(body.content)
    resetState(body.content)
    versionRef.current = body.saveVersion
    saverRef.current = new SerializedSaver(body.saveVersion, sendSave, () => crypto.randomUUID())
    setStatus('saved')
  }

  const statusLabel =
    banner === 'release_pending'
      ? 'Saved; editing lease release pending'
      : status === 'saving'
        ? 'Saving'
        : status === 'unsaved'
          ? 'Changes not saved'
          : status === 'session_expired' || banner === 'session_expired'
            ? 'Session expired'
            : status === 'lease_lost' || banner === 'lease_lost'
              ? 'Editing lease lost'
              : status === 'conflict' || banner === 'conflict'
                ? 'Changes not saved'
                : canWrite
                  ? 'Saved'
                  : 'View only'

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex justify-between items-center gap-3 px-4 py-3 bg-white border-b">
        <div>
            <Link className="text-sm text-wsu-crimson" href="/newsletters">
              All newsletters
            </Link>
          <h1 className="text-lg font-semibold">{state.masthead.title || 'Newsletter'}</h1>
        </div>
        <div className="flex items-center gap-2">
          <span data-testid="save-status">{statusLabel}</span>
          <button type="button" onClick={undo} disabled={!canUndo || !canWrite}>Undo</button>
          <button type="button" onClick={redo} disabled={!canRedo || !canWrite}>Redo</button>
          {!canWrite && (
            <button type="button" onClick={() => void takeOver()}>
              Take over editing
            </button>
          )}
          {canWrite && (
            <button type="button" onClick={() => void finish()}>
              Save and finish editing
            </button>
          )}
          {banner === 'release_pending' && (
            <button type="button" onClick={() => void retryRelease()}>
              Retry lease release
            </button>
          )}
        </div>
      </header>
      {staleRecovery && (
        <div className="bg-amber-50 px-4 py-2 text-sm">
          A newer server save exists. The local recovery draft was not applied.
        </div>
      )}
      {recovery && (
        <div className="bg-amber-50 px-4 py-2 text-sm">
          A local recovery draft matches this saved version.
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => {
              setDocument(recovery)
              resetState(recovery)
              onEdit(() => recovery, false)
              setRecovery(null)
            }}
          >
            Restore locally
          </button>
        </div>
      )}
      <main className="flex-1 grid grid-cols-2">
        <EditorPanel
          state={state}
          updateState={onEdit}
          templateType={state.template}
          readOnly={!canWrite}
          onTemplateChange={(template) => setTemplatePrompt(template)}
        />
        <PreviewPanel html={html} loading={loading} onRefresh={() => updatePreview(state)} />
      </main>
      <ConfirmModal
        isOpen={templatePrompt !== null}
        title="Switch Template"
        message="This replaces the newsletter with that template's defaults. The current saved document stays in history."
        confirmLabel="Switch"
        cancelLabel="Cancel"
        variant="warning"
        onConfirm={() => {
          if (templatePrompt) void changeTemplate(templatePrompt)
          setTemplatePrompt(null)
        }}
        onCancel={() => setTemplatePrompt(null)}
      />
    </div>
  )
}
