'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import EditorPanel from '@/components/EditorPanel'
import { previewTargetOf } from '@/lib/client/preview-target'
import PreviewPanel from '@/components/PreviewPanel'
import AiAssistDialog from '@/components/AiAssistDialog'
import ConfirmModal from '@/components/ConfirmModal'
import VersionHistory from '@/components/VersionHistory'
import { useNewsletterState } from '@/app/hooks/useNewsletterState'
import { usePreview } from '@/app/hooks/usePreview'
import type { AiAction } from '@/lib/ai/instructions'
import {
  applyFieldChange,
  proposalIsCurrent,
  sectionIndexOf,
  targetForCard,
  type AiTarget,
  type ProposalBase,
  type ReviewFinding,
  type TextSuggestion,
} from '@/lib/ai/proposals'
import { canonicalJson } from '@/lib/canonical-json'
import { baselineAfterSave, differsFromSent } from '@/lib/sent-baseline'
import { beginLeaseRequest, clearTabLease, currentLeaseToken, rememberLease } from '@/lib/client/tab-lease'
import { SerializedSaver, type SaveResponse, type SaveStatus } from '@/lib/client/save-queue'
import { errorMessage, jsonBody, RequestError, requestJson } from '@/lib/client/request'
import { storyForFinding, storyForIssue, type StoryLocation } from '@/lib/client/locate-story'
import type { NewsletterData, NewsletterProgress, ValidationIssue, ValidationResult } from '@/types/newsletter'

interface Props {
  newsletterId: string
  userId: string
  initialContent: NewsletterData
  initialVersion: number
  initialProgress: NewsletterProgress
  initialChangedSinceSent: boolean
  initialSentMarkId: string | null
  initialSentCanonical?: string | null
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
  sentCanonical?: string | null
  summary?: {
    progress: NewsletterProgress
    changedSinceSent: boolean
    sentMarkId: string | null
  }
}
const button =
  'inline-flex min-h-11 items-center justify-center rounded-md border px-3 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wsu-crimson disabled:opacity-50 disabled:cursor-not-allowed'
const secondary = `${button} bg-white border-wsu-crimson text-wsu-crimson hover:bg-wsu-bg-light`
const primary = `${button} bg-wsu-crimson border-wsu-crimson text-white hover:bg-wsu-crimson-dark`

const progressLabels: Record<NewsletterProgress, string> = {
  draft: 'Draft',
  ready: 'Ready for Slate',
  sent: 'Sent via Slate',
}

export default function SharedNewsletterEditor({
  newsletterId,
  userId,
  initialContent,
  initialVersion,
  initialProgress,
  initialChangedSinceSent,
  initialSentMarkId,
  initialSentCanonical = null,
}: Props) {
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
  const [progress, setProgress] = useState<NewsletterProgress>(initialProgress)
  const [changedSinceSent, setChangedSinceSent] = useState(initialChangedSinceSent)
  const [hasSentRecord, setHasSentRecord] = useState(Boolean(initialSentMarkId))
  const pendingProgress = useRef<{
    progress: NewsletterProgress
    token: string
    expectedVersion: number
  } | null>(null)
  const [progressPending, setProgressPending] = useState(false)
  const [sentPrompt, setSentPrompt] = useState(false)
  const sentBaseline = useRef<string | null>(
    initialSentCanonical ?? (initialChangedSinceSent ? null : canonicalJson(initialContent)),
  )
  const [aiOpen, setAiOpen] = useState(false)
  const [aiTitle, setAiTitle] = useState('AI assistance')
  const [aiActions, setAiActions] = useState<{ id: AiAction; label: string }[]>([])
  const [aiAction, setAiAction] = useState<AiAction>('edit')
  const [aiInstruction, setAiInstruction] = useState('')
  const [aiHouseStyle, setAiHouseStyle] = useState(false)
  const [aiShowHouse, setAiShowHouse] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState('')
  const [aiGuide, setAiGuide] = useState('')
  const [aiModel, setAiModel] = useState('')
  const [aiSuggestions, setAiSuggestions] = useState<TextSuggestion[]>([])
  const [aiFindings, setAiFindings] = useState<ReviewFinding[]>([])
  const [aiOriginal, setAiOriginal] = useState('')
  const aiRequest = useRef<AbortController | null>(null)
  const aiTarget = useRef<AiTarget | null>(null)
  const aiBase = useRef<ProposalBase | null>(null)
  const [recovery, setRecovery] = useState<NewsletterData | null>(null)
  const [staleRecovery, setStaleRecovery] = useState(false)
  const [issues, setIssues] = useState<ValidationIssue[] | null>(null)
  const [issuesStale, setIssuesStale] = useState(false)
  const [reviewChecklist, setReviewChecklist] = useState<{ findings: ReviewFinding[]; applied: number[] } | null>(
    null,
  )
  const [storyRequest, setStoryRequest] = useState<(StoryLocation & { nonce: number }) | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [holder, setHolder] = useState<{ name: string; self: boolean } | null>(null)
  const lastTyping = useRef<{ target: Element | null; at: number }>({ target: null, at: 0 })
  const [mobileView, setMobileView] = useState<'edit' | 'preview'>('edit')
  const [previewTarget, setPreviewTarget] = useState<string | null>(null)
  const actionsRef = useRef<HTMLDivElement>(null)
  const [actionsHeight, setActionsHeight] = useState(0)
  // The preview pins below the sticky draft actions, whose height changes as they wrap.
  useEffect(() => {
    const bar = actionsRef.current
    if (!bar) return
    const observer = new ResizeObserver(() => setActionsHeight(bar.offsetHeight))
    observer.observe(bar)
    return () => observer.disconnect()
  }, [])
  const saverRef = useRef<SerializedSaver | null>(null)
  const versionRef = useRef(initialVersion)
  const lastNoted = useRef(JSON.stringify(initialContent))
  const mounted = useRef(false)
  const { html, loading, error: previewError, updatePreview, debouncedUpdatePreview } = usePreview()
  const previewed = useRef(false)
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
    // Render the first preview at once; later edits wait for a pause in typing.
    if (previewed.current) debouncedUpdatePreview(state)
    else void updatePreview(state)
    previewed.current = true
  }, [state, updatePreview, debouncedUpdatePreview])
  useEffect(() => {
    if (!hasSentRecord || sentBaseline.current === null) return
    setChangedSinceSent(canonicalJson(state) !== sentBaseline.current)
  }, [hasSentRecord, state])
  useEffect(() => () => aiRequest.current?.abort(), [])

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
        if (typeof body.changedSinceSent === 'boolean') {
          sentBaseline.current = baselineAfterSave(
            sentBaseline.current,
            canonicalJson(request.snapshot),
            body.changedSinceSent,
          )
          setChangedSinceSent(
            differsFromSent(sentBaseline.current, canonicalJson(stateRef.current), body.changedSinceSent),
          )
        }
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
      setHolder(null)
      setStatus('saved')
      if (lease.summary) {
        setProgress(lease.summary.progress)
        setHasSentRecord(Boolean(lease.summary.sentMarkId))
        sentBaseline.current = lease.sentCanonical
          ? lease.sentCanonical
          : baselineAfterSave(sentBaseline.current, canonicalJson(lease.content), lease.summary.changedSinceSent)
        setChangedSinceSent(
          differsFromSent(sentBaseline.current, canonicalJson(lease.content), lease.summary.changedSinceSent),
        )
      }
      pendingProgress.current = null
      setProgressPending(false)
      setError('')
      readRecovery(lease.saveVersion)
    },
    [newsletterId, sendSave, onSaveStatus, resetState, readRecovery],
  )

  const loadHolder = useCallback(async () => {
    try {
      const body = await requestJson<{
        summary: { leaseHeld: boolean; leaseHolderName: string | null; leaseHolderUserId: string | null }
      }>(`/api/newsletters/${newsletterId}`)
      const { leaseHeld, leaseHolderName, leaseHolderUserId } = body.summary
      if (mounted.current)
        setHolder(leaseHeld && leaseHolderName ? { name: leaseHolderName, self: leaseHolderUserId === userId } : null)
    } catch {
      /* The banner falls back to the general view-only explanation. */
    }
  }, [newsletterId, userId])
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
        const expired = failure instanceof RequestError && failure.status === 401
        setBanner(expired ? 'session_expired' : 'view_only')
        setError(errorMessage(failure))
        if (!expired) void loadHolder()
      })
    return () => {
      stopped = true
    }
  }, [newsletterId, adopt, loadHolder])

  const noteSnapshot = useCallback(
    (snapshot: NewsletterData) => {
      const serialized = JSON.stringify(snapshot)
      if (serialized === lastNoted.current) return
      lastNoted.current = serialized
      saverRef.current?.note(snapshot)
      backup(snapshot, versionRef.current)
      setNotice('')
      setIssuesStale(true)
    },
    [backup],
  )
  // All history changes (including Undo/Redo) enter the same save queue.
  useEffect(() => {
    if (canWrite) noteSnapshot(state)
  }, [state, canWrite, noteSnapshot])
  const onEdit = useCallback(
    (updater: (prev: NewsletterData) => NewsletterData, pushHistory = true) => {
      if (!canWrite || operationRef.current || pendingProgress.current) return
      const next = updater(stateRef.current)
      stateRef.current = next
      // Continuous typing in one field becomes one Undo step, as in a document editor.
      const active = window.document.activeElement
      const typing =
        active instanceof HTMLElement &&
        (active.isContentEditable ||
          active instanceof HTMLTextAreaElement ||
          (active instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit'].includes(active.type)))
      const now = Date.now()
      const coalesce =
        pushHistory && typing && lastTyping.current.target === active && now - lastTyping.current.at < 1000
      lastTyping.current = typing ? { target: active, at: now } : { target: null, at: 0 }
      updateState(() => next, pushHistory && !coalesce)
      noteSnapshot(next)
    },
    [canWrite, updateState, noteSnapshot],
  )
  const undoEdit = useCallback(() => {
    lastTyping.current = { target: null, at: 0 }
    undo()
  }, [undo])
  const redoEdit = useCallback(() => {
    lastTyping.current = { target: null, at: 0 }
    redo()
  }, [redo])
  const openStory = useCallback((location: StoryLocation) => {
    setMobileView('edit')
    setStoryRequest({ ...location, nonce: Date.now() })
  }, [])

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
        const expired = failure instanceof RequestError && failure.status === 401
        setBanner(expired ? 'session_expired' : 'lease_lost')
        setError(errorMessage(failure))
        rememberLease(newsletterId, null)
        if (!expired) void loadHolder()
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
  }, [canWrite, newsletterId, loadHolder])

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
    if (pendingProgress.current) {
      setError('Retry the pending progress update before finishing or leaving this draft.')
      return
    }
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
      setIssuesStale(false)
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
        if (body?.issues) {
          setIssues(body.issues)
          setIssuesStale(false)
        }
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
  const closeAi = useCallback(() => {
    aiRequest.current?.abort()
    aiRequest.current = null
    setAiOpen(false)
    setAiBusy(false)
    setAiError('')
    setAiSuggestions([])
    setAiFindings([])
    setAiInstruction('')
    setAiGuide('')
    setAiModel('')
    setAiOriginal('')
    aiTarget.current = null
    aiBase.current = null
  }, [])
  function beginAi(target: AiTarget, title: string, actions: { id: AiAction; label: string }[], showHouse: boolean) {
    closeAi()
    aiTarget.current = target
    setAiTitle(title)
    setAiActions(actions)
    setAiAction(actions[0]?.id ?? 'edit')
    setAiShowHouse(showHouse)
    setAiHouseStyle(false)
    setAiOpen(true)
  }
  function openCardAssist(sectionIndex: number, cardIndex: number) {
    const target = targetForCard(stateRef.current, sectionIndex, cardIndex, 'body_html')
    if (!target) return
    const card = stateRef.current.sections[sectionIndex]?.cards?.[cardIndex]
    beginAi(
      target,
      `AI assistance for ${target.label}`,
      [
        { id: 'edit', label: 'Edit for clarity' },
        { id: 'shorten', label: 'Shorten' },
        ...(card && 'title' in card ? [{ id: 'headlines' as const, label: 'Suggest headlines' }] : []),
      ],
      card?.content_origin !== 'graduate_school',
    )
  }
  function openPreheaderAssist() {
    beginAi(
      {
        kind: 'preheader',
        sectionKey: '',
        cardIndex: null,
        field: 'preheader',
        originalText: stateRef.current.masthead.preheader || '',
        label: 'preheader',
      },
      'Preheader suggestions',
      [{ id: 'preheader', label: 'Suggest preheader' }],
      false,
    )
  }
  function openReview() {
    beginAi(
      {
        kind: 'review',
        sectionKey: '',
        cardIndex: null,
        field: 'preheader',
        originalText: stateRef.current.masthead.preheader || '',
        label: 'newsletter',
      },
      'Newsletter review',
      [{ id: 'review', label: 'Review newsletter' }],
      false,
    )
  }
  async function generateSuggestion() {
    const selected = aiTarget.current
    if (!selected || aiRequest.current || progressPending || operationRef.current) return
    const controller = new AbortController()
    aiRequest.current = controller
    setAiBusy(true)
    setAiError('')
    setAiSuggestions([])
    setAiFindings([])
    setAiGuide('')
    aiBase.current = null
    try {
      if (!(await flushChanges())) {
        setAiError('Save the draft before preparing a suggestion.')
        return
      }
      if (controller.signal.aborted) return
      const token = currentLeaseToken(newsletterId)
      if (!token || !canWrite) {
        setAiError('Editing authority is required before preparing a suggestion.')
        return
      }
      let target =
        selected.kind === 'card'
          ? selected
          : {
              ...selected,
              originalText: stateRef.current.masthead.preheader || '',
            }
      if (selected.kind === 'card' && (aiAction === 'edit' || aiAction === 'shorten' || aiAction === 'headlines')) {
        const sectionIndex = sectionIndexOf(stateRef.current, selected)
        const refreshed = targetForCard(
          stateRef.current,
          sectionIndex,
          selected.cardIndex ?? 0,
          aiAction === 'headlines' ? 'title' : 'body_html',
        )
        if (!refreshed) {
          setAiError('The selected story is no longer in the same place. Generate it again.')
          return
        }
        target = refreshed
        aiTarget.current = refreshed
      }
      const capturedVersion = versionRef.current
      const capturedDocument = structuredClone(stateRef.current)
      setAiOriginal(target.originalText)
      const result = await requestJson<{
        guideVersion: string
        model: string
        suggestion: TextSuggestion | TextSuggestion[] | ReviewFinding[]
        base: ProposalBase
      }>(`/api/newsletters/${newsletterId}/ai`, {
        ...jsonBody({
          action: aiAction,
          token,
          expectedVersion: capturedVersion,
          instruction: aiInstruction,
          applyHouseStyle: aiHouseStyle,
          target,
        }),
        signal: controller.signal,
      })
      if (aiRequest.current !== controller || controller.signal.aborted) return
      if (result.base.newsletterId !== newsletterId || result.base.saveVersion !== capturedVersion) {
        setAiError('The server returned a suggestion for a different saved version. Generate it again.')
        return
      }
      if (
        capturedVersion !== versionRef.current ||
        canonicalJson(capturedDocument) !== canonicalJson(stateRef.current)
      ) {
        setAiError('This suggestion is out of date because the draft changed. Generate it again.')
        return
      }
      aiBase.current = {
        ...result.base,
        document: capturedDocument,
        saveVersion: capturedVersion,
        target,
      }
      setAiGuide(result.guideVersion)
      setAiModel(result.model)
      if (aiAction === 'review') {
        setAiFindings(result.suggestion as ReviewFinding[])
        setReviewChecklist({ findings: result.suggestion as ReviewFinding[], applied: [] })
        setAiSuggestions([])
      } else {
        const suggestion = result.suggestion as TextSuggestion | TextSuggestion[]
        setAiSuggestions(Array.isArray(suggestion) ? suggestion : [suggestion])
        setAiFindings([])
      }
    } catch (failure) {
      if (!controller.signal.aborted && aiRequest.current === controller) setAiError(errorMessage(failure))
    } finally {
      if (aiRequest.current === controller) {
        aiRequest.current = null
        setAiBusy(false)
      }
    }
  }
  async function applySuggestion(suggestion: TextSuggestion) {
    const base = aiBase.current
    if (!base) return
    const check = proposalIsCurrent({
      base,
      newsletterId,
      saveVersion: versionRef.current,
      canWrite,
      document: stateRef.current,
    })
    if (!check.ok) {
      setAiError(check.message)
      return
    }
    if (!(await validateAiApplication(base))) return
    onEdit((prev) => applyFieldChange(prev, base.target, suggestion.proposed))
    closeAi()
  }
  async function applyFinding(finding: ReviewFinding, index: number) {
    const base = aiBase.current
    if (!base || !finding.proposed) return
    const target: AiTarget = {
      kind: finding.field === 'preheader' ? 'preheader' : 'card',
      sectionKey: finding.sectionKey,
      sectionIndex: finding.sectionIndex,
      cardIndex: finding.cardIndex,
      field: finding.field,
      originalText: finding.originalText,
      label: finding.cardTitle,
    }
    const check = proposalIsCurrent({
      base: { ...base, target },
      newsletterId,
      saveVersion: versionRef.current,
      canWrite,
      document: stateRef.current,
      replacementOriginal: finding.originalText,
    })
    if (!check.ok) {
      setAiError(check.message)
      return
    }
    if (!(await validateAiApplication({ ...base, target }))) return
    onEdit((prev) => applyFieldChange(prev, target, finding.proposed || ''))
    setReviewChecklist((current) => (current ? { ...current, applied: [...current.applied, index] } : current))
    closeAi()
    setNotice('Suggestion applied. The review checklist stays below; generate the review again to apply other wording.')
  }
  async function validateAiApplication(base: ProposalBase): Promise<boolean> {
    if (aiRequest.current || operationRef.current || pendingProgress.current) return false
    const controller = new AbortController()
    aiRequest.current = controller
    setAiBusy(true)
    try {
      const token = currentLeaseToken(newsletterId)
      if (!token) throw new Error('Editing authority changed. Generate the suggestion again after taking over.')
      const lease = await requestJson<Lease>(`/api/newsletters/${newsletterId}/lease`, {
        ...jsonBody({ action: 'resume', token }),
        signal: controller.signal,
      })
      if (controller.signal.aborted || aiRequest.current !== controller) return false
      if (operationRef.current || pendingProgress.current)
        throw new Error('The draft changed while checking editing authority. Generate the suggestion again.')
      const check = proposalIsCurrent({
        base,
        newsletterId,
        saveVersion: lease.saveVersion,
        canWrite: true,
        document: stateRef.current,
      })
      if (!check.ok) throw new Error(check.message)
      return true
    } catch (failure) {
      if (!controller.signal.aborted && aiRequest.current === controller) {
        setAiError(errorMessage(failure))
        if (failure instanceof RequestError && (failure.status === 409 || failure.status === 401)) {
          setCanWrite(false)
          setBanner(failure.status === 401 ? 'session_expired' : 'lease_lost')
        }
      }
      return false
    } finally {
      if (aiRequest.current === controller) {
        aiRequest.current = null
        setAiBusy(false)
      }
    }
  }
  async function changeProgress(next: NewsletterProgress) {
    await operation(next === 'sent' ? 'Recording sent version…' : 'Updating progress…', async () => {
      if (!pendingProgress.current) {
        if (!(await flushChanges())) return
        const token = currentLeaseToken(newsletterId)
        if (!token) throw new Error('Editing authority is required.')
        pendingProgress.current = {
          progress: next,
          token,
          expectedVersion: versionRef.current,
        }
        setProgressPending(true)
      }
      if (pendingProgress.current.progress !== next) throw new Error('Retry the pending progress update first.')
      const result = await requestJson<{
        saveVersion: number
        currentVersion: number
        progress: NewsletterProgress
        summary: NonNullable<Lease['summary']>
      }>(`/api/newsletters/${newsletterId}/progress`, jsonBody(pendingProgress.current)).catch((failure) => {
        if (failure instanceof RequestError && (failure.status === 409 || failure.status === 401)) {
          pendingProgress.current = null
          setProgressPending(false)
          setCanWrite(false)
          setBanner(failure.status === 401 ? 'session_expired' : 'conflict')
        }
        throw failure
      })
      if (result.currentVersion !== result.saveVersion) {
        setCanWrite(false)
        setBanner('conflict')
        pendingProgress.current = null
        setProgressPending(false)
        throw new Error('The draft changed after the progress update. Reopen it before editing.')
      }
      versionRef.current = result.saveVersion
      if (saverRef.current) saverRef.current.version = result.saveVersion
      setProgress(result.progress)
      setHasSentRecord(Boolean(result.summary.sentMarkId))
      sentBaseline.current = baselineAfterSave(
        sentBaseline.current,
        canonicalJson(stateRef.current),
        result.summary.changedSinceSent,
      )
      setChangedSinceSent(
        differsFromSent(sentBaseline.current, canonicalJson(stateRef.current), result.summary.changedSinceSent),
      )
      pendingProgress.current = null
      setProgressPending(false)
      setNotice(
        result.progress === 'sent'
          ? 'The current saved version was recorded as sent via Slate. Exporting does not send the email.'
          : 'Progress updated.',
      )
    })
  }
  const statusLabel =
    banner === 'connecting'
      ? 'Checking editing access…'
      : banner === 'deleted'
        ? 'This draft was archived.'
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

  const errorCount = issues?.filter((issue) => issue.severity === 'error').length ?? 0
  const warningCount = (issues?.length ?? 0) - errorCount
  const viewOnlyMessage = holder?.self
    ? 'You have this draft open in another tab, or in a tab that closed without finishing. Take over editing to continue here; the other tab will stop saving.'
    : holder
      ? `${holder.name} is editing this draft. Taking over editing stops their session from saving; their unsaved changes stay in their browser.`
      : 'This draft is view only. Taking over editing stops the other editing session from saving.'

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex flex-col gap-2 px-4 py-3 bg-white border-b">
        <Link
          className="inline-flex min-h-11 items-center self-start font-semibold text-wsu-crimson underline"
          href="/newsletters"
          onNavigate={(event) => {
            event.preventDefault()
            leave()
          }}
        >
          All newsletters
        </Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold break-words">
            {state.issue?.title || state.masthead.title || 'Newsletter'}
          </h1>
          <span className="rounded-full border border-wsu-crimson px-3 py-0.5 text-sm font-semibold text-wsu-crimson">
            {progressLabels[progress]}
          </span>
          {changedSinceSent && (
            <span className="rounded-full border border-amber-700 bg-amber-50 px-3 py-0.5 text-sm font-semibold text-amber-900">
              Changed since sent
            </span>
          )}
        </div>
        <p className="text-sm text-wsu-text-muted">
          {state.issue?.title ? state.masthead.title : ''}
          {hasSentRecord && (
            <>
              {state.issue?.title ? ' · ' : ''}
              <Link className="font-semibold text-wsu-crimson underline" href={`/newsletters/${newsletterId}/sent`}>
                Open sent version
              </Link>
            </>
          )}
        </p>
        <details>
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-wsu-crimson">
            Change progress
          </summary>
          <p className="mt-1 text-sm text-wsu-text-muted">
            Ready for Slate is a review choice, not a completed check. Exporting or copying HTML does not mark the
            newsletter as sent.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              className={secondary}
              type="button"
              disabled={!canWrite || busy !== null || progress === 'ready'}
              onClick={() => void changeProgress('ready')}
            >
              Mark ready for Slate
            </button>
            <button
              className={secondary}
              type="button"
              disabled={!canWrite || busy !== null || progress === 'draft'}
              onClick={() => void changeProgress('draft')}
            >
              Return to draft
            </button>
            <button
              className={secondary}
              type="button"
              disabled={!canWrite || busy !== null}
              onClick={() => setSentPrompt(true)}
            >
              Mark as sent via Slate
            </button>
          </div>
        </details>
      </header>
      <div
        ref={actionsRef}
        aria-label="Draft actions"
        className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-wsu-border-light bg-white px-4 py-2 shadow-sm"
      >
        <span role="status" aria-live="polite" data-testid="save-status" className="mr-auto text-sm font-medium">
          {statusLabel}
        </span>
        <button
          className={secondary}
          type="button"
          onClick={undoEdit}
          disabled={!canUndo || !canWrite || busy !== null || progressPending}
        >
          Undo
        </button>
        <button
          className={secondary}
          type="button"
          onClick={redoEdit}
          disabled={!canRedo || !canWrite || busy !== null || progressPending}
        >
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
      </div>
      <section aria-labelledby="review-export-heading" className="border-b border-wsu-border-light bg-white px-4 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="review-export-heading" className="mr-2 text-sm font-semibold">
            Review and export
          </h2>
          <button
            className={secondary}
            type="button"
            disabled={busy !== null || banner === 'connecting' || banner === 'deleted'}
            onClick={() => void checkAccessibility()}
          >
            Check accessibility
          </button>
          <button
            className={secondary}
            type="button"
            disabled={banner === 'connecting' || banner === 'deleted'}
            onClick={() => setHistoryOpen(true)}
          >
            Version history
          </button>
          <button
            className={secondary}
            type="button"
            disabled={busy !== null || banner === 'connecting' || banner === 'deleted' || banner === 'session_expired'}
            onClick={() => void exportHtml()}
          >
            Export HTML
          </button>
        </div>
        <p className="mt-1 text-xs text-wsu-text-muted">
          Check accessibility, review the preview at both widths, mark the draft ready, export the HTML, test it in
          Slate, then mark it as sent.
        </p>
      </section>
      <div className="px-4 space-y-2">
        {progressPending && !busy && (
          <div role="alert" className="py-2">
            Progress confirmation is pending. Retry before making further edits.
            <button
              type="button"
              className={secondary}
              onClick={() => {
                if (pendingProgress.current) void changeProgress(pendingProgress.current.progress)
              }}
            >
              Retry progress update
            </button>
          </div>
        )}
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
        {(banner === 'view_only' || (banner === 'lease_lost' && holder)) && (
          <p className="py-2 text-sm" data-testid="holder-message">
            {viewOnlyMessage}
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
                onEdit(() => recovery)
                setRecovery(null)
              }}
            >
              Restore locally
            </button>
          </div>
        )}
        {issues && (
          <section aria-labelledby="accessibility-results" className="border rounded p-4 my-3 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="accessibility-results" className="font-semibold">
                Accessibility results
              </h2>
              <div className="flex flex-wrap gap-2">
                <button
                  className={secondary}
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void checkAccessibility()}
                >
                  Check again
                </button>
                <button className={secondary} type="button" onClick={() => setIssues(null)}>
                  Close results
                </button>
              </div>
            </div>
            {issuesStale && (
              <p className="mt-2 text-sm font-semibold text-amber-900">
                The draft changed after this check. These results may be out of date; check again to update them.
              </p>
            )}
            {issues.length === 0 ? (
              <p className="mt-2">No issues found by the automated content checks.</p>
            ) : (
              <>
                <p className="mt-2 text-sm">
                  {errorCount} to fix before exporting; {warningCount} to review.
                </p>
                <ul className="mt-2 list-disc pl-5 space-y-2">
                  {issues.map((issue, index) => {
                    const story = storyForIssue(state, issue.location)
                    return (
                      <li key={index}>
                        <strong>
                          {issue.severity === 'error' ? 'Fix before exporting' : 'Review'}: {issue.location}
                        </strong>{' '}
                        — {issue.message} {issue.fix}
                        {story && (
                          <>
                            {' '}
                            <button
                              type="button"
                              className="inline-flex min-h-11 items-center px-2 font-semibold text-wsu-crimson underline"
                              onClick={() => openStory(story)}
                            >
                              Open story
                            </button>
                          </>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
            <p className="text-sm mt-2">
              Automated checks do not assess the accuracy of image descriptions or every email client. Review your
              content and the rendered message before sending.
            </p>
          </section>
        )}
        {reviewChecklist && !aiOpen && reviewChecklist.findings.length > 0 && (
          <section aria-labelledby="review-checklist" className="border rounded p-4 my-3 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="review-checklist" className="font-semibold">
                AI review checklist
              </h2>
              <button className={secondary} type="button" onClick={() => setReviewChecklist(null)}>
                Close checklist
              </button>
            </div>
            <p className="mt-1 text-sm text-wsu-text-muted">
              Findings from the last newsletter review. Suggested wording can be applied only from a current review;
              after any edit, choose Review newsletter again.
            </p>
            <ul className="mt-2 space-y-2">
              {reviewChecklist.findings.map((finding, index) => {
                const story = storyForFinding(state, finding)
                return (
                  <li key={index} className="rounded-md border border-wsu-border-light p-3 text-sm">
                    <p className="font-semibold">
                      {finding.sectionTitle} / {finding.cardTitle} / {finding.field}
                      {reviewChecklist.applied.includes(index) ? ' · Applied' : ''}
                    </p>
                    <p>{finding.summary}</p>
                    {story && (
                      <button
                        type="button"
                        className="mt-1 inline-flex min-h-11 items-center font-semibold text-wsu-crimson underline"
                        onClick={() => openStory(story)}
                      >
                        Open story
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </div>
      <div
        className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-wsu-border-light bg-white p-2 shadow-lg lg:hidden"
        aria-label="Editor view"
      >
        <button
          className={mobileView === 'edit' ? primary : secondary}
          type="button"
          aria-pressed={mobileView === 'edit'}
          onClick={() => setMobileView('edit')}
        >
          Edit draft
        </button>
        <button
          className={mobileView === 'preview' ? primary : secondary}
          type="button"
          aria-pressed={mobileView === 'preview'}
          onClick={() => setMobileView('preview')}
        >
          Preview
        </button>
      </div>
      <main
        className="flex-1 grid grid-cols-1 pb-20 lg:pb-0 lg:grid-cols-2 min-w-0"
        style={{ '--draft-actions': `${actionsHeight}px` } as CSSProperties}
      >
        <div
          className={`min-w-0 ${mobileView === 'edit' ? '' : 'hidden lg:block'}`}
          onFocus={(event) => setPreviewTarget(previewTargetOf(event) ?? previewTarget)}
          onPointerDown={(event) => setPreviewTarget(previewTargetOf(event) ?? previewTarget)}
        >
          <EditorPanel
            state={state}
            updateState={onEdit}
            templateType={state.template}
            readOnly={!canWrite || busy !== null || progressPending}
            onAssist={openCardAssist}
            onSuggestPreheader={openPreheaderAssist}
            onReview={openReview}
            issueFirst
            storyRequest={storyRequest}
          />
        </div>
        <div
          className={`min-w-0 lg:sticky lg:top-[var(--draft-actions)] lg:h-[calc(100vh-var(--draft-actions))] lg:self-start ${
            mobileView === 'preview' ? '' : 'hidden lg:block'
          }`}
        >
          <PreviewPanel
            html={html}
            loading={loading}
            error={previewError}
            target={previewTarget}
            onRefresh={() => void updatePreview(state)}
          />
        </div>
      </main>
      {historyOpen && (
        <VersionHistory
          newsletterId={newsletterId}
          canRestore={canWrite && busy === null && !progressPending}
          onClose={() => setHistoryOpen(false)}
          onRestore={(content) => {
            onEdit(() => content)
            setHistoryOpen(false)
            setNotice('The selected version was restored into the draft. Use Undo to return to the previous content.')
          }}
        />
      )}
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
      <ConfirmModal
        isOpen={sentPrompt}
        title="Mark as sent via Slate?"
        message="This records the current saved version, who marked it, and when. It does not send email or contact Slate. Later edits stay in the draft and are labeled Changed since sent."
        confirmLabel="Mark as sent via Slate"
        cancelLabel="Keep current progress"
        onConfirm={() => {
          setSentPrompt(false)
          void changeProgress('sent')
        }}
        onCancel={() => setSentPrompt(false)}
      />
      <AiAssistDialog
        open={aiOpen}
        title={aiTitle}
        actions={aiActions}
        action={aiAction}
        instruction={aiInstruction}
        applyHouseStyle={aiHouseStyle}
        showHouseStyle={aiShowHouse}
        busy={aiBusy}
        error={aiError}
        guideVersion={aiGuide}
        model={aiModel}
        suggestions={aiSuggestions}
        originalText={aiOriginal}
        findings={aiFindings}
        onAction={(action) => {
          setAiAction(action)
          setAiSuggestions([])
          setAiFindings([])
          setAiError('')
          setAiGuide('')
          aiBase.current = null
        }}
        onInstruction={(value) => {
          setAiInstruction(value)
          setAiSuggestions([])
          setAiFindings([])
          setAiGuide('')
          aiBase.current = null
        }}
        onHouseStyle={(value) => {
          setAiHouseStyle(value)
          setAiSuggestions([])
          setAiFindings([])
          setAiGuide('')
          aiBase.current = null
        }}
        onGenerate={() => void generateSuggestion()}
        onApply={applySuggestion}
        onApplyFinding={applyFinding}
        onDiscard={closeAi}
      />
    </div>
  )
}
