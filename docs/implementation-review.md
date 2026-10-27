# Implementation review: newsletter workflow and AI editing

This describes the newsletter workflow and AI editing on `development`. `scripts/reset-password.mjs` is an unrelated untracked file and was left untouched. Production databases, authentication, and applied migrations 001–003 were not modified.

## Staff workflow

1. An editor opens `/newsletters`, filters by Active or Archived, template (All types, Friday Focus, Briefing, or Slate Campaign), and title text. The filters combine. Clear filters restores the unfiltered list. Empty and failed loads are stated in the page.
2. New drafts get an editable issue title and issue date, defaulting to today's date in `America/Los_Angeles`. The email heading stays the template name (`Friday Focus Newsletter`, `Graduate School Briefing`, or `Graduate School Slate Campaign`). The library shows the issue title, the template, the last editor, and the save time separately. Existing rows keep their stored titles. The migration does not invent issue dates from old titles or timestamps.
3. The holder marks the saved draft Ready for Slate or returns it to Draft. Ready for Slate is a human review choice. It does not mean validation, accessibility, or AI checks passed.
4. Mark as sent via Slate saves any pending edits first, then records the actor, time, and the exact saved document. Copy and export never change progress.
5. Later edits show Changed since sent. The recorded snapshot stays available at `/newsletters/[id]/sent` and through its HTML download. That page is the marked version, not a claim that Slate delivered it or that the current draft is what recipients received.
6. Archive still only controls whether the draft appears in the working library. Sent and Archived are independent.
7. Duplicate for next issue works on active and archived drafts. It asks for an issue title, creates a new id, copies the template and content, and opens the new Draft. Holds, sent and ready records, recovery drafts, and save receipts are not copied. The source and its history stay as they were. A repeated request with the same client request id returns the same copy.

## Persistence

`migrations/004_issue_progress.sql` is additive:

- `newsletters.progress` defaults to `draft` (`draft`, `ready`, or `sent`).
- `newsletters.issue_date` and `newsletters.source_newsletter_id` (no foreign key, so the source can be purged).
- `newsletter_sent_marks` stores each explicit sent snapshot, version, actor, and time. The latest row is the recorded sent version. Older rows remain.
- `newsletter_duplicate_receipts` keys idempotency by source id plus client request id.
- `newsletter_progress_receipts` acknowledges retries against the same actor and base version without recording another sent snapshot or incrementing the version again.
- `ai_usage_events` and `ai_inflight` support the shared usage limit.

Progress is database metadata. It is not part of the newsletter JSON. Importing HTML or JSON always creates `progress = draft` and does not import a sent record. `normalizeNewsletter` omits an empty `issue` and an unset `content_origin`, so existing document fingerprints stay stable.

Sent comparison uses the document fingerprint, not `save_version`. A progress-only update bumps the version and does not by itself show Changed since sent. Saving the recorded content again, including through Undo, clears Changed since sent. The editor keeps the sent document’s canonical form, including after resume and takeover, so the header clears as soon as Undo restores that document. It does not wait for the undo save, and a late save response for the edited snapshot cannot turn the indicator back on. Lease resume and takeover refresh progress, sent metadata, and that canonical. Purging an archived draft also deletes its sent marks, progress receipts, and duplicate receipts inside the existing lock, then writes the purge audit row.

## AI assistance

`style.md` is the shared Graduate School guide (version 1.1). It is not an author profile. The server reads it from the project root. The production file trace for `/api/newsletters/[id]/ai` includes `style.md`.

Actions, all optional and explicit:

- Selected-story clarity and house style.
- Shorten the selected story without dropping facts, qualifications, or conditions.
- Headline suggestions.
- Preheader suggestions.
- A whole-newsletter review checklist. It does not rewrite the document.

Generating a suggestion does not change or save the draft. Apply suggestion writes one undoable editor update and then uses the existing autosave. Try again and Discard leave the draft unchanged. Contributed stories keep their voice unless Apply full house style is checked. Graduate School writing uses the formal guide, including no contractions. Review findings name the section, card, and field.

Provider calls stay in `lib/ai/provider.ts`. Context, validation, and the editor do not talk to the provider directly. The route is `POST /api/newsletters/[id]/ai`. It requires an editor session, same-origin checks, a live editing lease, and the expected save version. The provider client uses the Vercel AI Gateway Chat Completions endpoint. The only added dependency is `diff`, and it compares parsed words in the suggestion dialog. Gateway settings are:

- `AI_GATEWAY_BASE_URL` optional, default `https://ai-gateway.vercel.sh/v1`
- `AI_GATEWAY_API_KEY`
- `AI_GATEWAY_MODEL` as a `provider/model` id from the gateway catalog

Missing configuration returns 503 and does not invent text. The route allows 30 seconds. The provider timeout is 20 seconds, temperature 0.2, and `max_tokens` 1500. Request bodies over 80,000 characters are rejected. The selected field is limited to 20,000 characters and is not sliced before it is sent. Serialized context over 40,000 characters is rejected: a review or preheader says the newsletter is too large to review, and a story suggestion says the story is too large to send. The provider is not called. Headline suggestions include the selected story, and preheader suggestions include newsletter content. Desktop samples, other drafts, accounts, and session data are not sent. Newsletter text is treated as data. Provider response reading stops at 100,000 bytes while streaming. A response with no stream body is rejected above 100,000 characters.

Each editor gets 30 requests per rolling hour and one in-flight request. A second concurrent request is rejected. Stale in-flight locks older than 45 seconds are cleared. Each reservation has a unique token. Releasing a reservation, and the hourly-limit cleanup inside its transaction, delete only that token, so neither can remove a newer reservation. Failed provider calls still count toward the hourly limit because the usage row is written before the call. A missing configuration does not consume the limit.

Suggestions are schema-checked. Unsafe HTML, unsupported fields, dropped URLs or Slate placeholders, and structural or layout changes are rejected. HTML still goes through the existing sanitizer. The renderer and accessibility checks remain authoritative. The response records the guide version and model. It does not store the proposal or expose credentials.

Before a suggestion is requested, pending saves are flushed. The client keeps the newsletter id, target, save version, and a canonical snapshot. Apply rechecks the live lease and save version with the server. Apply is refused if the draft, target, lease, version, or field text changed, including after typing, reordering, deletion, a progress change, or another editor taking over. Repeated imported section keys are disambiguated by position and the frozen document. The server also checks authority after generation. Discard and Escape abort the browser request; late responses cannot populate a reopened dialog. The dialog traps keyboard focus.

Suggestion comparison is display-only. The default Changes view renders the original wording with proposed edits: removed text is struck out on a light red background, added text is underlined on a light green background, and unchanged text is plain. A visible legend names both marks. Differences are word-level, with spaces kept on the neighboring word and punctuation compared separately, so one changed sentence does not strike the rest of the paragraph. A fully rewritten sentence is shown as one removed run and one added run. Side by side shows rendered Original and Proposed content, stacked on narrow screens. Headlines, preheaders, and review findings that propose replacement wording use the same comparison. Switching views does not modify or save the draft. Apply still writes the complete proposed field as one Undo step. There is no per-word accept or reject. Diff annotations never enter the saved document, preview, export, or Slate HTML.

The comparison parses sanitized HTML with the existing `sanitizeRichHtml` rules and `htmlparser2`. It does not insert raw HTML. The `diff` package compares the parsed word tokens. That is its only job.

AI output rejects unknown properties, unsafe markup, changed link and image attributes (including `src`, `alt`, and dimensions), protected table/style/heading layout, and changed `http://`, `https://`, `mailto:` text or Slate placeholders. This is structural protection, not a guarantee that generated facts are correct; the editor reviews wording before applying it. The dialog traps keyboard focus, closes on Escape, and uses 44px controls. Long comparison text wraps inside the dialog.

## Configuration

No secret values belong in the repo. Set these only in the environment that should call the gateway:

- `AI_GATEWAY_API_KEY`
- `AI_GATEWAY_MODEL`
- `AI_GATEWAY_BASE_URL` optional

This workspace does not have those variables set. Live provider behavior was not verified.

## Follow-up review

An independent pass inspected the uncommitted implementation, including the progress-receipt, lease, AI, and purge corrections. These defects were fixed:

- The editor discarded the sent-content baseline after the first saved divergence, so Undo left “Changed since sent” visible until the undo save succeeded. The baseline is now kept, and resume, takeover, and the newsletter load include the sent canonical.
- Text `http://` URLs could be rewritten. `https://` and `mailto:` were already protected, as were link and image attributes.
- A story or newsletter over the serialized context limit failed, but a non-review request used the review error text, and the selected field was still sliced. Oversized reviews and stories now fail with an action-specific message and do not call the provider.
- A provider response with no stream body skipped the size limit. Reading now stops a stream above 100,000 bytes and a body without a stream above 100,000 characters.
- The hourly-limit path deleted every in-flight row for the editor. That statement was rolled back with the reservation, and the advisory lock blocked a concurrent insert, but it now deletes only the current request token.

Progress retries, duplicate section keys, stale AI generation and Apply, cancellation, dialog focus and Escape, and transactional purge with the administrator audit row matched the intended behavior and were left in place. No live gateway request was made.

## Verification

Commands run from the repository root on October 27, 2026, after the rendered comparison. The database suite was run separately from the browser suite. The production build was run after the Playwright dev server had exited.

| Command | Result |
| --- | --- |
| `npm run check` | Exit 0 |
| `npm run lint` | Exit 0, 0 errors, 9 existing warnings in `app/admin/page.tsx` and `app/editor-page.tsx` |
| `npx vitest run --maxWorkers=1` | Exit 0. 8 files, 66 tests passed, including migration `004_issue_progress.sql` |
| `npm run test:browser` | Exit 0. 10 passed (1.2m), including `editing.spec.ts`, the workflow suite, and the three-template HTML export check |
| `npm run build` | Exit 0. Compiled, typechecked, and generated pages |
| `style.md` in `.next/server/app/api/newsletters/[id]/ai/route.js.nft.json` | Present |

Unit tests cover word changes, insertions, deletions, unchanged text, entities, punctuation, repeated words, lists, links, tables, rewritten sentences, and rejected unsafe markup, plus the earlier progress, lease, purge, and AI route checks. Browser coverage includes the rendered Changes view, keyboard switching to Side by side, stacked comparison at a 390px width, Apply saving the proposed HTML source, Undo restoring the original, and stale suggestions staying blocked. `tests/browser/library.spec.ts` runs automated WCAG checks on exported Friday Focus, Briefing, and Slate Campaign HTML. Those checks are not Slate or email-client rendering. AI tests use mocked provider responses. No paid or live gateway request was made. Live AI and Slate/email-client rendering remain unverified.

Run the database suite separately from browser tests because migration tests temporarily rewrite SQL fixtures in the checkout. Do not run `next build` while the Playwright dev server is running. Playwright output is written outside the repo (`os.tmpdir()/slate-editor-playwright`). Writing it inside the project made Turbopack rebuild and reload the local editor while the preview test was open.

## Limitations

- No live AI Gateway call was made. `AI_GATEWAY_API_KEY` and `AI_GATEWAY_MODEL` are unset here.
- The editor does not talk to Slate and does not know whether an email was delivered.
- Automated HTML checks are not a substitute for an email-client or Slate rendering test.
- AI suggestions are not stored as an audit record. The guide version and model are returned with the suggestion and shown in the dialog.
- Duplicate copies the saved document. Unsaved editor state is not copied, and duplication does not take the source lease.
- `AI_GATEWAY_MODEL` must be a current gateway model id. This change does not choose one.
- Comparison marks are not stored. Apply accepts the whole proposed field or leaves the draft unchanged.
- `scripts/reset-password.mjs` remains untracked and is not part of this work.
