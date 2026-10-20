export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerNodeHooks } = await import('@/lib/node-lifecycle')
    registerNodeHooks()
  }
}
