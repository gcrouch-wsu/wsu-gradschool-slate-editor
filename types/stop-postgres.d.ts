declare module '../scripts/stop-postgres.mjs' {
  import type EmbeddedPostgres from 'embedded-postgres'
  export function stopPostgres(server: EmbeddedPostgres | undefined, options?: { timeoutMs?: number }): Promise<void>
  export function removeDataDir(dir: string): Promise<void>
}
