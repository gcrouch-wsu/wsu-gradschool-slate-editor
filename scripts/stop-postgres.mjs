import { rm } from 'node:fs/promises'

/**
 * Stops an embedded Postgres server without hanging test teardown.
 *
 * embedded-postgres waits for an `exit` event that never comes if the server already exited, or if the
 * platform kill (taskkill on Windows) is blocked. Bound the wait, then kill the server directly.
 */
export async function stopPostgres(server, { timeoutMs = 15000 } = {}) {
  const child = server?.process
  if (!child) return
  if (child.exitCode !== null || child.signalCode !== null) {
    server.process = undefined
    return
  }
  const exited = new Promise((resolve) => child.once('exit', resolve))
  let timer
  const timedOut = new Promise((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs)
  })
  const result = await Promise.race([server.stop().catch(() => undefined), exited, timedOut])
  clearTimeout(timer)
  if (result === 'timeout' && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL')
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))])
  }
  server.process = undefined
}

/** Removes a test data directory, retrying while Windows releases file handles. */
export async function removeDataDir(dir) {
  if (!dir) return
  await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch((error) => {
    console.warn(`Could not remove ${dir}: ${error.message}`)
  })
}
