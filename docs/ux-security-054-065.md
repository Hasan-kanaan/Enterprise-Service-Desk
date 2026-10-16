# ISS-054 through ISS-065: UX and private attachments

Implementation started 2026-10-16; verification continued 2026-10-17.
This report covers this focused batch, not the final repository regression.

## Preserved starting work

Branch: `development`. Starting HEAD:
`90e45936743300dc6c398cf08262bc677b81bfc7`.
[The pre-edit inventory](iss-054-065-baseline.json) records every modified and
untracked file. The Manager analytics implementation, its registered routes/module,
privacy review, exact serialized-response allowlists and authorization tests were
preserved. Analytics SQL, response contract, range validation, query caps and
security boundaries are unchanged. No reset, stash, commit or push was performed.

## Organization: ISS-054 and ISS-055

The admin-only purpose-specific Team people endpoint now returns a cursor page
(`items`, `hasMore`, `nextCursor`), rather than an array. Each page contains at
most 20 `{id, displayName}` records, including blank search. ID-descending keyset
pagination reuses existing strict cursor validation; literal, bounded display-name
search narrows the eligibility predicate. There is no company-wide `/users` fetch
for these selectors and no email, phone, activation, session or specialty fields.

| Relationship | Candidates and behavior |
| --- | --- |
| Add member | Active, activated AGENT accounts outside this Team; immediately visible first page, search and Load more. No Unassigned choice. Native radio selection supports keyboard navigation. |
| Assign Team Lead | Active, activated AGENT members of this Team who lead no other Team. Existing one-led-team and mutation rechecks remain. |
| Assign TeamManager | Active, activated MANAGER accounts, independently selected; membership is unnecessary. TeamManager remains organizational only. |

Team specialties use a compact section heading and restrained rows with secondary
removal controls. Copy distinguishes Team coverage from individual Agent
specialties and states that links grant neither ticket authority nor membership.
Disabled Add specialty explains archival or exhausted eligible choices. Existing
link retention/removal and active-Team/active-Specialty addition rules are unchanged.

## Analytics: ISS-056 through ISS-058

The compact activity toolbar retains the 7/30/90-day backend contract and URL
selection, displays a human-readable UTC date range, and removes the large bordered
Refresh container. The explanation explicitly describes aggregates and excludes
individual performance metrics.

The lightweight CSS donut presents only NEW, ASSIGNED, IN_PROGRESS,
WAITING_FOR_EMPLOYEE and BLOCKED. An always-visible semantic table supplies labels,
exact counts and percentages rounded to one decimal place, independently of color.
With zero open tickets the neutral ring and zero counts remain, percentages show
an em dash, and an explicit explanation replaces fictional shares. Resolved,
closed and cancelled tickets never enter the composition. Manager analytics says
“Waiting for employee”; requester-specific wording and persisted enums are intact.

## Ticket workflow: ISS-059, ISS-060 and ISS-062

Backend action hints alone determine primary actions. The shared-intake banner
contains the single prominent Take responsibility button; permitted status and
reopen actions appear near the header. Duplicate lifecycle controls were removed
from the lower sidebar. Assignment/transfer controls remain under responsibility.

The canonical URL remains `/work/tickets/:id`. Router state carries only the
allowlisted origin enum `intake`, `mine` or `team`, with no ticket content, names or
credentials. Sidebar current-page semantics, breadcrumb and Back link follow that
origin. Successful claiming replaces it with `mine`. Direct deep links use a
neutral Support workspace context and do not highlight owned work. Origin never
grants authority or changes ownership. Error-state Back navigation follows the same
rule. No new localStorage/sessionStorage persistence was introduced.

Shared ticket-detail styles distinguish the page title, section headings, body,
metadata, helper text and timeline/empty annotations through weight, spacing,
size and existing theme colors. Attachment cards, compact headers and people
results reuse the existing CSS variables, panels, dialogs and focus conventions.

## Complete Refresh-control inventory: ISS-061

| Previous visible control | Classification and replacement |
| --- | --- |
| Analytics: Refresh | Removed as routine; route/range load and focus/pageshow revalidation. |
| My Requests: Refresh tickets | Removed as routine; route/filter load, writes and revalidation. |
| Request detail: Refresh | Removed as routine; initial load, successful changes and revalidation. |
| Support lists: Refresh workspace | Removed as routine; route/filter load, writes and revalidation. |
| Support ticket: Refresh ticket | Removed as routine; authorized snapshot reload after writes and revalidation. |
| Subtask: Refresh subtask | Removed as routine; route load, writes and revalidation. |
| Accounts: Refresh accounts | Removed as routine; route/filter load, mutations and revalidation. |
| Organization: Refresh organization | Removed as routine; route load, mutations and revalidation. |
| Ticket configuration: Refresh configuration | Removed as routine; route load, mutations and revalidation. |
| Notifications: Refresh notifications | Removed as routine; opening the bell, existing ticket-mutation events, read mutations and revalidation. |
| Conversation: Refresh conversation | Removed as routine; route load, retained mutation integration, parent changes and revalidation. |
| Internal notes: Refresh notes | Removed as routine; same authorized communication lifecycle. |
| ErrorState / list continuation / session Retry or Try again | Retained: actual failed loads, failed continuation or session recovery. |
| Reload ticket / Reload administration / operation-conflict recovery | Retained: actual conflicts, obsolete eligibility or lost authority; no automatic write replay. |
| Refreshing… status | Retained: noninteractive feedback, not a refresh control. |

No specialized business Refresh action was found. No routine Refresh button is
retained. Shared resource/list hooks revalidate only on visible-page focus/pageshow,
coalescing event bursts for two seconds and avoiding overlap with active loads.
There is no interval polling, SSE, WebSocket or automatic failure-retry loop.
Existing content remains during same-resource loading where possible; existing
error/retry UI handles failures, and authorization failures discard stale data.

## Attachments: ISS-063 and ISS-065

Cards identify file type, filename and binary-unit size, with Download and existing
eligible deletion actions. PNG/JPEG/WebP previews and MP4/WebM players load only
after an explicit Preview action. No attachment bytes are prefetched on page load.
Image display is bounded; videos use native controls, `preload="metadata"` and no
autoplay. Unsupported browser decoding falls back to a Download explanation.

Both Preview and Download call the existing authenticated
`GET /tickets/attachments/:id/download` endpoint. Preview creates a temporary Blob
URL only after checking the returned MIME and size. Aborted requests cannot create
late URLs. Hiding/unmounting, page departure or focus cleanup releases preview
URLs; Download URLs expire after use. There is no new preview endpoint, public URL,
signed storage URL, bucket path, iframe or executable inline document rendering.

The existing backend still rechecks parent visibility, internal-note support
authority and tombstones before reading storage. Admin roles, historical-only
participation, unrelated requesters and guessed IDs do not acquire access. Current
collaborators lose subsequent download/preview access when their relationship
ends. Bytes already delivered to an authorized browser cannot be retroactively
recalled; new reads always reauthorize. Storage keys stay randomized and private;
storage adapters, checksums, create-only cloud uploads and cleanup are unchanged.

Downloads retain safe encoded attachment disposition, `nosniff`,
`Cache-Control: private, no-store` and sandbox/default-src-none CSP. Object URLs
are browser-local and are not storage object URLs.

| Limit | Server-enforced value |
| --- | --- |
| Non-video file | 10 MiB (10,485,760 bytes), inclusive |
| MP4/WebM file | 25 MiB (26,214,400 bytes), inclusive |
| Attachment count | 5 per parent creation |
| Aggregate attachment payload | 50 MiB (52,428,800 bytes), inclusive |
| Multipart fields/parts | One JSON payload up to 64 KiB; six parts maximum |

The Multer storage adapter counts actual file-stream chunks across each request,
rejecting per-file or aggregate overflow before buffering all requested videos.
Service validation repeats count and actual-byte limits before storage/DB work.
Extension, exact video MIME (`video/mp4` or `video/webm`) and container structure
must agree; generic octet-stream video claims are rejected. Existing non-video
screening and CSV restrictions remain intact.

MP4 screening bounds box lengths/counts, requires ftyp/moov/mdat, recognized MP4
brands, movie/track/media headers, a video handler, visual sample dimensions and
codec configuration, sample byte counts and chunk offsets inside media data.
External URL/URN media references are rejected. Supported video sample entries are
AVC, VP9 and AV1, with AAC/Opus audio. WebM screening bounds EBML identifiers,
variable lengths and element counts, requires WebM DocType, Segment information,
Tracks, valid video dimensions, approved VP8/VP9/AV1 tracks, Cluster timecodes and
video blocks. Unknown-length Segment is supported; unknown-length nested elements,
fragmented MP4, alternate tracks and unrecognized structures fail conservatively.
This is bounded format screening, not full codec decoding or malware scanning.

Container references: [MP4RA box registry](https://mp4ra.org/registered-types/boxes)
and [WebM container guidelines](https://www.webmproject.org/docs/container/).
No media-processing dependency, FFmpeg, native transcoder or uploaded-file process
execution was introduced. Browser-encoded test evidence is generated from a plain
colored canvas using browser APIs, not from user files.

### Required migration

The existing PostgreSQL `Attachment_size` CHECK capped every record at 10 MiB.
Migration `20261016180000_video_attachment_limits` changes only that constraint to
allow 25 MiB for canonical video MIME types and retains 10 MiB for everything else.
No model, relationship, index or speculative schema change was made. It was applied
only to local `eds_stabilization_test`; normal development deployment remains
pending. Apply it with the existing Prisma migrate-deploy workflow before testing
videos larger than 10 MiB against another database. No development reset/seed/db
push or GCS setup was performed.

## Browser persistent-storage audit: ISS-064

The actual key is **`service-desk:auth:v1`**, including the colon after `desk`.
There is no application key named `service-deskauth:v1` in source.

Its `id` is a fresh `crypto.randomUUID()` created by
`SessionCoordinator.publish()` for each coordination revision. It is neither
User.id nor UserSession.id, a JWT, a refresh token or a server-issued session
identifier. `kind` is `session`, `out`, `pending` or `network`; only `network` adds
a two-second numeric `until` deadline. `read()`, `sync()`, storage-event handling,
cookie-operation serialization, stale-broadcast rejection and Axios's local
revision comparisons consume it. It is never sent to the backend as authentication.

Reading that value grants no server capability. AuthGuard requires a verified
signed JWT plus a live active user/session, and refresh requires the HttpOnly
cookie. A random revision supplied as a Bearer token is explicitly denied in the
HTTP regression. Changing coordination metadata can disturb same-origin UI
coordination but cannot authenticate. An arbitrary script already running on the
trusted app origin can access memory and the live BroadcastChannel; the channel
is not a boundary against same-origin script execution.

| Application-owned facility | Observed use |
| --- | --- |
| localStorage `service-desk:auth:v1` | Minimal non-secret revision/state/deadline described above. |
| localStorage `service-desk:auth:v1:probe` | Temporary literal `1`, immediately removed, to check usable coordination storage. |
| localStorage `kino-theme` | Only `light` or `dark`; absent preference follows the system. Read by theme initialization and the theme hook. |
| sessionStorage | No application writes. |
| IndexedDB | No application databases or usage. |
| Cache Storage/service worker | No application caches or service-worker persistence. |
| BroadcastChannel | Transient access-token/user snapshot handoff between same-origin tabs, without durable persistence. |
| Redux/module/component memory | Access token, request draft, communication draft and selected files only in memory. |
| Refresh cookie | HttpOnly; token unavailable to JavaScript. |

Source search includes `client/src` and `client/public`, auth/API coordination,
Redux draft ownership, attachment handling and theme initialization. Browser
tests inspect both storage snapshots and intercepted individual `setItem` writes,
with an exact key/value-shape allowlist, plus IndexedDB/cache inventories and
JavaScript-visible cookies. They exercise private request/message/file drafts and
multi-tab login/refresh/logout/account replacement. No credentials, reset or
activation tokens, PII, ticket content/metadata, message/note content, attachment
bytes/private URLs or AI data are persisted by the application. New Request drafts
remain non-durable and retain their existing clear-on-logout/account-change rules.
Untraced browser/extension/third-party storage is not attributed to this app.

## Verification and limits

All final targeted checks passed. This is not a final full repository regression.

| Check | Final result |
| --- | --- |
| Server lint / typecheck / build | Passed all three commands. |
| Client lint / production build | Passed both commands. |
| Prisma validate / generate | Passed. Necessary size-constraint migration deployed only to `eds_stabilization_test`. |
| Focused server unit suites | 8 suites, 145 tests passed. |
| Focused PostgreSQL suites | 6 distinct suites, 257 distinct tests passed across the runs below. |
| Browser harnesses/modes | 84 PASS groups across 12 focused invocations; no failed final invocation. |
| Live analytics browser privacy review | Additional real-API payload/no-store verification and the existing UI assertions passed within the PostgreSQL suite. |
| Repository whitespace check | `git diff --check` passed. |

Unit command:

```powershell
pnpm.cmd --dir server test --runInBand video-validation attachment-storage organization.service auth.guard auth.service ticket-authorization ticket-visibility analytics
```

The PostgreSQL aggregate run passed 241 tests in `attachments.e2e-spec.ts`,
`organization-maintenance.e2e-spec.ts`, `list-scale.e2e-spec.ts`,
`tickets-authorization.e2e-spec.ts` and `analytics.e2e-spec.ts`, with two optional
analytics tests initially skipped. `account-security.e2e-spec.ts` separately passed
14 tests. The final analytics rerun enabled `ANALYTICS_BROWSER_REVIEW=1` and
`ANALYTICS_SCALE=1`, passing all 39 analytics tests and filling those two skips.
Thus 257 distinct PostgreSQL tests passed, without double-counting reruns. The final
attachment rerun passed all 26 tests, including actual playable video evidence and
external-media-reference rejection. Test DB URLs were checked for localhost and
redirected to the isolated `_test` database; no development data reset was used.

Browser commands run from the repository root after building the client:

| Command | PASS groups |
| --- | ---: |
| `node client/test/employee-flow.mjs` | 23 |
| `node client/test/employee-flow.mjs --request-followup` | 1 |
| `node client/test/operations-flow.mjs` | 19 |
| `node client/test/operations-flow.mjs --ui-polish` | 2 |
| `node client/test/operations-flow.mjs --analytics` | 5 |
| `node client/test/administration-flow.mjs` | 8 |
| `node client/test/administration-flow.mjs --organization-maintenance` | 2 |
| `node client/test/administration-flow.mjs --ticket-configuration` | 2 |
| `node client/test/administration-flow.mjs --manual-polish` | 2 |
| `node client/test/administration-flow.mjs --account-directory` | 3 |
| `node client/test/administration-flow.mjs --loading-feedback` | 1 |
| `node client/test/session-flow.mjs` | 16 |

The browser checks cover native-radio keyboard selection and bounded pagination;
mobile/tablet/desktop and light/dark surfaces; Intake/current-page semantics and
claim-to-My-Work navigation; exact status counts/shares and empty analytics;
retained DOM and coalesced focus events; requester draft/conflict recovery;
actual Chromium-encoded MP4/WebM metadata; lazy authorized preview/error paths,
Blob cleanup and keyboard controls; and multi-tab storage/session behavior.
Desktop and mobile support-detail screenshots were also visually inspected.

Earlier requester runs exposed test assumptions that still used routine Refresh
to clear a conflict. Those flows now explicitly use the retained Reload ticket
recovery, and the full focused requester mode passed. The video test generator
was changed from header-only headless MediaRecorder output to real WebCodecs
frames; both formats now load metadata in the browser and pass the backend.
An intermittent session harness startup failure passed on rerun without loosening
assertions. Browser execution required local Chrome outside the sandbox; a prior
automatic approval usage-limit interruption was resolved after the user's Continue.
There are no remaining failed final targeted checks.

Manual screen-reader certification and non-Chromium playback testing are not
claimed. Codec support varies by browser. Container validation is intentionally
conservative, rejects some legitimate container variants, and does not establish
malware safety. Previews fetch one complete bounded file after user action;
HTTP range streaming is not added. The existing PostgreSQL driver emitted a
query-concurrency deprecation notice during analytics scale verification; the
suite passed and no dependency change was made.

## Exact changed-file inventory and final repository state

The table below lists this batch's 58 files. "Amended existing work" identifies
files already dirty/untracked in the saved baseline that this batch also edited;
all their intentional analytics work was preserved. "Modified" means a previously
tracked clean file; "New" means newly created in this batch. Paths are relative to
the repository root.

| File | Batch treatment |
| --- | --- |
| `README.md` | Amended existing work |
| `client/src/analytics.css` | Amended existing work |
| `client/src/components/AttachmentCard.tsx` | New |
| `client/src/components/Attachments.tsx` | Modified |
| `client/src/components/NotificationBell.tsx` | Modified |
| `client/src/components/OpenStatusChart.tsx` | New |
| `client/src/components/OrganizationForms.tsx` | Modified |
| `client/src/components/OrganizationPeoplePicker.tsx` | New |
| `client/src/components/SpecialtyLinks.tsx` | Modified |
| `client/src/components/TicketCommunication.tsx` | Modified |
| `client/src/components/TicketUI.tsx` | Modified |
| `client/src/hooks/usePagedList.ts` | Modified |
| `client/src/hooks/useResource.ts` | Modified |
| `client/src/hooks/useRevalidation.ts` | New |
| `client/src/layouts/AppLayout.tsx` | Amended existing work |
| `client/src/pages/AnalyticsPage.tsx` | Amended existing work |
| `client/src/pages/EmployeeTicketPage.tsx` | Modified |
| `client/src/pages/EmployeeTicketsPage.tsx` | Modified |
| `client/src/pages/OperationalTicketPage.tsx` | Modified |
| `client/src/pages/OperationalWorkspacePage.tsx` | Modified |
| `client/src/pages/OrganizationPage.tsx` | Modified |
| `client/src/pages/SubtaskPage.tsx` | Modified |
| `client/src/pages/TicketConfigurationPage.tsx` | Modified |
| `client/src/pages/UsersPage.tsx` | Modified |
| `client/src/services/attachments.service.ts` | Modified |
| `client/src/tickets.css` | Modified |
| `client/src/types/workNavigation.ts` | New |
| `client/test/account-directory.mjs` | Modified |
| `client/test/administration-flow.mjs` | Modified |
| `client/test/analytics-browser.mjs` | Amended existing work |
| `client/test/attachment-preview.mjs` | New |
| `client/test/employee-flow.mjs` | Modified |
| `client/test/loading-feedback.mjs` | Modified |
| `client/test/manual-polish.mjs` | Modified |
| `client/test/operations-flow.mjs` | Amended existing work |
| `client/test/request-followup.mjs` | Modified |
| `client/test/revalidation.mjs` | New |
| `client/test/session-flow.mjs` | Modified |
| `client/test/storage-audit.mjs` | New |
| `client/test/ui-polish.mjs` | Modified |
| `docs/decision.md` | Amended existing work |
| `docs/frontend-polish.md` | Modified |
| `docs/iss-054-065-baseline.json` | New |
| `docs/service-analytics.md` | Amended existing work |
| `docs/ux-security-054-065.md` | New |
| `server/prisma/migrations/20261016180000_video_attachment_limits/migration.sql` | New |
| `server/src/organization/organization.service.ts` | Modified |
| `server/src/tickets/attachment-storage.ts` | Modified |
| `server/src/tickets/attachment-upload.interceptor.ts` | Modified |
| `server/src/tickets/video-validation.spec.ts` | New |
| `server/src/tickets/video-validation.ts` | New |
| `server/test/attachments.e2e-spec.ts` | Modified |
| `server/test/fixtures/README.md` | New |
| `server/test/fixtures/browser-evidence.mp4` | New |
| `server/test/fixtures/browser-evidence.webm` | New |
| `server/test/list-scale.e2e-spec.ts` | Modified |
| `server/test/video-fixtures.ts` | New |
| `status.md` | Amended existing work |

These 12 other preexisting dirty/untracked analytics files remain present and
were not edited by this batch:

- `client/src/routes/AppRoutes.tsx`
- `client/src/services/analytics.service.ts`
- `client/src/types/analytics.ts`
- `docs/analytics-privacy-review.md`
- `server/src/analytics/analytics.controller.ts`
- `server/src/analytics/analytics.dto.ts`
- `server/src/analytics/analytics.module.ts`
- `server/src/analytics/analytics.query.ts`
- `server/src/analytics/analytics.service.spec.ts`
- `server/src/analytics/analytics.service.ts`
- `server/src/app.module.ts`
- `server/test/analytics.e2e-spec.ts`

Final branch is `development`; HEAD remains
`90e45936743300dc6c398cf08262bc677b81bfc7`. The combined working tree contains
39 modified tracked files and 31 untracked files (70 files including preserved
analytics work). The index is empty: all intended changes are unstaged. Ignored
local verification logs are not part of this inventory. No package manifest or
lockfile changed and no media-processing dependency was added.

Documentation updates are README, status, decisions, frontend polish, service
analytics, this security/completion report, the saved starting inventory and the
video fixture provenance note. Historical entries were retained.

No commit, push, reset, stash, GCS provisioning/setup, AI integration or final full
repository regression occurred.

**ISS-054 through ISS-065 are implemented without expanding ticket, user-record,
storage, or support authority.**
