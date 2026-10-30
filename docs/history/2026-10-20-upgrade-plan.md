# Shared newsletter editing and Okta/AWS upgrade plan

Date: October 20, 2026

Status: Implemented in the application on October 20, 2026. The current production host is Vercel with Postgres and local editor accounts. Okta and AWS remain later releases.

This is the plan as written on October 20, 2026, kept for its decisions and Okta references. Some details have changed since: the app now requires Node 24.22.1, the single-user editor at `/` and its import and export routes were removed on October 30, 2026, and production runs on Vercel. See the [README](../../README.md) and [deployment guide](../deployment.md) for the current setup.

## Implementation status

| Phase | Local result | Still required |
| --- | --- | --- |
| 1. Document safety | Validation, sanitization, preview sandbox, backup handling, and template authority are in the editor. Vitest covers three templates, both import wrappers, and unsafe HTML. The browser checked the sandbox, `href="browser"`, and all three templates. | None for the local editor. |
| 2. Framework | Next.js 16.4.2, React 19.3.1, and Node 20.9+ (`engines`). Typecheck, ESLint, and `next build` passed. Strict Mode stays on. `scripts/start.mjs` binds `PORT` and `HOSTNAME`. | None for the build. ESLint reports existing unused-variable warnings and does not fail. |
| 3. PostgreSQL, sessions, Okta | Ordered migrations, hashed database sessions, `(issuer, subject)` identities, and the Okta authorization-code flow are implemented. Embedded PostgreSQL tests covered migration locking, hash refusal, revocation, inactive users, and stale authorization versions. ID-token checks used a local key, not a WSU tenant. | Register the editor with WSU Okta and complete a real sign-in, sign-out, wrong-issuer, and IdP-failure check. Confirm the reauthentication interval with ITS. |
| 4. Documents and history | Create, import, duplicate, archive, restore, template replacement, and export-by-id go through the database. A page reload showed a committed title still stored. | A full server-process restart was not run as its own check. |
| 5. Leases and handoff | PostgreSQL tests covered two users, a second token, stale versions, expiry, takeover, idempotent retries, fingerprint mismatch, and lifecycle rotation. The browser covered two tabs, takeover, recovery, expiry, and session revocation. | Do not treat this as staff rollout. The live two-person Okta handoff has not been done. |
| 6. Later hosting | The current deploy target is Vercel with `AUTH_MODE=local`, Postgres, and named editor accounts. Container and Okta cutover notes remain in `docs/deployment.md` for later releases. | Create the Vercel database, set `DATABASE_URL` and `SESSION_SECRET`, run migrations, and create accounts. Do not enable Okta or move to AWS for this release. |

Development sign-in exists only when `AUTH_MODE=development` and Node is not in production. Knowing a user id is not enough on Vercel. Local accounts are a separate `AUTH_MODE=local` and are not an Okta fallback. Shared editing uses the leased API; there is no unguarded write route.

## Review corrections incorporated

| Review finding                                 | Required plan correction                                                                                                                                                                           |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Two-tab lease ownership and effect cleanup  | Hashed per-editing-session token, atomic guards, clean-document renewal, explicit takeover, and no cleanup-triggered release. Tokens stay in memory because browser session storage can be copied. |
| 2. Lost save responses                         | Frozen snapshots, client save IDs, durable fingerprinted receipts, serialized requests, and separate save/release outcomes.                                                                        |
| 3. Injection beyond rich-text bodies           | Validate all scalar/style/URL fields, sanitize rich HTML, isolate the preview, and preserve the renderer-owned Slate `browser` link.                                                               |
| 4. Session revocation                          | Mandatory database sessions and current-user authorization checks; explicit Okta mode with unavailable password routes.                                                                            |
| 5. Premature shared editing                    | Single-tester restriction until lease/idempotency checks pass; guarded lifecycle transactions.                                                                                                     |
| 6. Migration fallback behavior                 | Explicit ordered migrations through `pg`, advisory locking, non-zero failures, and no runtime persistence fallback.                                                                                |
| 7. Okta logout and branch divergence           | Separate application/IdP sign-out outcomes, exact registered URIs, and a reconciled source reference before adaptation.                                                                            |
| 8. Template synchronization versus replacement | Make the document template authoritative; retain the separate confirmed destructive replacement and preserve prior content in history.                                                             |
| 9. Legacy import compatibility                 | Decode either wrapper, normalize old shapes, then validate/sanitize; import as a new draft by default.                                                                                             |

These are requirements for implementation and verification, not claims that the application has already been fixed.

## Goal

Allow authorized staff to open the same newsletter, edit in sequence, and hand work to the next person through a stable application link. Save the editable document in a database. Keep HTML export for delivery to Slate and HTML import for existing newsletters.

Structure authentication, document storage, and deployment so Okta adoption and a later move to AWS can happen independently. Preserve the current Tiptap editor and newsletter rendering model.

The first release supports one active editor per newsletter. Simultaneous collaborative typing, automated publishing to Slate, and a new approval workflow are outside this release.

## What the review established

The editor was reviewed at commit `8bb091476ad934d804c0faf9f9fadf55bb38785b`.

| Observed behavior                                                                                                                            | Implication for the upgrade                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The installed application uses Next.js 14.2.35 and React 18.3.1.                                                                             | Move to a supported framework/runtime combination before the authenticated production release.                                                          |
| `NewsletterData` contains the complete editable content, template, settings, and layout.                                                     | Store this structure as a versioned JSONB document rather than reconstructing it from exported HTML.                                                    |
| Draft recovery uses one browser-local `wsu_newsletter_backup` key.                                                                           | Add durable document IDs and shared storage; scope recovery to the signed-in user and newsletter.                                                       |
| The state hook writes an initial backup after one second; startup also deletes backups less than one minute old.                             | Replace the startup/recovery coordination before adding server autosave. An unresolved recovery prompt must not cause its source backup to be replaced. |
| Import updates the document without synchronizing the separate `templateType` state; export overrides the document template with that state. | Make the document's template authoritative.                                                                                                             |
| Import accepts parsed JSON without runtime document validation.                                                                              | Validate and normalize all imported and saved documents on the server.                                                                                  |
| The email renderer preserves script tags and event handlers in rich HTML; the preview iframe has no sandbox.                                 | Sanitize rich HTML and isolate preview content before users open colleagues' saved documents.                                                           |
| There is no authentication or database layer in this repository.                                                                             | Add server-enforced identity, permissions, persistence, and conflict handling.                                                                          |

Additional source checks confirmed that colors and other style values are interpolated into HTML attributes, URL escaping does not enforce safe schemes, code view can pass raw HTML into Tiptap, and only the legacy JSON import branch currently applies the social-object and `title_align` migrations. The renderer owns the special Slate `href="browser"` link. Document safety must cover all these paths, not only `body_html`.

Executed checks during the review:

- `tsc --noEmit --incremental false` passed.
- Direct runtime calls to the existing export and import route handlers preserved all three default newsletter models: Friday Focus, Briefing, and Slate Campaign.
- A renderer probe confirmed that script tags and event handlers survive HTML generation.
- An import probe confirmed that an unrelated JSON object embedded in the expected HTML comment is accepted as a successful import.

These checks were executed in the original review; the supplied Cursor review did not rerun them. They establish a local baseline, not browser behavior, live Okta integration, database correctness, or production readiness. No production build or live-service verification was performed as part of the original review. This plan revision adds no claim of application-test execution.

## Reference applications

### Smartsheet Viewer: primary authentication and database portability reference

The Okta implementation is on `feat/busola/okta`, commit `9ec860d457610f8964cb9c8ed829de31bfd8b328`. [PR #16](https://github.com/gcrouch-wsu/wsu-gradschool-smartsheet-viewer/pull/16) was open and unmerged when checked on October 20, 2026. Its target branch was `main`, whose head was `7fe331e27029b0f06e985c64bc5a70cb4738721a`. Relative to that main head, the Okta branch was two commits ahead and six behind. The main head is not an ancestor implied to be present in the pinned Okta tree. The local viewer checkout was `16459f4`, with no `src/lib/okta` tree, so the Okta source was reviewed directly through GitHub.

Before adapting files, recheck the PR head and merge status and compare any overlapping changes against current main. Use a reconciled source tree; do not combine the pinned Okta files with later main files without reviewing their contracts together. Do not modify or merge the reference application's branches as part of this editor upgrade.

Useful patterns:

- Separate Okta configuration, authorization-code/PKCE handling, temporary sign-in state, and application-session issuance.
- Verify identity through Okta, then check application access before issuing the application's session.
- Normalize sessions into an application principal with explicit roles and capabilities.
- Configure the public application origin and registered callback/logout URLs.
- Use `pg` for standard PostgreSQL connections and provide an explicit migration command.

Adapt these patterns rather than copying the whole authentication subsystem. The viewer has staff, student, contributor, and legacy-account workflows that this editor does not need. Its OIDC flow uses custom helpers with `jose`; the editor's implementation should select and pin a maintained OIDC client compatible with its target framework, using the reviewed flow as a behavioral reference.

Two deliberate improvements for this editor:

- Persist the relationship between the internal user and the external `(issuer, subject)` identity. The viewer validates the subject but passes email into its account/session mapping. Email should remain editable profile information rather than the permanent identity key.
- Make authentication mode explicit. The viewer retains a password-login API; the editor must disable local-password endpoints in production Okta mode and reject incomplete Okta configuration instead of silently falling back.

The viewer's logout path uses an HTTP-only ID-token cookie for `id_token_hint` and an exact registered post-logout URI. Carry those requirements into the editor's own registration. Clearing the application session and ending the Okta session are separate outcomes; test both, including IdP failure.

### Knowledge Base: editing protection and history reference

Repository: [gcrouch-wsu/wsu-gradschool-kb](https://github.com/gcrouch-wsu/wsu-gradschool-kb), reviewed at commit `d8158b5803459548bfb452f560cd0b1fb6d8e06a`.

Useful patterns include server-side permission guards, durable users, edit-lock heartbeats, transactional revision history, and per-author recovery drafts. The KB's local-password authentication is not the target authentication design for this editor.

Strengthen the lock pattern when adapting it. The KB identifies lock holders by email and its guarded update allows an absent or expired lock. Its editor also releases the lock during effect cleanup. Require a current lease belonging to the browser editing session plus an expected document version, so stale tabs and two tabs belonging to the same user cannot overwrite each other. Do not copy cleanup-triggered release: React Strict Mode effect replay must not release an active editor's lease.

Reuse the transaction and migration concepts, not the reference applications' fallback behavior. The viewer's pinned migration command skips successfully without a database URL and reapplies a mutable baseline; the KB migrates on first request and offers in-memory behavior, including successful lock responses without a database. Neither behavior is acceptable behind this editor's persistence layer.

## Proposed application boundaries

| Boundary                 | Responsibility                                                                      | Migration rule                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Identity/session module  | Sign-in, callback, logout, session validation, and normalized current user          | Keep OIDC and cookie details out of editor components and document services.                    |
| Permission module        | Determine which users can read, edit, restore, archive, or administer newsletters   | Keep document permissions in the application; map approved Okta groups to roles only if needed. |
| Newsletter service       | Validate documents, coordinate saves, enforce leases/versions, and record revisions | Keep workflow rules independent of the database host and authentication provider.               |
| PostgreSQL repository    | Parameterized queries, transactions, migrations, and connection management          | Use standard PostgreSQL features and connections compatible with Neon and AWS PostgreSQL.       |
| Editor UI                | Draft library, editing, save status, recovery, history, and handoff                 | Depend on application APIs and document types.                                                  |
| Deployment configuration | Public origin, secrets, database connection, health checks, and process settings    | Keep environment-specific settings outside application behavior.                                |

These boundaries can be small modules within the existing Next.js application. They do not require separate services, a general-purpose plugin framework, or a rewrite of the editor.

## Authentication and permissions

- Target Okta-hosted OpenID Connect sign-in with authorization code and PKCE.
- Validate state, nonce, signature, configured issuer, audience, expiry, and required identity claims. Use an independent application-session secret and secure HTTP-only cookies.
- Make database-backed sessions mandatory. The application cookie contains only a cryptographically random opaque session ID; store its hash in the database. Each protected request loads the session and user, rejecting expired/revoked sessions, inactive users, or a changed authorization version. Read permissions from the current user record. Keep this check on API/service boundaries as well as pages.
- Sign the short-lived OIDC state cookie with the independent application-session secret. Production Okta mode must fail startup/readiness when the issuer, client ID, client secret, session secret, explicit public origin, or database URL is missing or invalid. Database failure must deny protected operations without falling back to local credentials or storage.
- Give the editor its own Okta application registration, callback/logout configuration, cookie names, and secrets. Shared WSU sign-in does not require sharing application-session cookies or copying another application's credentials.
- Store an internal user ID and external identity mapping. Enforce uniqueness for `(issuer, subject)`. Use internal IDs for authorship, permissions, and lease ownership.
- Treat email as profile data. Do not add a uniqueness rule that prevents two existing records from being resolved through the explicit account-linking process. Login lookup uses the external identity key, and temporary password lookup, if needed, has its own unambiguous provider identifier. Never choose a privileged account from an ambiguous email lookup.
- Link any temporary accounts to Okta through an explicit, verified process that preserves their internal IDs. Do not automatically merge privileged accounts solely because email addresses match.
- Begin with Administrator and Editor roles in one shared staff workspace. Administrators manage access and recovery; Editors work on shared newsletters. Add narrower document assignments only if the actual workflow requires them.
- Authentication alone must not grant editing permission. Require an active application account with an assigned role.
- Enforce permissions on the server for lists, reads, writes, history, lease operations, and editor-support routes. Apply CSRF/request-origin protection to cookie-authenticated mutations.
- Select session expiry and revalidation behavior with WSU's Okta policy. Application account disablement and role changes must immediately restrict subsequent protected requests. An application session lookup alone does not detect a user disabled only in Okta; define the approved maximum reauthentication interval or IdP event/revalidation mechanism before rollout.
- Keep the ID token needed for logout only in a secure HTTP-only cookie, never in browser-readable storage or logs. Use it as `id_token_hint`, register the editor's exact callback and post-logout URI, and test bare-origin/trailing-slash behavior against the registration. Revoke the database session and clear application cookies even if IdP discovery/logout fails. Report whether only application sign-out completed; do not imply that an unverified Okta logout succeeded.
- If temporary local accounts are necessary, isolate them behind the identity module. Allow them only in explicitly configured environments. Production Okta mode must have no active local login, claim, or password-reset handlers; direct requests must be unavailable regardless of what the UI shows. Define first-administrator provisioning without a permanent password bypass.

## Data model and persistence

Use standard PostgreSQL and a `pg` connection pool behind the repository. Neon can be the initial host. Keep the schema and queries compatible with RDS PostgreSQL or Aurora PostgreSQL; verify compatibility against the selected AWS engine before cutover.

Suggested tables:

| Table                        | Main contents                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `users`                      | Internal ID, display name, email, role, active status, and timestamps                                                                            |
| `user_identities`            | User ID, provider/issuer, subject, and uniqueness constraints                                                                                    |
| `newsletters`                | ID, title, template, JSONB content, document schema version, save version, archive status, author IDs, precise timestamps, and edit-lease fields |
| `newsletter_revisions`       | Newsletter ID, revision number, complete document snapshot, actor ID, action, and timestamp                                                      |
| `sessions`                   | Mandatory session-ID hash, user ID, authorization version, expiry, revocation status, and timestamps                                             |
| `newsletter_save_receipts`   | Newsletter ID, client save ID, actor ID, base version, request fingerprint, committed version, and timestamp; unique per newsletter/save ID      |
| `newsletter_recovery_drafts` | Optional per-user recovery document and the canonical version it diverged from                                                                   |

The document schema version describes the JSON format; the save version detects concurrent changes. Keep those concepts separate. Add constraints and indexes for identity lookup, draft lists, revision uniqueness, save receipts, and lease operations. Newsletter rows include `lease_token_hash`, `lease_holder_user_id`, and `lease_expires_at`; an optional `last_save_id` is a convenience, not a replacement for durable receipts.

Write the newsletter, its revision, and its save receipt in the same transaction. Use monotonically increasing document versions. Do not create a history entry for a rejected save or an idempotent retry. Proposed initial policy: each committed content save, including a debounced autosave, records a full revision. Confirm retention and expected storage before finalizing the schema; changing to checkpoint-only history requires an explicit policy and adjusted tests.

Restore, archive, and destructive template replacement require current permissions, the expected save version, and a valid lease or an explicit authorized takeover. In the same transaction, increment the version, append history, and clear/rotate the lease so an old editor cannot continue saving. Restoring creates a new revision. Before replacing content with template defaults, retain a recoverable revision of the previous document; this is separate from fixing template selection synchronization.

Ship immutable, ordered SQL migration files and an explicit `pg` migration command. Missing database configuration, failed connection, or a failed migration exits non-zero. Serialize migration runners with a PostgreSQL advisory lock and record each applied migration transactionally with its SQL. Test both fresh setup and upgrades; use new migration files for later changes rather than reapplying an edited baseline. Run migrations as a deployment/release step, never from a page or API request. The repository has no file or memory persistence fallback. Production must report missing database configuration or an outage as a failure and must never acknowledge a save that did not commit.

## Sequential editing workflow

1. The user signs in and opens the shared draft library. Each newsletter shows its title, template, last editor, last saved time, and editing availability.
2. The user creates or opens a newsletter at a stable route such as `/newsletters/{id}`. Creating from a template makes a new database document.
3. Starting an edit atomically acquires an expiring database lease with a cryptographically random token scoped to that live browser editing session. Store only its hash, holder user ID, and expiry on the newsletter row. Return the raw token once with the current server document and version. Keep the raw token in that tab's memory, never in a login cookie, local storage, or shared user state. A duplicated/new tab must not inherit write authority; [`sessionStorage` can be copied from an opener](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage), so it must not persist this token. Reopening/reloading uses expiry or explicit takeover and loads the current document.
4. Renew about every 60 seconds while editing, including when the document is clean, with an initial expiry of about three renewal intervals. Server/database time determines expiry. Renewal checks holder, token hash, and an unexpired lease and cannot revive an expired token. Timer delays, network failures, and background tabs must lead to a safe lost-lease state. A second tab is view-only until the lease expires or an explicit authorized takeover rotates the token.
5. Each save sends the lease token, expected save version, client-generated save ID, and a frozen snapshot. One conditional database update must match the signed-in user, token hash, unexpired lease, expected version, and editable status. A new save ID with a mismatched version is a real conflict. Commit the new version, revision, and receipt together.
6. Before applying a retry, look up its save receipt after authentication and access checks. The same save ID with the same actor, base version, and request fingerprint returns its original committed version without writing. Reusing an ID for different content is rejected. Handle racing duplicate requests transactionally. Keep receipts long enough to cover the documented retry window; an ambiguous retry outside that window requires reconciliation, not an automatic overwrite.
7. Serialize client saves. Acknowledgment clears only the submitted snapshot, not keystrokes made while it was in flight. If newer edits exist, enqueue them against the acknowledged version. An old receipt reports the version originally committed, never silently adopts a later user's version; if the canonical document or lease has since moved on, reconcile before any new write.
8. **Save and finish editing** freezes further input, drains pending snapshots until the final one is acknowledged, then explicitly releases the matching lease. If saving fails, preserve the work and do not claim completion. If saving succeeds but release fails or its response is lost, show **Saved; editing lease release pending**, check/retry only release, and do not repeat the content save. Release is idempotent and must never clear a token rotated by a later editor.

Expired leases must be reclaimable after a browser closes or crashes. Do not release a lease from React effect cleanup, `pagehide`, or unload events; effect cleanup only stops timers/listeners. Initiate acquisition from an explicit editing action or a tab controller that deduplicates in-flight acquisition across effect replay. Strict Mode must not trigger a second acquisition or discard the successful response/token. Renewal must likewise tolerate effect replay without duplicate live authority. A client that loses its lease or encounters a version conflict must stop canonical saves and offer recovery against the latest server document. Takeover/reacquisition loads the current server document and must not automatically submit an old tab's content.

Show clear states such as **Saving**, **Saved**, **Changes not saved**, **Session expired**, and **Editing lease lost**. The stable link identifies the newsletter and grants no access by itself. No email or messaging integration is required for the initial handoff workflow.

## Editor, recovery, and HTML safety

- Make `NewsletterData.template` authoritative for the selector, preview, and export. This fixes the import mismatch without changing content. Keep the explicit confirmation for the separate operation that loads template defaults and discards edits. Once database history exists, that replacement uses the lifecycle transaction and preserves the prior content.
- Keep browser recovery separate from canonical server storage. Scope it to internal user ID, newsletter ID, and base version. Never automatically restore a backup over a newer server save, and do not clear an unresolved backup during initialization.
- During network or session failures, preserve the current work and show that it has not reached the server. Resolve account/session state before offering stored recovery data, and prevent another user on the same browser from being shown it. Keep tokens out of local storage.
- Validate and normalize at server boundaries before save, restore, preview, and export, including existing document reads rendered by the application. TypeScript types alone do not validate request bodies. Cover all nested fields, array/document limits, enum values, finite bounded numeric sizes, and style values. Constrain colors to supported hex formats, constrain font/style choices to defined values, and escape attribute values in the renderer as defense in depth. Numeric and style fields must not provide an HTML-attribute escape path.
- Use `sanitize-html`, with the viewer's reviewed configuration/version as a starting reference and the actual supported version verified at implementation. Define allowed rich-text tags, attributes, and inline styles from fixtures for all three templates. Remove scripts, event handlers, unsafe CSS, and unsafe URL schemes. Raw HTML from Tiptap code view follows the same policy before reaching a rendering sink; editor parsing is not a security boundary.
- Validate author-supplied links as `https:` or `mailto:` and image/banner/icon/signature sources as `https:`. Validate rich-text URLs too. Preserve renderer-owned Slate `href="browser"` separately; never make `browser` a general exception that author-controlled URLs can use. Identify any legitimate legacy URL needing an explicit migration before rollout.
- Sandbox the preview with no script, form, same-origin, or top-navigation permissions. Remove the `document.write` fallback. Adapt iframe sizing to the opaque-origin sandbox without re-enabling same-origin access. Verify the browser behavior with malicious HTML in rich text, URLs, colors, and size fields as well as normal newsletter content.
- Decode either the Base64 or legacy JSON wrapper, apply applicable legacy normalizers to either decoded shape, then validate and sanitize. Normalize the old social object and missing `title_align` before rejecting an otherwise valid old newsletter. Reject unrelated JSON. Import creates a new draft by default; replacing an existing draft uses the normal lease/version save path. Preserve the Base64 export wrapper and renderer-owned Slate fields in round-trip fixtures.
- Keep final HTML export for Slate. Shared editing removes the need to exchange exported HTML between colleagues.

## Delivery phases and acceptance checks

### Phase 1: document safety on the existing editor

Fix template synchronization, backup initialization, import normalization, runtime validation, sanitization of every input surface, and preview isolation on the existing editor. Cover Friday Focus, Briefing, and Slate Campaign with modern and legacy import/export fixtures, including renderer-owned `browser` links. Keep destructive template replacement distinct from selection synchronization.

Acceptance: document-safety and round-trip checks pass; each template edits, previews, imports, and exports correctly; the previous recovery backup survives an unresolved prompt. Browser checks prove unsafe URLs, attribute injection, raw code-view content, and script/event payloads cannot act as the parent application.

### Phase 2: framework and runtime upgrade

Move to the supported Next.js 16/React 19 line used by the reference apps and a supported Node.js LTS. Verify exact supported versions when implementing. Keep Tiptap. Update lint/build commands, framework APIs, and portable start behavior as needed. Land this separately before authentication and lease implementation.

Acceptance: type checks, lint, production build, document-safety fixtures, and browser template checks pass after the upgrade. Strict Mode remains enabled. Existing Node hosting and `PORT` behavior are documented and verified.

### Phase 3: PostgreSQL, database sessions, and Okta

Add failing-closed, advisory-locked migrations, repository/services, users, external identity mapping, mandatory database sessions, and two roles. Register the editor with WSU Okta and document environment-specific configuration. Keep any temporary authentication provider isolated and explicitly configured. Reconcile referenced Okta branch/main changes before adaptation.

Acceptance: clean setup and upgrade migrations work; missing configuration and migration errors exit non-zero; simultaneous migration runners serialize correctly. Real test-tenant sign-in/sign-out works, including exact logout URLs and IdP failure cleanup. Direct API requests reject unauthorized/inactive users, revoked sessions, stale authorization versions, bad state/nonce/issuer/audience, and local password/claim/reset attempts in Okta mode.

### Phase 4: documents and history under a single-tester restriction

Add create, list, open, rename, duplicate, archive, import/export, and history operations by document ID. Save the full model through version-checked transactions. Record recoverable history for destructive operations. This is an integration stage restricted to one tester; do not enable shared staff editing or handoff until Phase 5 passes. The final lifecycle APIs require the lease/version rules above; do not expose a temporary unguarded write route to staff.

Acceptance: one tester's save survives an application restart; history identifies the actor; restoration increments the save version and creates a new revision; failed database writes never report success. Shared editing remains disabled.

### Phase 5: leases, idempotent autosave, recovery, and staff handoff

Replace browser-only autosave with server autosave plus scoped recovery. Implement the complete lease, save-receipt, serialized autosave, takeover, and explicit finish/release contract before making shared editing available. Apply it to restore, archive, and template replacement as well as ordinary saves.

Acceptance: automated PostgreSQL and browser tests cover two users, two tabs for the same user, duplicate tabs, Strict Mode effect replay, a stale version, expiry while clean/backgrounded, renewal failure, takeover, session expiry/revocation, network loss, crash, and recovery after another save. Test committed saves with lost responses, retries after a later commit, simultaneous retries, mismatched request fingerprints, keystrokes during an in-flight request, and successful save followed by failed release. Rejected writes/idempotent retries create no extra history. A stale release cannot clear a successor's lease, lifecycle operations invalidate old authority, and failed/partial handoff states are accurate. Staff rollout is gated on these checks and actual two-user handoff.

### Phase 6: AWS deployment preparation and cutover

Keep the app deployable as a standard Node.js process and provide a container build if that matches WSU's selected AWS service. Configure health checks, graceful shutdown, bounded database pools, trusted proxy handling, HTTPS/public origin, and structured logs that omit secrets and document contents.

Keep credentials in environment-specific secret configuration. On AWS, use the approved secret-delivery mechanism and workload IAM role for AWS service access. Keep user authentication and workload authorization separate. Add an object-storage boundary only if managed uploads become part of the editor; S3 is a future option, not a dependency of shared drafting.

Acceptance: deploy to an AWS test environment with separate data and secrets; verify multi-instance sessions and leases, PostgreSQL TLS/connectivity, migration execution, backup/restore, monitoring, and registered Okta callback/logout URLs. Rehearse data transfer with IDs, authorship, versions, and history intact. Define a write freeze, verification, and rollback procedure before production cutover, including how to avoid divergent writes.

## Configuration and decisions to resolve during implementation

- WSU-approved Okta issuer, editor client registration, test/production domains, callback/logout allowlists, access assignments, and session/logout expectations. The viewer's example uses `https://login.wsu.edu`; confirm the editor's actual registration with ITS rather than assuming another app's issuer or credentials.
- Whether Okta can be enabled for the first shared-editing release or temporary accounts are needed.
- Initial PostgreSQL host, test/production databases, supported engine versions, backup policy, and eventual AWS service. Database or hosting migration does not have to coincide with Okta activation.
- Which staff can administer access, how the first Administrator is provisioned, and whether all authorized editors share all newsletters.
- Whether to accept the proposed full-revision-per-committed-autosave policy; revision retention, archive/restore policy, recovery-data retention, and the save-receipt retry/retention window. Decide before finalizing Phase 4 schema/write behavior.
- AWS hosting, secret delivery, and CI/CD standards selected by WSU. The application starts a portable Node process on `PORT`, so AWS packaging can follow WSU's selected host.

These are implementation inputs. The application can establish the module boundaries and document model without assuming unverified tenant settings or provisioning services during this planning task.

## References

### Current editor source

- [Editable newsletter model](../../types/newsletter.ts)
- Editor loading, template, import, and export flows: `app/page.tsx` at the time (the single-user editor, removed October 30, 2026)
- [Current browser autosave and undo/redo](../../app/hooks/useNewsletterState.ts)
- [Preview iframe](../../components/PreviewPanel.tsx)
- [Tiptap rich-text and raw code view](../../components/TiptapEditor.tsx)
- [HTML renderer](../../lib/email-templates.ts)
- [Renderer-owned Slate link constants](../../lib/config.ts)
- Import and export handlers: `app/api/import/route.ts` and `app/api/export/route.ts` at the time (removed October 30, 2026; shared drafts use `app/api/newsletters/import/route.ts` and `app/api/newsletters/[id]/export/route.ts`)
- [Package scripts and dependencies](../../package.json)
- [Current hosting/start instructions](../../README.md) and [React Strict Mode configuration](../../next.config.js)

### Smartsheet Viewer source reviewed at the Okta commit

- [Okta PR #16](https://github.com/gcrouch-wsu/wsu-gradschool-smartsheet-viewer/pull/16)
- [OIDC, PKCE, token validation, and logout helpers](https://github.com/gcrouch-wsu/wsu-gradschool-smartsheet-viewer/blob/9ec860d457610f8964cb9c8ed829de31bfd8b328/src/lib/okta/oidc.ts)
- [Short-lived sign-in state cookie](https://github.com/gcrouch-wsu/wsu-gradschool-smartsheet-viewer/blob/9ec860d457610f8964cb9c8ed829de31bfd8b328/src/lib/okta/state.ts)
- [Account mapping and session issuance](https://github.com/gcrouch-wsu/wsu-gradschool-smartsheet-viewer/blob/9ec860d457610f8964cb9c8ed829de31bfd8b328/src/lib/okta/issue-session.ts)
- [Registered callback](https://github.com/gcrouch-wsu/wsu-gradschool-smartsheet-viewer/blob/9ec860d457610f8964cb9c8ed829de31bfd8b328/src/app/authorization-code/callback/route.ts)
- [Okta logout and cookie cleanup](https://github.com/gcrouch-wsu/wsu-gradschool-smartsheet-viewer/blob/9ec860d457610f8964cb9c8ed829de31bfd8b328/src/app/api/auth/okta/logout/route.ts)
- [Okta configuration](https://github.com/gcrouch-wsu/wsu-gradschool-smartsheet-viewer/blob/9ec860d457610f8964cb9c8ed829de31bfd8b328/src/lib/okta/config.ts) and [example environment settings](https://github.com/gcrouch-wsu/wsu-gradschool-smartsheet-viewer/blob/9ec860d457610f8964cb9c8ed829de31bfd8b328/.env.example)
- [Principal resolution](https://github.com/gcrouch-wsu/wsu-gradschool-smartsheet-viewer/blob/9ec860d457610f8964cb9c8ed829de31bfd8b328/src/lib/identity/resolve.ts)
- [Existing password-login endpoint](https://github.com/gcrouch-wsu/wsu-gradschool-smartsheet-viewer/blob/9ec860d457610f8964cb9c8ed829de31bfd8b328/src/app/api/admin/session/route.ts)
- [PostgreSQL connection configuration](https://github.com/gcrouch-wsu/wsu-gradschool-smartsheet-viewer/blob/9ec860d457610f8964cb9c8ed829de31bfd8b328/src/lib/pg-connection.ts) and [migration command](https://github.com/gcrouch-wsu/wsu-gradschool-smartsheet-viewer/blob/9ec860d457610f8964cb9c8ed829de31bfd8b328/scripts/migrate.mjs)

### Knowledge Base source

Links point to the Knowledge Base repository at the commit recorded above.

- [Authentication and account validation](https://github.com/gcrouch-wsu/wsu-gradschool-kb/blob/d8158b5803459548bfb452f560cd0b1fb6d8e06a/src/lib/auth.ts)
- [Server mutation and scope guards](https://github.com/gcrouch-wsu/wsu-gradschool-kb/blob/d8158b5803459548bfb452f560cd0b1fb6d8e06a/src/lib/security.ts)
- [PostgreSQL writes, revisions, and locks](https://github.com/gcrouch-wsu/wsu-gradschool-kb/blob/d8158b5803459548bfb452f560cd0b1fb6d8e06a/src/lib/db.ts)
- [Lease route](https://github.com/gcrouch-wsu/wsu-gradschool-kb/blob/d8158b5803459548bfb452f560cd0b1fb6d8e06a/src/app/api/admin/pages/[pageId]/lock/route.ts)
- [Per-author recovery drafts](https://github.com/gcrouch-wsu/wsu-gradschool-kb/blob/d8158b5803459548bfb452f560cd0b1fb6d8e06a/src/lib/page-server-drafts.ts)
- [Editor lock heartbeat and recovery UI](https://github.com/gcrouch-wsu/wsu-gradschool-kb/blob/d8158b5803459548bfb452f560cd0b1fb6d8e06a/src/components/AdminPageEditorForm.tsx)
- [Versioned migrations](https://github.com/gcrouch-wsu/wsu-gradschool-kb/blob/d8158b5803459548bfb452f560cd0b1fb6d8e06a/src/lib/migrations/index.ts)

### Official guidance

- [Next.js authentication and server authorization](https://nextjs.org/docs/app/guides/authentication)
- [Next.js support policy](https://nextjs.org/support-policy)
- [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting)
- [Okta server-side web application redirect sign-in](https://developer.okta.com/docs/guides/sign-into-web-app-redirect/main/)
- [Neon standard PostgreSQL connections](https://neon.com/docs/connect/connect-from-any-app)
- [AWS RDS for PostgreSQL](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html)
- [MDN: session storage lifetime and copying from an opener](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage)

References record the design reviewed on October 20, 2026. Recheck provider/library documentation and the Okta PR's status when implementation begins. Live Okta, AWS, and database behavior remains to be verified.
