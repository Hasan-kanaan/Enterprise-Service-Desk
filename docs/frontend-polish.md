# Frontend UI/UX polish — 2026-10-04

## Cross-screen visual stabilization: ISS-066 / ISS-067 (2026-10-17)

Work History uses a compact shared pagination footer only when navigation is
useful; filters and page state survive browser back/forward. Existing page headers,
empty states, list continuation, metadata and theme tokens now provide more
consistent hierarchy across authenticated routes. Support statuses use neutral
language, subtask actions sit beside their context, attachment filenames truncate
accessibly, and session metadata includes the browser timezone. Narrow toolbars,
catalog actions and dialog footers wrap within the existing layout system.

The [complete visual audit](visual-stabilization-066-067.md) records fixed and
retained patterns, route screenshots at desktop/tablet/mobile widths in both
themes, targeted verification and exact files. The normal development database
now has all 27 migrations, including `20261016180000_video_attachment_limits`, with
zero schema drift. Historical checkpoint results below are unchanged.

## Focused UX/security follow-up (2026-10-17)

ISS-054–065 adds bounded native-radio people results, explicit Team specialties,
a compact analytics toolbar and open-only donut with a semantic count/share table.
Ticket detail uses shared hierarchy styles and places backend-permitted primary
actions near the header. Intake origin/current-page semantics survive canonical
detail navigation; direct links stay neutral. Attachment cards offer private,
on-demand image/video previews and Download. Shared resource/list hooks replace
routine Refresh buttons with restrained focus/pageshow revalidation; real Retry
and stale Reload recovery remain. Existing panels, tokens, dialogs and theme
colors are reused. See the [complete report](ux-security-054-065.md) for the control
inventory, security boundaries, responsive/browser evidence and limitations.

## Later operational wrap-up (2026-10-16)

The final checkpoint documentation and test corrections are included in the
subsequent wrap-up commit and pushed to `origin/development`. Normal local
`enterprise_service_desk` now has all 26 migrations applied, zero Prisma drift
and seven separately verified valid unique catalog expression indexes. See the
[wrap-up results](final-followup-checkpoint.md#later-operational-wrap-up-2026-10-16).
Pending migration and no-commit/no-push statements below retain their original
checkpoint timing. No new product work or business-rule changes occurred.

## Final follow-up checkpoint (2026-10-16)

ISS-034 through ISS-053, including ISS-048, are complete and comprehensively
verified. Client lint/build, all 13 phone tests, the canonical browser command
(65 emitted PASS groups) and 21 supplementary modes (36 groups) pass. Full backend,
Prisma and production dependency gates also pass. See the
[final report](final-followup-checkpoint.md) for exact commands/counts, issue
coverage, stale-test corrections and remaining manual boundaries. PASS groups
are not individual assertion counts.

Only browser/backend test expectations and checkpoint documentation changed;
approved UX and security behavior remain. Prior follow-up implementation is
committed/pushed through `28639e4`; this checkpoint remains uncommitted and no
push was performed. Historical entries below retain their original context.
Role-testing account seeding is not outstanding product work; manager dashboards,
AI, MFA and other excluded features remain deferred. Manual assistive technology,
Firefox/Safari/native zoom and live mail rendering remain unverified.

## Requester follow-up: ISS-047/049/050/051/052/053 (2026-10-16)

New Request has concise Tag/Priority guidance, an accessible native-dialog picker
with application file counts, and memory-only non-file drafts across SPA routes.
Eligible caller-home scope defaults apply only without a draft. Requester details
can be edited in NEW/ASSIGNED; active-work states explain the conversation update
path, and stale edit rejection preserves unsaved form values until explicit reload.
Support policy and all attachment/conversation security remain independent.
See [the contract, exact files and verification](request-followup.md).

## Requester follow-up: ISS-047/049/050/051/052/053 (2026-10-16)

New Request has concise Tag/Priority guidance, an accessible native-dialog picker
with application file counts, and memory-only non-file drafts across SPA routes.
Eligible caller-home scope defaults apply only without a draft. Requester details
can be edited in NEW/ASSIGNED; active-work states explain the conversation update
path, and stale edit rejection preserves unsaved form values until explicit reload.
Support policy and all attachment/conversation security remain independent.
See [the contract, exact files and verification](request-followup.md) and
[the durable rule](decision.md#request-creation-and-requester-metadata-follow-up-2026-10-16).

## Administration refinement: ISS-042/043/045/046 (2026-10-16)

These four issues are complete; earlier dated deferrals below remain historical.
AdminDialog keeps correctable conflicts editable with draft/error retention and
immediate resubmission. Explicit concurrency/obsolete-eligibility and 403/404
recovery still offer reload. Database case-insensitive catalog uniqueness preserves
display casing, archived-name reservation and the existing Team coverage keys.

Team rows use a native stretched link over their non-action area with subtle
hover/focus treatment. Independent Actions controls do not navigate. Categories
and Tags reuse the existing ActionMenu for Rename and Archive/Reactivate, retaining
separate create actions and existing confirmation/toast/refresh behavior.

Client lint/build, two conflict-classifier tests and focused administration
refinement, organization-maintenance, team-coverage, ticket-configuration and
account-metadata browser modes pass. Backend unit/PostgreSQL and Prisma verification
also pass; see [exact commands, files, migration limits and test corrections](administration-refinement.md).
Light/dark/mobile, keyboard/focus, duplicate create/rename/coverage correction and
genuine stale recovery are covered. No completed row-striping/logout behavior was
changed. No full repository regression, commit or push. ISS-047 and ISS-049 onward,
requester/ticket creation, dashboards and role-account seeding remain deferred.

## Account lifecycle follow-up: ISS-039/040/041/044/048 (2026-10-16)

These five issues are implemented and focused-browser verified. This supersedes
only their deferral in the earlier batch below; historical verification is intact.

- Pending role-change copy explicitly says that the current activation link will
  be invalidated and the administrator must send fresh instructions afterward.
  Pending role changes remain allowed; no automatic resend was introduced.
- Specialty additions explain pending, inactive (including inactive/pending),
  non-Agent and exhausted-active-choice states. Retained/archived links are visibly
  labeled; authorized removal remains available. Eligible active verified Agents
  can add active unlinked specialties and receive the existing success feedback.
  The statement that specialties grant no ticket authority/membership remains.
- Agent/Manager role exits have compact, scoped consequence callouts with a text
  heading and decorative warning icon. Neutral transitions retain ordinary notes.
  Deactivation has a restrained distinct menu action and one role-aware callout.
  Agent deactivation retains memberships and completed/cancelled subtask assignments;
  leaving AGENT removes memberships and all current-cycle subtask assignments.
  History, completion credit and requester history remain; no replacement is chosen.
- Directory rows alternate card and subtly muted surfaces using `:nth-of-type`,
  with separate hover/focus treatment and unchanged action-column geometry.
- The current-device logout button has a decorative Lucide icon, 44px minimum
  height, restrained border/background, visible focus and full width on small
  screens. Existing confirmation and logout behavior are preserved; remote-session
  buttons and the rest of Account settings are unchanged.

Passed: client lint and TypeScript/Vite build; administration browser modes
`--lifecycle-ux`, `--identity-lifecycle`, `--account-directory`,
`--ticket-configuration` (existing specialty coverage), `--shell-profile`;
`node test/session-flow.mjs --session-ui`; and `git diff --check`.
Checks cover light/dark/mobile, authority boundaries, pending role changes,
specialty state/add/remove flows, actual cursor pagination/filter striping,
action alignment, focus, current/remote logout, cross-tab sign-out and fresh login.
All final browser runs reported no runtime errors. The first session attempt
timed out waiting for fixture UI; a retry exposed background-tab theme timing.
Foregrounding the tested tab before UI checks resolved it. Tests use isolated API
fixtures, including the existing role fixtures; no live role-testing accounts or
seeding were used. No backend files, lifecycle contracts or schema changed.

No full repository/backend regression or manual screen-reader check ran. No commit
or push. ISS-042/043/045/046/047 and ISS-049 onward, manager statistics/dashboard,
role-testing account setup, MFA and AI remain deferred. ISS-044/048 were explicit
exceptions to the request's broad ISS-042+ exclusion.

## Follow-up UX: ISS-034 through ISS-038 (2026-10-16)

Completed the focused Setup, password, public recovery and phone-input batch.
Active Setup removes circular sign-in navigation; other Setup states retain it.
Activation/reset keep accessible checklists and negative feedback, omit positive
prose and gate submit on existing password/confirmation rules. Login helper links
use restrained 13px theme-aware text, hover underline, visible focus and 44px
targets. Activation recovery explains its pending-account purpose and uses a
generic accepted-request result without promising delivery.

Phone input rejects library-confirmed overlong edits/pastes without truncation;
country recognition, national formatting, full validation, selection replacement,
deletion and optional blank remain. Country changes revalidate retained input.
See [security behavior and verification](account-security.md#follow-up-ux-iss-034-through-iss-038-2026-10-16).

Client lint/build, 13 phone tests, focused bootstrap/account-security/phone browser
modes and diff whitespace validation pass. Browser checks use API fixtures; no
live accounts were created or changed. Historical records below remain intact.
ISS-039+ and manager dashboards/statistics remain deferred. No commit or push.

## Final issue-log checkpoint (2026-10-14)

ISS-015 through ISS-033 and Batches 4A, 4B, 5A, 5B and 6 are complete and were
subsequently committed and pushed to `development` through `347b51f`. Unified
Profile/Settings, explicit themes, content-shaped initial-loading skeletons,
success/warning/error mutation feedback and account-directory finishing polish
are implemented. Email-link security and public recovery privacy are preserved.
See the [final checkpoint](../status.md#final-issue-log-checkpoint-2026-10-14)
for full regression results and remaining manual boundaries.

The dated verification records below retain their original scope and repository
state. Historical "No commit or push" statements, working-tree references and
later-batch deferrals describe the time of that verification; they do not describe
the current implementation state. Earlier shell descriptions are superseded by
Batch 5A. This checkpoint's documentation and test fixes remain uncommitted, with
no new push. The two public-auth browser modes now wait for the existing
event-driven theme update before asserting it; application code is unchanged.
The older configuration browser mode now opens the account Actions menu and
selects Manage specialties explicitly instead of assuming the first row button
opens specialties. Its existing lifecycle, link, error and authority checks remain.
Unrelated deferred roadmap work and manual verification requirements remain open.

## Account-directory finishing polish - Batch 6 (2026-10-13)

ISS-030, ISS-031 and ISS-032 are complete. This supersedes their earlier deferrals
below without changing the historical verification records.

- Account creation no longer supplies a stale-record reload callback to
  `AdminDialog`. A failed create retains its editable draft, inline error and error
  toast; the administrator can correct and resubmit. There is still one top-level
  **Refresh accounts** control. Edit/organization dialogs retain their existing
  403/404/409 reload handling, and directory initial-load errors retain retry.
- Directory state text uses **Active/Inactive · Verified/Pending verification**.
  Administrative status still comes from `status`; verification still comes only
  from `activatedAt`. API values, activation actions and eligibility are unchanged.
- Every directory row has an empty-or-populated 100px action cell. The same track
  is reserved on desktop/tablet and beside the stacked mobile identity/state.
  Empty cells have no controls, fake menu or tab stop. The SUPER_ADMIN self-row
  remains visible, and unchanged `manageableRoles` rules determine actual menus.

Changed files for this batch: `client/src/pages/UsersPage.tsx`,
`client/src/components/AccountForm.tsx`, `client/src/components/AdminDialog.tsx`,
`client/src/workspace.css`, `client/test/account-directory.mjs`,
`client/test/administration-flow.mjs`, this guide and `status.md`.
Prior batch changes in the working tree are preserved. No lasting architecture
decision changed, so this batch does not add a decision entry.

Verification from `client`: `pnpm.cmd lint`, `pnpm.cmd build`,
`node test/administration-flow.mjs --account-directory` and
`node test/administration-flow.mjs --loading-feedback` pass. Directory coverage
includes duplicate-email correction/retry, one top-level refresh, retained error
feedback, a single creation-success toast, all four state combinations, self-row
and actionable-row geometry, noninteractive placeholders, long names/emails and
1440/768/320px layouts. Batch 5B checks retain skeleton, background-refresh,
initial-error retry, light/dark, reduced-motion and mutation-feedback coverage.
An initial new test assertion matched an earlier mail warning as well as the later
success; it was scoped to success toasts and the focused mode passed on rerun.
The broader `node test/administration-flow.mjs` also passes, covering unchanged
role/authorization rules, edit/organization stale-record reloads, account mutations
and public security flows, with no runtime/console errors. Its first attempt timed
out before application startup; a subsequent run identified an old directory-text
expectation, updated to Pending verification before the passing final run.
`git diff --check` passes.

No backend, authorization, role hierarchy, self-management, auth/session, schema,
email, profile or theme behavior changed. Browser checks use API fixtures; no live
backend or backend suite was run. No new known issue in this scope; real
screen-reader validation was not performed. No commit or push.

## Loading and mutation feedback - Batch 5B (2026-10-13)

ISS-027 and ISS-033 are implemented. This entry supersedes the earlier Batch 5A
deferral of these two items; earlier verification records remain historical.

`Skeleton` supplies line, heading, avatar, control and card shapes; `SkeletonState`
composes list/table/detail/form/cards/page placeholders. `LoadingState` delegates to
these primitives. Shapes are decorative and noninteractive; a labeled status region
announces loading. Theme variables support light/dark, mobile grids collapse, and
reduced motion disables the restrained pulse.

Initial session and route loading, requester/operations summaries, ticket queues,
ticket/subtask details, communications, attachments, history, account directory,
organization/member lists, configuration, specialties, account/ticket forms and
Profile sessions use the shared skeleton system. Suspense lives inside layouts so
the authenticated shell remains visible. Existing data stays mounted on refresh;
empty/error states terminate loading and existing retries remain available. Local
button, lookup and pagination progress remains local rather than obscuring content.

Mutation audit:

| Surface | Outcome handling |
| --- | --- |
| Account create/edit, organization dialogs | Shared error toast plus inline error; existing parent success retained. Account creation owns one success or partial-delivery warning, with no service-layer toast. |
| Account activation resend | Existing success/error retained; NOT_SENT is a warning. Public recovery behavior is unchanged. |
| Ticket configuration and specialties | Added completion success; shared dialog failure handling retains inline recovery. |
| Ticket create/edit and operational actions | Existing successes retained, missing request-failure errors added; submitted selection validation uses warning plus inline guidance. |
| Messages, notes and attachment deletion | Added completed-action successes and request errors. Attachment deletion owns its toast once; downloads do not get success toasts. |
| Profile password and sessions | Submitted password validation warns with inline guidance; failed requests error; existing success and session invalidation remain. |
| Notifications | Explicit mark-read/all gets success or error; opening/navigating does not produce a success toast. |
| Login, Setup, public account security and sign-out | Existing feedback preserved; no auth or public-response changes. |

Toasts occur at explicit mutation boundaries, never a global HTTP interceptor.
Warnings are styled in both themes. Form guidance stays inline; keystrokes, filters,
navigation, theme changes, loading and local UI interactions do not toast. Existing
submission guards remain; operation dialogs now also guard synchronous repeated
submissions. No backend, API endpoint, authorization, pagination, ticket lifecycle,
session/token, email or storage contract changed.

Verification (commands run from `client`, except Git):

| Command | Result |
| --- | --- |
| `pnpm.cmd lint` | Pass |
| `pnpm.cmd build` | TypeScript/Vite pass |
| `node test/administration-flow.mjs --loading-feedback` | Pass |
| `node test/administration-flow.mjs --shell-profile` | Pass |
| `node test/administration-flow.mjs --manual-polish` | Pass |
| `node test/administration-flow.mjs` | Pass |
| `node test/employee-flow.mjs` | Pass |
| `node test/employee-flow.mjs --ui-polish` | Pass |
| `node test/session-flow.mjs --ui-polish` | Pass |
| `node test/operations-flow.mjs` | Pass on rerun; first run passed assertions but exited with a CDP Fetch.failRequest cleanup timeout. No harness change was needed. |
| `git diff --check` | Pass |

Controlled delays verify route/list placeholders, retained shell/content on refresh,
empty/error/retry transitions, reduced motion and mobile/dark rendering. Feedback
checks verify single success/error/warning outcomes, partial mail delivery, duplicate
submit protection and inline password validation. Existing acceptance exercises
role access, conflicts, paging, lifecycle, notifications, attachments and public
account-security flows. Browser checks use API fixtures and report no application
runtime/console errors. No live backend, SMTP, real screen-reader or backend suite
verification is claimed.

Batch 5B file map (prior Batch 5A files below remain preserved):

- Primitives/loading: `client/src/components/Skeleton.tsx`, `client/src/skeleton.css`,
  `TicketUI.tsx`, `SessionBootstrap.tsx`, `EditAccountForm.tsx`, `SessionsPanel.tsx`,
  `client/src/layouts/AppLayout.tsx`, `PublicLayout.tsx`, `client/src/routes/AppRoutes.tsx`.
- Pages under `client/src/pages`: `CreateTicketPage.tsx`, `EmployeeTicketPage.tsx`,
  `EmployeeTicketsPage.tsx`, `OperationalTicketPage.tsx`, `OperationalWorkspacePage.tsx`,
  `OrganizationPage.tsx`, `SubtaskPage.tsx`, `TicketConfigurationPage.tsx`,
  `UsersPage.tsx`, `WorkHistoryPage.tsx`.
- Feedback components under `client/src/components`: `AccountForm.tsx`,
  `AdminDialog.tsx`, `OperationDialog.tsx`, `Attachments.tsx`, `NotificationBell.tsx`,
  `PasswordForm.tsx`, `SpecialtyLinks.tsx`, `TicketCommunication.tsx`, `TicketForm.tsx`;
  `client/src/services/users.service.ts`, `client/src/workspace.css`.
- Tests: `client/test/loading-feedback.mjs`, `administration-flow.mjs`,
  `session-flow.mjs`, `ui-polish.mjs`. Documentation: this file, `decision.md`, `status.md`.

Batch 6 ISS-030/031/032 remains deferred: account-create failure refresh removal,
activation wording and account-row alignment. No new UI/state library, backend
changes, email changes, MFA or AI. No commit or push.

## Shell/account settings and theme - Batch 5A (2026-10-13)

ISS-015, ISS-028 and ISS-029 are implemented and focused-browser verified.
This supersedes the earlier separate topbar Profile/sidebar Settings navigation
notes below; historical verification entries remain unchanged.

- `/profile` is the canonical Account settings page. Protected `/settings` uses
  React Router `Navigate replace` to `/profile`. The existing identity display,
  password change and session controls remain, including forced-password routing.
- The topbar contains notifications, a light/dark control and an Account settings
  icon, with no repeated identity text. The sidebar identity link shows the visible
  display name and its grapheme initial; the existing neutral `Account` fallback
  is used for unexpected blank identity. Both links open `/profile`; sign-out
  remains separate. Long names truncate in the sidebar and wrap on Profile.
- `kino-theme` stores only `light` or `dark`. Missing/invalid preferences follow
  the system, including live changes. Explicit choices override system changes,
  persist across reload and synchronize through browser storage events. Storage
  failures retain a working in-memory preference. A small same-origin head script
  initializes `data-theme` before application rendering. Shared CSS variables,
  Tailwind dark variants and Sonner all use that resolved theme, including public
  pages. No theme toast, route change or reload is introduced.
- Global scrollbars use neutral tracks and subtle teal thumbs, with light/dark
  values and hover treatment. Firefox keeps native width with `scrollbar-color`;
  WebKit/Chromium use 12px scrollbars. Nested scrolling is retained; forced colors
  use system colors. Scrollbars are never hidden.

Verification (from `client`, except Git):

| Command | Result |
| --- | --- |
| `pnpm.cmd lint` | Pass |
| `pnpm.cmd build` | TypeScript/Vite pass |
| `node test/administration-flow.mjs --shell-profile` | Pass |
| `node test/administration-flow.mjs --manual-polish` | Pass |
| `node test/session-flow.mjs --ui-polish` | Pass |
| `git diff --check` | Pass |

The new shell mode covers canonical/legacy/protected routes, all five roles,
keyboard order/focus, Back/Forward, separate sign-out, identity fallback/truncation,
notification opening, theme persistence/system changes/removal/invalid values,
no extra storage fields or theme toast, public Tailwind theme application,
scrollbar width/colors and 1440/768/320px layouts/mobile drawer navigation.
Existing administration checks cover notifications, focus/dismissal, drawers,
refresh, selects, mobile/reflow and dark surfaces. Existing session checks cover
remote/current-device logout and password-field layout. Browser modes report no
runtime/console errors and use API fixtures, not live backend mutations.
Generated mobile-topbar and dark-notification screenshots were visually reviewed;
no screenshot-golden suite was introduced. Firefox scrollbar styling and assistive
technology were not tested in a real Firefox/screen-reader session.

Changed files: `client/index.html`, `client/public/theme-init.js`,
`client/src/hooks/useTheme.ts`, `client/src/components/ThemeToggle.tsx`,
`client/src/App.tsx`, `client/src/layouts/AppLayout.tsx`,
`client/src/routes/AppRoutes.tsx`, `client/src/pages/ProfilePage.tsx`,
`client/src/index.css`, `client/src/workspace.css`, `client/src/tickets.css`,
`client/test/shell-profile.mjs`, `client/test/administration-flow.mjs`,
`client/test/manual-polish.mjs`, this guide, `docs/decision.md`, `status.md`.

No backend, auth/session/token/authorization, notification behavior, organization,
ticket workflow, dependency or email changes. No backend tests were run. Batch 5B
(global skeleton/loading and mutation-toast work) and Batch 6 (account-directory
polish) remain deferred; ISS-027/030/031/032/033 are not marked complete. No commit
or push.

## Identity and navigation (2026-10-11)

Username has been removed from the Enterprise Service Desk identity model.
Email is the unique immutable login, activation and recovery identity.
displayName is the required human-readable identity shown throughout the product.
User.id remains the stable relational identity. Duplicate display names are allowed.
The UI may render a generated avatar using the first initial of displayName.
User-uploaded profile pictures are not implemented in the current phase.
The topbar identity control opens Profile.
The sidebar bottom navigation uses Settings rather than a Profile/avatar control.

The migration preserves valid names and fills only missing/blank legacy names once
from the former username (or neutral Account if that too is blank), then enforces
NOT NULL/nonblank displayName and removes the old column/index. Historical IDs,
email, sessions, roles and lifecycle remain unchanged. No runtime fallback remains.
See [identity verification](identity-model-verification.md) for the migration,
contract changes, checks and retest list. ISS-012/ISS-013 still await manual Network
evidence; their pagination/stale-response implementation was not changed.

The [2026-10-11 manual-testing follow-up](manual-ui-verification.md) records Kino
branding, notification/profile/refresh/select/toast fixes, administration drawers,
the international phone field, exact verification and remaining manual checks.

## Design and scope

The authenticated application uses neutral surfaces, one teal accent, 6px default
corners, restrained status colors, compact controls and consistent page/section
headings. Existing React/Vite/TypeScript, CSS, Lucide icons and native browser
controls remain in use. No dependencies or backend files changed.

The initial audit found oversized shell context cards, inconsistent Profile fields,
administrative action walls, missing Team ownership in the catalog, and conversation
and attachments nested under Work history. These are addressed as follows:

- A 244px persistent sidebar, 56px top bar and wide content area. My Requests is
  present for every role and visually separate from support/administration.
  Identity uses required displayName; the topbar opens Profile and sidebar bottom opens Settings. The mobile drawer uses a modal dialog with focus
  containment, Escape/backdrop dismissal, focus restoration and scroll locking.
- Shared buttons, fields, panels, notices, status badges and list rows are denser.
  `workspace.css` contains shell and page layout styles; `tickets.css` remains the
  shared control stylesheet. `ActionMenu` uses native popovers and existing buttons.
- My Requests shows category, last update, priority and status in compact rows.
  Creation retains all required scope validation, with optional tags disclosed
  separately and attachments integrated into the form.
- Both ticket details separate description, conversation, original attachments and
  work history. Category/scope/ownership live in the sidebar. Requester/support
  author labels use requester identity, and internal notes have a restrained border.
  Mobile section links keep conversation and actions reachable in long threads.
- Support queues use active navigation tabs. Ownership actions sit beside ownership,
  while lifecycle actions retain their existing permission gates. Completed/cancelled
  subtasks and work history use quiet row styling.
- Accounts use a directory with role/status/activation columns and contextual
  actions. Role-change consequences are grouped into readable lists. Team catalogs
  show coverage, Manager, Team Lead and archive state. Only active regional Teams
  without Managers receive the warning treatment. Configuration remains compact.
- Profile groups identity/company job title, password change and device sessions.
  Password fields now use shared labeled inputs. Session revocation has success
  feedback and retains existing confirmation and session semantics.
- Existing light/dark schemes and reduced-motion handling remain. Required fields,
  focus rings, skip navigation, responsive dialogs and mobile input sizes are explicit.
  The unused Vite starter `App.css` was removed.

## Preserved contracts

No role matrices, ticket permissions, lifecycle rules, routing, TeamManager/Lead
rules, specialties, archival behavior, attachment policies, notification behavior,
pagination/search, idempotency, internal-note authorization or session semantics
were changed. No AI, cloud storage, migrations, APIs, commit or push were added.
The working tree was clean at the start.

Category names come from the existing small active options catalog, once per list
screen, with an ID fallback for unavailable/archived names. Operational summaries
contain owner IDs, not person projections: rows show assignment/collaboration
context, while detail retains names. There are no per-row requests or new counts.

## Verification performed

All commands below passed from the repository root on Windows:

```powershell
pnpm.cmd --dir client build
pnpm.cmd --dir client lint
node client/test/employee-flow.mjs --ui-polish
node client/test/operations-flow.mjs --ui-polish
node client/test/administration-flow.mjs --ui-polish
node client/test/session-flow.mjs --ui-polish
node client/test/administration-flow.mjs --identity-lifecycle
node client/test/administration-flow.mjs --account-metadata
git diff --check
```

The build includes TypeScript checking. Browser modes reuse the existing isolated
API fixtures and installed Chromium, not a real database. Focused checks cover:

- Creation validation, interrupted-response retry/idempotency, message posting,
  requester-only data, waiting/resolved/closed actions and dark mode.
- Mobile drawer Tab containment, Escape focus return and backdrop dismissal;
  390px screens/dialogs and a 320px requester list.
- Manager claim, ownership popover, internal notes, subtasks and work history.
- Account hierarchy, editing, 400/404/409 recovery, duplicate-submit protection,
  role transitions, all five roles' requester navigation and managerless warnings.
- Team details/catalogs, configuration, session revocation, current-device logout
  across tabs and fresh sign-in.

The first sandboxed browser attempt timed out at CDP Page.enable; successful runs
used approved execution outside the sandbox. A mobile focus-wrap failure and a
Team-tab CSS collision found during checks were fixed and rechecked. Screenshots
were captured under the OS temp directory as `eds-polish-*.png` and visually reviewed.

No full regression suite, backend tests, browser-to-real-database integration,
Firefox/Safari run, or external accessibility audit is claimed.

## Remaining boundaries

- Owner names are not available in the existing paginated summary projection;
  rows use assignment context and detail provides names. Archived category names can
  similarly fall back to IDs in lists.
- Team membership counts and home Region/Department on Profile were not invented;
  the existing respective catalog/auth projections do not provide them.
- Native confirmation prompts for existing session/message deletion remain.
- Long catalogs retain their existing scale boundaries; this work does not add
  a new search/index/count service or virtualized component framework.
