import { beforeEach, expect, test, vi } from 'vitest'
import { beginLeaseRequest, clearTabLease, currentLeaseToken } from '@/lib/client/tab-lease'
import { finishNotice, SerializedSaver, type SaveRequest, type SaveResponse } from '@/lib/client/save-queue'

beforeEach(() => {
  clearTabLease('doc')
})

test('overlapping acquire calls share one lease request', async () => {
  let calls = 0
  let resolveRun: (value: { token: string; saveVersion: number }) => void = () => undefined
  const pending = new Promise<{ token: string; saveVersion: number }>((resolve) => {
    resolveRun = resolve
  })
  const first = beginLeaseRequest('doc', () => {
    calls += 1
    return pending
  })
  const second = beginLeaseRequest('doc', async () => {
    calls += 1
    return { token: 'other', saveVersion: 9 }
  })
  expect(calls).toBe(1)
  resolveRun({ token: 'tab-token', saveVersion: 1 })
  await expect(first).resolves.toEqual({ token: 'tab-token', saveVersion: 1 })
  await expect(second).resolves.toEqual({ token: 'tab-token', saveVersion: 1 })
  expect(currentLeaseToken('doc')).toBe('tab-token')
})

test('clearing a tab lease is explicit', () => {
  beginLeaseRequest('doc', async () => ({ token: 'kept', saveVersion: 1 }))
  expect(currentLeaseToken('doc')).toBeNull()
  clearTabLease('doc')
  expect(currentLeaseToken('doc')).toBeNull()
})

test('keystrokes during an in-flight save become the next snapshot', async () => {
  const sent: SaveRequest[] = []
  const responses: Array<(value: SaveResponse) => void> = []
  const saver = new SerializedSaver(
    1,
    (request) => {
      sent.push(request)
      return new Promise((resolve) => {
        responses.push(resolve)
      })
    },
    () => `id-${sent.length + 1}`,
  )
  saver.note({ title: 'a' })
  const done = saver.flush()
  await vi.waitFor(() => expect(sent).toHaveLength(1))
  saver.note({ title: 'ab' })
  responses[0]({ ok: true, saveVersion: 2, currentVersion: 2 })
  await vi.waitFor(() => expect(sent).toHaveLength(2))
  expect(sent[1]).toMatchObject({
    expectedVersion: 2,
    snapshot: { title: 'ab' },
  })
  expect(sent[1].saveId).not.toBe(sent[0].saveId)
  responses[1]({ ok: true, saveVersion: 3, currentVersion: 3 })
  await expect(done).resolves.toBe('saved')
})

test('a lost response retries the same save id', async () => {
  const sent: SaveRequest[] = []
  let attempt = 0
  const saver = new SerializedSaver(
    1,
    async (request) => {
      sent.push(request)
      attempt += 1
      if (attempt === 1) return { ok: false, code: 'network' }
      return { ok: true, saveVersion: 2, currentVersion: 2 }
    },
    () => 'generated-once',
  )
  saver.note({ title: 'a' })
  await expect(saver.flush()).resolves.toBe('unsaved')
  await expect(saver.flush()).resolves.toBe('saved')
  expect(sent[0].saveId).toBe(sent[1].saveId)
  expect(sent[0].snapshot).toEqual(sent[1].snapshot)
})

test('save success and lease release stay separate', () => {
  expect(finishNotice('saved', null)).toBe('release_pending')
  expect(finishNotice('saved', { released: false })).toBe('lease_lost')
  expect(finishNotice('saved', { released: true })).toBe('saved')
  expect(finishNotice('unsaved', null)).toBe('not_saved')
})

test('a rejected transport keeps the same immutable snapshot and notifies the UI for retry', async () => {
  const sent: SaveRequest[] = []
  const statuses: string[] = []
  let fail = true
  const saver = new SerializedSaver(
    1,
    async (request) => {
      sent.push(request)
      if (fail) throw new Error('offline')
      return { ok: true, saveVersion: 2, currentVersion: 2 }
    },
    () => 'retry-id',
    (status) => statuses.push(status),
  )
  const snapshot = { title: 'Original' }
  saver.note(snapshot)
  snapshot.title = 'Mutated elsewhere'
  await expect(saver.flush()).resolves.toBe('unsaved')
  expect(saver.hasPending).toBe(true)
  fail = false
  await expect(saver.flush()).resolves.toBe('saved')
  expect(sent.map((item) => item.saveId)).toEqual(['retry-id', 'retry-id'])
  expect(sent[0].snapshot).toEqual({ title: 'Original' })
  expect(statuses).toEqual(['unsaved', 'saving', 'unsaved', 'saving', 'saved'])
})
