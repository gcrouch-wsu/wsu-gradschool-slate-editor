import { closePool } from '@/lib/db/pool'

export function registerNodeHooks() {
  process.once('SIGTERM', () => {
    void closePool().finally(() => {
      process.exit(0)
    })
  })
}
