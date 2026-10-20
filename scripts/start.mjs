import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const port = process.env.PORT || '3000'
const hostname = process.env.HOSTNAME || '0.0.0.0'
const nextBin = createRequire(import.meta.url).resolve('next/dist/bin/next')
const child = spawn(process.execPath, [nextBin, 'start', '--hostname', hostname, '--port', String(port)], {
  stdio: 'inherit',
  env: process.env,
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 1)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}
