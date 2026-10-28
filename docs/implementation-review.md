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

Suggestion comparison is display-only until Apply. The default Changes view renders word-level additions and removals in their paragraph or supported content block. Each passage has Review edit controls; clicking or tapping a marked text run, or right-clicking it, also opens its inline choices. Accept keeps the proposed wording; Pass keeps the original. Decisions remain visible through the passage controls. Reset choice clears that decision, retains focus in the choices, and never edits the newsletter. Escape first closes the choices and returns focus to Review edit; a subsequent Escape closes the AI dialog.

Side by side aligns original and proposed passages in paired columns, stacking on phones. Choices stay with each passage and scroll away with it. Replacement blocks sharing one edit ID stay in the same passage. Lists and tables retain their supported structure. Neither view uses a pinned or separately scrolling edit list. Selecting an already selected view leaves it selected; arrow keys move between views. New proposal source strings start a fresh comparison review.

The dialog widens to `max-w-6xl` after results arrive. Its instruction controls collapse under Adjust instruction and AI action. Discard remains in a persistent footer, with Apply suggestion there for a single proposal; alternatives and review findings retain their own Apply action to identify the selected result. Accepted, passed, and unreviewed counts explain that unreviewed edits are included. The chosen mix remains one editor Undo step. When no edit is passed, Apply preserves the exact proposed source string. Comparison marks never enter saved content, preview, export, or Slate HTML.

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

## Editor usability build

- The issue title identifies the draft first; the email heading appears secondarily. Change progress groups the existing progress actions and disables transitions to the current state.
- Save status, Undo, Redo, Save and finish editing, accessibility, and export stay in a sticky draft-action bar. Finish editing remains the primary action. The phone Edit draft / Preview switch stays available at the bottom and visibly indicates the selected view.
- Story and closure modals explain their local save boundary. Save story / Save closure hand the local changes to normal draft autosave. Cancel or Escape asks before discarding changed fields. Keyboard focus stays in the topmost modal and returns to the opener on close.
- Story rows wrap their titles and put actions underneath on phones. Edit has visible text. Move controls, drag grips, add actions, story-modal controls, and text-formatting buttons use larger targets. Text Undo/Redo are named distinctly from newsletter Undo/Redo.
- Common text tools stay exposed; More formatting contains headings, alignment, tables, strikethrough, and HTML view. Explicit Link and Underline extensions are retained with their duplicate StarterKit registrations disabled.
- Issue metadata appears first in Masthead. Appearance and spacing collapse in story editing. Location/date/time and link fields stack on phones, and common writing fields have accessible labels.

Lease/version guards, proposal cancellation and stale checks, contributed-voice handling, same-origin authorization, sanitization, preview isolation, and saved email rendering were preserved. No dependencies, authentication configuration, or migrations were changed.

## Editor usability follow-up

- Story and closure changes copy the affected section instead of changing it in place, so Undo now reverses Save story, Delete story, Remove story or closure, and Save closure. Previously the history snapshot already contained the change and Undo did nothing.
- New stories and closures enter the draft only on Save; Cancel leaves the newsletter unchanged. Delete moved to the bottom of the story and closure dialogs and asks first. Remove prompts now say Undo can restore the item.
- Continuous typing in one field (no pause over one second) is one Undo step.
- Version history lists saved revisions, previews one in a `sandbox=""` iframe, and Restore this version applies it through normal editor state: one Undo step, autosave, and the existing lease and version checks. Progress and sent records do not change. `GET /api/newsletters/[id]/revisions?revision=<id>` returns one normalized snapshot to editors.
- The view-only banner names the holder and recognises a draft held by the same person in a reloaded or closed tab. The lease token remains tab memory only; Take over editing is still required.
- Accessibility results stay visible after edits, are marked as possibly out of date, offer Check again, and give Open story where the issue text, link, or image appears in a story.
- A newsletter review leaves an AI review checklist on the page after the dialog closes or a finding is applied. Its Open story buttons open the referenced story. Suggested wording still applies only from a current review; whole-document staleness checks are unchanged. In review mode the dialog's Discard button is labelled Close.
- The comparison adds Next unreviewed edit, Accept all remaining, and Pass all remaining. Bulk choices fill only unreviewed edits. Try again is a secondary button once results exist.
- The preview says it is approximate, waits for a pause in typing before re-rendering, shows render errors, and offers Desktop width (600px) and Phone width (375px). Its scroll position is not preserved after a re-render: reading it would require `allow-same-origin`, which would weaken the preview isolation.
- Shared drafts list Masthead first and open, then Sections, Footer (closed), and Global Settings last. The sticky bar holds status, Undo, Redo, and the editing-authority action; Check accessibility, Version history, and Export HTML sit in a Review and export row with the suggested order.
- The library asks for an issue title and date when creating a draft (`POST /api/newsletters` accepts optional `issueTitle` and `issueDate`). Duplicate for next issue has separate title and date fields. Both use the shared dialog focus handling.
- Label changes: library Delete is now Archive (Archive draft, Undo archive, This draft is archived.). Delete permanently is unchanged. Card wording is now story wording (Add a story, Stories (n), Call to action). Section and closure field labels are associated with their inputs.
- The single-user editor at `/` (public and development modes) no longer claims the newsletter passes all accessibility checks.

## Verification

Final local verification on October 27, 2026:

| Command | Result |
| --- | --- |
| `npm run check` | Exit 0 |
| `npm run lint` | Exit 0; no errors, the same nine existing warnings |
| `npx vitest run --maxWorkers=1` | Exit 0; 8 files, 70 tests passed |
| `npm run test:browser` | Exit 0; all 12 tests passed (1.2m) |
| `npm run build` | Exit 0; compiled, typechecked, and generated pages |

Browser coverage includes long passage comparisons, mark-click and keyboard access, counts, Reset choice, nested Escape, choices scrolling away with their passage, phone stacking, unchanged source before Apply, partial acceptance, whole-field Undo, modal save/discard/focus behavior, and the existing library, takeover, recovery, session-revocation, and export flows. Screenshots of desktop and phone comparisons and the phone story modal were inspected. All three exported templates passed the existing automated WCAG checks.

Earlier browser runs exposed nested Escape handling and lost focus when Reset choice removed its own button; both were corrected before the final full pass. The fixed phone navigation also overlapped Next.js's development indicator, so the test server disables that indicator using `SLATE_BROWSER_TEST`; production behavior is unaffected. The takeover test now verifies a rejected stale API save and the disabled old tab instead of racing to type into an already disabled input. The database suite now allocates an available temporary port after the previous fixed port was found occupied; the existing process was left running.

Run database tests separately from browser tests because migration tests temporarily rewrite SQL fixtures. Run builds only after the browser dev server exits. Playwright results and screenshots remain outside the repository. AI responses were mocked; no paid/live request, credential change, commit, push, or production deployment was performed in this UX pass.

## Manual checks for the next real-use test

Automated tests cover these only in development sign-in mode with a local database. Check them by hand on a real issue:

- Send a test issue from Slate and compare it with the editor preview at desktop and phone widths. The preview is approximate.
- Sign in through the production sign-in flow (and Okta once enabled), then hand off a draft with Save and finish editing and take it over from a second account.
- Confirm staff instructions, training notes and screenshots use the current labels, including Archive instead of Delete in the library.

## Limitations

- No live AI Gateway call was made. `AI_GATEWAY_API_KEY` and `AI_GATEWAY_MODEL` are unset here.
- The editor does not talk to Slate and does not know whether an email was delivered.
- Automated HTML checks are not a substitute for an email-client or Slate rendering test.
- AI suggestions are not stored as an audit record. The guide version and model are returned with the suggestion and shown in the dialog.
- Duplicate copies the saved document. Unsaved editor state is not copied, and duplication does not take the source lease.
- `AI_GATEWAY_MODEL` must be a current gateway model id. This change does not choose one.
- Comparison marks are not stored. Apply saves the proposed source when no edit was passed, or the sanitized mix of accepted and passed edits. It is still one Undo step.
- `scripts/reset-password.mjs` remains untracked and is not part of this work.
