import { authMode } from '@/lib/runtime-config'

export const dynamic = 'force-dynamic'

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>
}) {
  const params = await searchParams
  const next =
    params.next && params.next.startsWith('/') && !params.next.startsWith('//') ? params.next : '/newsletters'
  const mode = authMode()
  return (
    <main className="max-w-lg mx-auto p-8">
      <h1 className="text-2xl font-semibold mb-4">Sign in</h1>
      {params.error && <p className="mb-4 text-red-700">Sign-in could not be completed ({params.error}).</p>}
      {mode === 'okta' ? (
        <a
          className="inline-block bg-wsu-crimson text-white px-4 py-2 rounded"
          href={`/api/auth/okta/start?next=${encodeURIComponent(next)}`}
        >
          Sign in with Okta
        </a>
      ) : mode === 'local' ? (
        <form className="space-y-3" action="/api/auth/local/session" method="post">
          <p className="text-sm">Sign in with the email and password issued for your editor account.</p>
          <input type="hidden" name="next" value={next} />
          <label className="block text-sm" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            className="border rounded px-3 py-2 w-full"
            required
          />
          <label className="block text-sm" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            className="border rounded px-3 py-2 w-full"
            required
          />
          <button className="bg-wsu-crimson text-white px-4 py-2 rounded" type="submit">
            Sign in
          </button>
        </form>
      ) : mode === 'development' ? (
        <form className="space-y-3" action="/api/auth/development/session" method="post">
          <p className="text-sm">
            Development mode accepts an existing application user id. It is not available on the Vercel deployment.
          </p>
          <input type="hidden" name="next" value={next} />
          <label className="block text-sm" htmlFor="userId">
            User id
          </label>
          <input id="userId" name="userId" className="border rounded px-3 py-2 w-full" />
          <button className="bg-wsu-crimson text-white px-4 py-2 rounded" type="submit">
            Continue
          </button>
        </form>
      ) : (
        <p role="alert">
          Sign-in is not set up on this site yet. An administrator needs to set AUTH_MODE before anyone can edit
          newsletters.
        </p>
      )}
    </main>
  )
}
