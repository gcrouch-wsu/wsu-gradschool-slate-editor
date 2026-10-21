# Deployment

The current production host is Vercel. Shared newsletters are saved in Postgres and signed in with local accounts. Okta and AWS are later releases.

## Current Vercel release

1. In the Vercel project, create a Postgres database (Storage or the Neon integration) and copy its `DATABASE_URL`.
2. Set these environment variables for Production:
   - `AUTH_MODE=local`
   - `DATABASE_URL` from the database
   - `SESSION_SECRET` a random string of at least 32 characters
   - `PUBLIC_ORIGIN` the production URL, with no trailing slash, such as `https://your-app.vercel.app`
3. From a machine that can reach that database, run `npm run migrate`, then create the first administrator:

```bash
npm run create-user -- --email you@wsu.edu --name "Your Name" --password "a-long-password" --role administrator
```

4. Deploy with the configured Vercel build (`npm run build:vercel`). Production builds apply pending SQL migrations before Next.js builds; a migration failure fails the build. Open the site, sign in, and add other editors at `/admin`.
5. Each person signs in with the email and password you issued. Drafts are the shared newsletters at `/newsletters`. One person edits a newsletter at a time; the next person takes over when they finish.

Leave the Okta variables unset. `AUTH_MODE=development` does not work on Vercel.

The stable production entry point is `https://wsu-gradschool-slate-editor.vercel.app/sign-in`.
Vercel also gives each deployment a unique URL. Production builds redirect that deployment hostname to `PUBLIC_ORIGIN`, preserving the path.
Only `main` triggers automatic Vercel deployments. Automatic deployments from other branches are disabled in `vercel.json`.

## Runtime

- Node.js 20.9 or newer.
- `npm run build`, then `npm run start`.
- `scripts/start.mjs` listens on `HOSTNAME` (default `0.0.0.0`) and `PORT` (default `3000`).
- `GET /api/health` returns 200 when the process can serve traffic. In local or Okta mode it returns 503 when required configuration is missing or PostgreSQL is down.
- On `SIGTERM`, `instrumentation.ts` closes the PostgreSQL pool and exits.
- The pool size defaults to 10 (`DATABASE_POOL_MAX`).
- Redirects and cookies use `PUBLIC_ORIGIN`. Do not trust `X-Forwarded-*` as the application origin.
- Logs are single-line JSON events. They must not include session tokens, Okta secrets, or newsletter document bodies.

## Database

Use a standard PostgreSQL connection string in `DATABASE_URL`. There is no file or in-memory fallback.

Apply migrations as a separate command before starting a new release:

```bash
npm run migrate
```

`scripts/migrate.mjs` takes an advisory lock, records each file's SHA-256, and exits non-zero when `DATABASE_URL` is missing, a connection fails, or an already-applied file changes. Checksums normalize CRLF to LF and also accept previously recorded Windows CRLF hashes; no ledger entries are rewritten. Add a new file under `migrations/` instead of editing an applied file. Do not run migrations from a page or API request.

For the current Vercel release, create named accounts with passwords. The password is hashed and is not stored as text:

```bash
npm run create-user -- --email ada@wsu.edu --name "Ada Admin" --password "a-long-password" --role administrator
```

The password may be saved in your shell history. Prefer creating later editors from the signed-in Accounts page. A local account email is unique. Okta profile emails, used only in the later release, are not unique.

## Okta (future)

Turn this on only by setting `AUTH_MODE=okta`. Production does not imply Okta. `AUTH_MODE=development` is refused in production. Okta does not accept a password. The first Okta administrator is linked by issuer and subject:

```bash
npm run create-admin -- --issuer https://login.example.edu --subject OKTA_SUBJECT --name "Ada Admin" --email ada@example.edu
```

The Okta identity key is the pair `(issuer, subject)`.

Register these URLs exactly:

- Sign-in redirect: `{PUBLIC_ORIGIN}/authorization-code/callback`
- Post-logout redirect: `{PUBLIC_ORIGIN}` with no trailing path and no trailing slash

`PUBLIC_ORIGIN` itself has no trailing slash. Confirm the issuer, client, and logout session behavior with WSU ITS. Do not reuse another application's client. The session lifetime defaults to 8 hours (`SESSION_TTL_SECONDS`). Whether Okta should force a shorter reauthentication interval is still an ITS decision.

Application sign-out revokes the database session and clears the cookies even when Okta's end-session request cannot be built. The response reports those outcomes separately.

## AWS (future)

The `Dockerfile` is preparation for a later container host. The current release does not use it. A live Okta tenant, AWS account, and multi-instance deployment have not been verified.

## Cutover

1. Freeze newsletter writes. Stop the old editor, or make it read-only, before copying data. Do not let the old process and the new process write the same newsletter.
2. Take a PostgreSQL backup.
3. Load users, identities, newsletters, revisions, and save receipts. Keep document IDs, actor IDs, save versions, and revision numbers unchanged.
4. Run `npm run migrate` against the target database. It is safe to repeat; it will not reapply an unchanged file.
5. Start the new release with Okta mode, the target `DATABASE_URL`, and the registered `PUBLIC_ORIGIN`.
6. Verify health, one administrator sign-in, one editor sign-in, a save, a second editor's blocked lease, takeover, export, and sign-out.
7. Compare row counts and the newest `save_version` for each newsletter with the source backup.

Rollback: stop the new release, restore the PostgreSQL backup taken in step 2, and start the previous release only after the new release is stopped. Do not run both writers. Save receipts and revisions created after the backup are discarded with that restore, so the write freeze has to hold until verification finishes.

## Revision retention

Each committed autosave, including a debounced autosave, appends one revision. Rejected saves and idempotent retries do not. Retention of revisions, recovery drafts, and save receipts is still an operations decision; the schema does not delete them automatically.
