export interface HeldLease {
  token: string
  saveVersion: number
}

interface Entry {
  token: string | null
  pending: Promise<HeldLease> | null
}

const entries = new Map<string, Entry>()

export function currentLeaseToken(newsletterId: string): string | null {
  return entries.get(newsletterId)?.token ?? null
}

export function rememberLease(newsletterId: string, token: string | null) {
  const entry = entries.get(newsletterId) ?? { token: null, pending: null }
  entry.token = token
  entries.set(newsletterId, entry)
}

export function beginLeaseRequest<T extends HeldLease>(newsletterId: string, run: () => Promise<T>): Promise<T> {
  const entry = entries.get(newsletterId) ?? { token: null, pending: null }
  if (entry.pending) return entry.pending as Promise<T>
  entry.pending = run()
    .then((result) => {
      entry.token = result.token
      entry.pending = null
      return result
    })
    .catch((error) => {
      entry.pending = null
      throw error
    })
  entries.set(newsletterId, entry)
  return entry.pending as Promise<T>
}

export function clearTabLease(newsletterId: string) {
  entries.delete(newsletterId)
}
