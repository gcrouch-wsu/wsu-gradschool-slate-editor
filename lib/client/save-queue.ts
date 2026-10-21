export interface SaveRequest {
  saveId: string
  expectedVersion: number
  snapshot: unknown
}

export type SaveResponse =
  | { ok: true; saveVersion: number; currentVersion: number }
  | {
      ok: false
      code: 'lease' | 'version' | 'fingerprint' | 'archived' | 'session' | 'network'
    }

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'conflict' | 'lease_lost' | 'session_expired'

export type FinishNotice = 'saved' | 'release_pending' | 'lease_lost' | 'not_saved'

export function finishNotice(saveStatus: SaveStatus, release: { released: boolean } | null): FinishNotice {
  if (saveStatus !== 'saved') return 'not_saved'
  if (!release) return 'release_pending'
  if (!release.released) return 'lease_lost'
  return 'saved'
}

export class SerializedSaver {
  version: number
  private currentStatus: SaveStatus = 'saved'
  get status() {
    return this.currentStatus
  }
  set status(value: SaveStatus) {
    this.currentStatus = value
    this.onStatus?.(value)
  }
  get hasPending() {
    return this.pending !== null || this.held !== null
  }
  private pending: unknown | null = null
  private held: SaveRequest | null = null
  private tail: Promise<void> = Promise.resolve()

  constructor(
    version: number,
    private send: (request: SaveRequest) => Promise<SaveResponse>,
    private newId: () => string,
    private onStatus?: (status: SaveStatus) => void,
  ) {
    this.version = version
  }

  note(snapshot: unknown) {
    if (this.status === 'conflict' || this.status === 'lease_lost' || this.status === 'session_expired') return
    this.pending = structuredClone(snapshot)
    if (this.held === null && this.status !== 'saving') this.status = 'unsaved'
  }

  flush(): Promise<SaveStatus> {
    const run = this.tail.then(() => this.run())
    this.tail = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  private async run(): Promise<SaveStatus> {
    while (
      (this.held || this.pending) &&
      this.status !== 'conflict' &&
      this.status !== 'lease_lost' &&
      this.status !== 'session_expired'
    ) {
      const request =
        this.held ??
        ({
          saveId: this.newId(),
          expectedVersion: this.version,
          snapshot: this.pending,
        } satisfies SaveRequest)
      if (!this.held) this.pending = null
      this.held = request
      this.status = 'saving'
      let result: SaveResponse
      try {
        result = await this.send(request)
      } catch {
        result = { ok: false, code: 'network' }
      }
      if (!result.ok) {
        if (result.code === 'network') {
          this.status = 'unsaved'
          break
        }
        this.pending = this.pending ?? request.snapshot
        this.held = null
        this.status =
          result.code === 'lease' ? 'lease_lost' : result.code === 'session' ? 'session_expired' : 'conflict'
        break
      }
      this.held = null
      this.version = result.saveVersion
      if (result.currentVersion !== result.saveVersion) {
        this.status = 'conflict'
        break
      }
    }
    if (!this.pending && !this.held && this.status === 'saving') this.status = 'saved'
    return this.status
  }
}
