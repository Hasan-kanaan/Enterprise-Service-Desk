# Authenticated visual stabilization — ISS-066 / ISS-067

Date: 2026-10-17. Starting branch: `development`. Starting HEAD:
`3426ec773a05e58ae380eb5730ffee02d6201ef7`. The starting tree was clean.
The preceding commit is preserved. This phase is left unstaged for review.

ISS-066 and ISS-067 are implemented and the authenticated application has completed
the cross-screen visual stabilization pass.

## Development migration

Before deployment, the effective `server/.env` connection was checked without
printing credentials: `NODE_ENV=development`, `localhost:5432`, database
`enterprise_service_desk`. A read-only PostgreSQL query confirmed the database;
the local Docker Compose PostgreSQL 17 service matches that identity. This is
neither `eds_stabilization_test`, demo, production nor a cloud database.

Prisma status showed 26 applied migrations and exactly one pending migration:
`20261016180000_video_attachment_limits`. The approved command succeeded:

```powershell
pnpm.cmd --dir server exec prisma migrate deploy --config prisma7.config.ts
```

After deployment:

| Check | Result |
| --- | --- |
| `prisma migrate status --config prisma7.config.ts` | All 27 repository migrations applied; current |
| `prisma validate --config prisma7.config.ts` | Pass |
| `prisma generate --config prisma7.config.ts` | Pass, Prisma Client 7.10.0 |
| `prisma migrate diff --config prisma7.config.ts --from-config-datasource --to-schema prisma/schema.prisma --exit-code` | No difference detected; exit 0 |
| Read-only `_prisma_migrations` check | 27 finished, non-rolled-back migrations |
| Read-only `pg_constraint` check | `Attachment_size` validated; MP4/WebM 26,214,400 bytes, other files 10,485,760 bytes |

Each Prisma command above ran through `pnpm.cmd --dir server exec`.
The explicit CHECK query supplements Prisma's schema diff for migration-owned SQL.
No reset, seed, db push, migration SQL edit, data repair or destructive smoke data
was used. No server source, schema, migration or API contract changed.

## Visual findings and disposition

| Finding | Disposition |
| --- | --- |
| Work History always displayed opposite-edge Previous/Page 1/Next, even when empty | **Fixed (ISS-066):** shared compact `Pagination`; no footer on empty/single first pages; previous/next remain together on multi-page results. Page > 1 retains Previous even if concurrent data changes leave that page empty, so users can return. |
| History filter/page state disappeared on navigation | **Fixed:** existing page-based API remains, with contribution/date/page query state and browser back/forward. Changing a filter resets page only; unrelated query state is preserved. |
| History toolbar was a mostly empty bordered card | **Fixed:** unboxed, aligned controls with wrapping and full-width native date/select inputs on narrow screens. UTC bounds remain explicit. |
| Redundant workspace eyebrow repeated sidebar/breadcrumb context | **Fixed:** remove repetition across nine general pages plus Work History; retain useful request/subtask identifiers and neutral support-detail context. Duplicate breadcrumb context is omitted; the Team Lead queue describes routed Team work. Existing `.page-heading` provides the shared hierarchy; no unnecessary PageHeader wrapper. |
| Page descriptions and analytics annotations competed with content | **Fixed:** bounded 13px descriptions, stronger section headings, quieter metric labels/table headers and tabular numbers. Metadata spacing and values share existing tokens. |
| Empty lists gained a blank continuation block or meaningless end marker | **Fixed:** `ListContinuation` renders only navigation/recovery or a useful end marker after continuation. `usePagedList` exposes whether a cursor was used; its fetch/merge/retry logic is unchanged. |
| Empty states were too spacious or generic | **Fixed:** shared `EmptyState` reduced to 28px padding/10px gaps, small decorative icon and bounded explanation. History distinguishes filters from no recorded work; work queues distinguish searches/absence of led Teams; catalog names replace “records.” |
| Empty conversation repeated beginning-of-stream and no-message annotations | **Fixed:** no beginning annotation on an empty stream. Existing older-page controls and retained rows on failure remain; the ticket-history boundary/older-page control now uses the shared compact footer instead of sitting against the panel edge. |
| Support badges and status-operation choices said “Waiting for you” | **Fixed:** neutral default “Waiting for employee”; explicit requester context keeps “Waiting for you” in My Requests and requester detail. Stored enums and transitions are unchanged. |
| Subtask actions occupied full-width rows below the content | **Fixed:** primary Update and secondary parent link grouped beside the header, with existing permission conditions. Status labels use sentence case; missing Team names use “Team unavailable,” without additional lookups. |
| Raw/repeated filenames dominated attachment rows | **Fixed:** card filenames ellipsize with full title/accessibility text; small sizes use bytes and known file types use readable labels; draft Remove uses a short visible label and full filename in its accessible name. Preview/Download remain local actions with 40px mobile targets. Final screenshot review also caught the filename's intrinsic width expanding the attachment grid inside a clipped panel; a bounded grid track now keeps cards and video previews within the panel, with explicit child-containment assertions. |
| Session timestamps/metadata had equal prominence and dark-mode hardcoded helper colors | **Fixed:** shared readable date formatter, explicit browser timezone, quieter session metadata and token-based history/session helpers. Long device labels wrap. |
| Empty notification/session views displayed useless disabled bulk actions | **Fixed:** Mark all read appears only with unread records; Log out all other sessions appears only with other sessions. Current-device logout, confirmations, remote revocation and error recovery are preserved. |
| Mobile catalog Actions did not share the existing stacked-row action track | **Fixed:** Actions stays beside identity/state; Team native stretched links and account action columns remain intact. |
| Dialog footers and tabs could resist narrow wrapping | **Fixed:** fieldsets allow shrinkage, footer labels wrap, ticket tabs wrap; existing modal/drawer sizing and focus handling reused. |
| Analytics empty-period copy had an unpadded bordered wrapper | **Fixed:** use the established notice treatment. Aggregate charts/tables/privacy/7–30–90 contracts remain intact. |
| Repeated per-screen cards, drawers, lists and status colors already serve a purpose | **Intentionally retained:** existing panel radius, grouped Team sections, account drawer, status tokens and skeleton shapes; no CSS rewrite or architecture change. |
| Detailed analytics tables need horizontal room | **Intentionally retained:** keyboard-focusable labeled horizontal scroll regions; do not discard columns or invent charts. Daily `YYYY-MM-DD` labels are unambiguous UTC calendar dates, not raw developer timestamps. |
| Read-only and historical annotations, eligibility notices and disabled submit controls | **Intentionally retained:** they explain real authority, historical state or incomplete input. Existing Team selectors remain bounded and purpose-specific. |
| Deep notification route `/notifications` is an existing reserved placeholder | **Intentionally retained:** active notifications remain in the shell's authorized dialog; this pass does not introduce a new notification page. |
| Manual assistive technology, Firefox/Safari, real uploaded-media variants and native zoom | **Deferred verification:** this phase uses the existing Chromium fixture harness. No claim of accessibility certification or subjective visual perfection. |

## Route and state audit

Source review covered authenticated routes/layouts and shared controls before edits.
The added `--visual-stabilization` modes capture each representative screen at
**1440, 768 and 390 pixels, in both light and dark themes**, asserting no horizontal
page overflow. Screenshots include full document content (up to 16,000px); table
scroll regions remain intentional. CSS transitions finish before capture.

| Area | Rendered routes/states |
| --- | --- |
| Employee | `/tickets` empty/list/filtered empty; `/tickets/new`; `/tickets/142` details, conversation, history, waiting-for-requester; authorized image/MP4/WebM previews, denied preview, multiple files and long filenames |
| Manager | `/dashboard`, `/work/tickets`, `/work/intake`, `/work/tickets/143`, `/work/subtasks`, `/work/subtasks/601`, `/work-history`, `/analytics`; ticket-status dialog and search-empty queue |
| Agent | `/work/tickets`, `/work/tickets/143`, `/work/subtasks`, `/work/subtasks/601`, `/work-history` |
| Team Lead (Agent) | `/work/team`, `/work/tickets/143`, `/work/subtasks/601`, `/work-history`; Lead-specific navigation/actions and parent visibility |
| Admin / Super Admin | `/admin`, `/admin/accounts`, `/admin/organization`, `/admin/organization/teams/1`, `/admin/ticket-configuration`; Super Admin account directory, create/edit/lifecycle dialogs, Team member/Lead/Manager and coverage selectors |
| Shared | `/profile`, current/other sessions, theme controls, sidebar/drawer/breadcrumbs, notification dialog, success/error toasts, initial skeletons, recovery errors and empty states |

Existing focused modes additionally exercise analytics 7/30/90 transitions and
empty/failure/retry states; account hierarchy and lifecycle; specialty eligibility;
organization maintenance; list continuation failure with retained rows; Intake
origin; focus trapping; private media authorization and Blob cleanup; and sessions.
All fixture writes are in memory. No browser uses the live development database.

## Verification

Client commands from the repository root:

```powershell
pnpm.cmd --dir client lint
pnpm.cmd --dir client build
git diff --check
```

All pass. The production build includes TypeScript project checking and Vite
bundling (2,223 modules). Lint/build were rerun after the final attachment-grid
fix. Prisma checks and results are listed above.

The following commands ran from `client`, sequentially, using isolated Chromium
profiles and in-memory HTTP fixtures. Each final run exited 0. Counts are emitted
PASS groups, not individual assertions: **69 groups across 15 targeted runs**.

| Command | PASS groups |
| --- | ---: |
| `node test/employee-flow.mjs` | 23 |
| `node test/operations-flow.mjs` | 19 |
| `node test/operations-flow.mjs --analytics` | 5 |
| `node test/operations-flow.mjs --ui-polish` | 2 |
| `node test/employee-flow.mjs --request-followup` | 1 |
| `node test/administration-flow.mjs --ui-polish` | 2 |
| `node test/administration-flow.mjs --account-directory` | 3 |
| `node test/administration-flow.mjs --lifecycle-ux` | 1 |
| `node test/administration-flow.mjs --organization-maintenance` | 2 |
| `node test/administration-flow.mjs --ticket-configuration` | 2 |
| `node test/administration-flow.mjs --loading-feedback` | 1 |
| `node test/session-flow.mjs --visual-stabilization` | 3 |
| `node test/operations-flow.mjs --visual-stabilization` | 2 |
| `node test/administration-flow.mjs --visual-stabilization` | 1 |
| `node test/employee-flow.mjs --visual-stabilization` | 2 |

Visual evidence comprises 50 representative route/state matrices (300 PNGs),
plus an initial shell-loading screenshot, in `%TEMP%\eds-visual-066-067`.
Desktop light, tablet dark and narrow dark contact sheets were visually reviewed,
with individual/section views for pagination, long attachments/video, analytics,
ticket history, sessions and lifecycle dialogs. Both themes are captured at every
width. The final employee matrix was rerun after fixing attachment containment.
Full-page dialog captures include content below the viewport; native dialog
backdrops cover the actual viewport. These are local fixture artifacts, not
tracked application assets or screenshots of private development records.

Existing business assertions remain. Intentional label changes update only their
corresponding selectors/text expectations (sentence-case subtask status, catalog
empty-state names and accessible Remove filenames). The lifecycle mode explicitly
marks its three pending fixture accounts unactivated; the shared fixture now
defaults to activated, and its original eligibility/warning assertions are retained.
Early runs also exposed a transient Vite lazy-module fetch failure and a Windows
temporary-profile cleanup lock; successful reruns retained runtime-error checks.
The initial sandbox could not start Chromium's Page domain, so browser runs used
approved local process permissions. No failing run is counted as passing.

This is **not** the final full repository regression. No large backend suite is
needed because neither API contracts nor backend implementation changed.

## Boundaries and repository state

No business/authorization/security rules changed. The frontend consumes the same
backend projections and permission hints. Analytics remains aggregate-only;
attachment previews/downloads retain authorization and revocable Blob URLs;
no object-storage URL, expanded directory payload, sensitive browser storage or
new authority was introduced. Work History URL state contains only the existing
filter values and page, never ticket content or credentials.

No GCS setup, AI integration, commit, amend, squash, push or final full regression
occurred. `docs/decision.md` remains unchanged: this is implementation of the
approved presentation scope, with no new business decision. Historical documentation
entries remain intact.

## Exact changed-file inventory

37 modified tracked files and 3 new files; all unstaged.

Modified:

```text
README.md
client/src/analytics.css
client/src/components/AttachmentCard.tsx
client/src/components/Attachments.tsx
client/src/components/ListContinuation.tsx
client/src/components/NotificationBell.tsx
client/src/components/SessionsPanel.tsx
client/src/components/SubtaskUI.tsx
client/src/components/TicketCommunication.tsx
client/src/components/TicketHistory.tsx
client/src/components/TicketUI.tsx
client/src/hooks/usePagedList.ts
client/src/layouts/AppLayout.tsx
client/src/pages/AdministrationPage.tsx
client/src/pages/AnalyticsPage.tsx
client/src/pages/CreateTicketPage.tsx
client/src/pages/EmployeeTicketPage.tsx
client/src/pages/EmployeeTicketsPage.tsx
client/src/pages/OperationalWorkspacePage.tsx
client/src/pages/OrganizationPage.tsx
client/src/pages/ProfilePage.tsx
client/src/pages/SubtaskPage.tsx
client/src/pages/TicketConfigurationPage.tsx
client/src/pages/UsersPage.tsx
client/src/pages/WorkHistoryPage.tsx
client/src/tickets.css
client/src/types/ticketPresentation.ts
client/src/workspace.css
client/test/administration-flow.mjs
client/test/attachment-preview.mjs
client/test/employee-flow.mjs
client/test/lifecycle-ux.mjs
client/test/operations-flow.mjs
client/test/request-followup.mjs
client/test/session-flow.mjs
docs/frontend-polish.md
status.md
```

New:

```text
client/src/components/Pagination.tsx
client/test/visual-stabilization.mjs
docs/visual-stabilization-066-067.md
```

Final branch is `development`; HEAD remains
`3426ec773a05e58ae380eb5730ffee02d6201ef7`. The index is empty. No server,
lockfile, schema, migration or decision-document changes are present.
