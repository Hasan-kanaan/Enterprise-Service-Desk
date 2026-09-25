# Project Status

Frontend and backend verification updated on 2026-09-23. [README.md](README.md) describes the project and [docs/decision.md](docs/decision.md) records architectural decisions.

## Current Phase

Persistent in-app notifications implemented on the verified routing, collaboration, communication, lifecycle and administration baseline. All work remains uncommitted; no commit or push performed.

## Persistent In-App Notifications

Email notifications are intentionally out of scope. The application uses persistent in-app notifications only.

- Small Notification table with type, recipient, nullable actor/ticket/subtask references, createdAt/readAt, restrictive FKs and recipient/time/read indexes. No sensitive content/previews. Migration `20260923150000_in_app_notifications` starts empty without historical backfill.
- Events: new primary-agent/subtask assignment, new requester/support public messages, WAITING_FOR_EMPLOYEE, RESOLVED, reopening and explicit responsible-manager transfer. Assignment no-ops/clearing, initial claims, message edits/replays and internal notes create none. Real A -> B -> A changes create separate events.
- Requester messages notify active responsible Manager, primary Agent, primary-team Lead and current-cycle collaborators once each. Completed current-cycle collaborators count; ordinary members, previous-cycle/historical or reassigned-away collaborators and inactive users do not. Support messages notify the requester.
- Employee reopening uses post-reopen Manager/Agent/Lead responsibility without old collaborators; Manager reopening notifies the requester. Intake recovery with cleared responsibility has no support recipients. Transfer notifies only the new Manager while preserving team/agent and organizational management.
- Writes share the domain mutation's Serializable transaction, with recipient status and Lead relationships checked under locks. No retries or authority changes. Injected failures verify rollback of assignment, subtask reassignment, requester message plus waiting transition, resolution, reopening and transfer.
- Recipient-only authenticated GET /notifications (latest 50), GET /notifications/unread-count (all history), PATCH /notifications/:id/read and PATCH /notifications/read-all. Read timestamps are idempotent. ACTIVE/sessionVersion rules apply; administrative roles gain no other-recipient or ticket access. No DELETE API.
- Shared bell, badge, accessible modal, minimal descriptions, date/time and read controls. Links use existing routes and authorization; old notifications remain readable after lost access. REST refresh at authenticated load, panel open, explicit refresh/read actions and successful local ticket/subtask/communication mutations. No polling or realtime delivery.
- Verification: 9 unit suites / 91 tests and 4 PostgreSQL/HTTP suites / 143 tests passed, including 28 new notification cases. Chromium: Employee 13 groups, operational 11 groups, administration 5 groups passed. An initial new browser assertion needed to wait for panel data; corrected before the full passing run. A later database run found the existing PostgreSQL container stopped; it was restarted and the complete suite passed.
- Prisma validation/generation, backend TypeScript/Nest build, client TypeScript/Vite build and ESLint passed. Both development and isolated test databases have 12 migrations and zero schema differences; final read-only counts confirm zero notifications in both databases after fixture cleanup, with no backfill. Existing uncommitted work preserved; no dependency changes, commit or push.
- Files: `server/prisma/schema.prisma`, `server/prisma/migrations/20260923150000_in_app_notifications/migration.sql`, `server/src/app.module.ts`, `server/src/notifications/notification-events.ts`, `server/src/notifications/notifications.controller.ts`, `server/src/notifications/notifications.module.ts`, `server/src/tickets/tickets.service.ts`, `server/src/tickets/ticket-communication.service.ts`, `server/src/tickets/tickets.service.spec.ts`, `server/test/notifications.e2e-spec.ts`, `server/test/tickets-authorization.e2e-spec.ts`, `server/test/work-cycle-migration.e2e-spec.ts`, `client/src/components/NotificationBell.tsx`, `client/src/services/notifications.service.ts`, `client/src/notifications.css`, `client/src/layouts/AppLayout.tsx`, `client/src/services/api.ts`, `client/test/notification-fixture.mjs`, `client/test/employee-flow.mjs`, `client/test/operations-flow.mjs`, `client/test/administration-flow.mjs`, `README.md`, `docs/decision.md`, and `status.md`.

## Responsible Manager Primary Routing Correction

- Inspection found that the API permitted a responsible Manager to select any real team, the workspace returned all teams, and README/decision documentation explicitly allowed that behavior. Active primary-agent membership was already enforced.
- Primary assignment now requires the responsible Manager's organizational TeamManager relationship or GLOBAL team coverage. Another Manager's regional team is forbidden even when its region/specialty matches; unmanaged regional teams are also excluded. GLOBAL teams may retain their own organizational manager and use normal active AGENT membership rules.
- The API checks eligibility inside the existing serializable transaction and locks TeamManager rows against concurrent removal. The workspace uses the same eligibility predicate. The UI uses these primary choices and requires an explicit eligible selection when a retained team is no longer eligible.
- Separate subtask choices preserve cross-team delegation. Primary agents remain explicitly assigned, never derived from subtasks. Team Lead, collaborator, public-message and internal-note authorization are unchanged. Explicit responsible-manager transfer preserves team, agent and organizational management; subsequent primary-assignment writes must use the new Manager's eligible teams.
- No schema, migration, dependency, commit or push changes for this correction. Existing uncommitted communication work is preserved.
- Routing-phase verification (before notifications): TypeScript and Nest build passed; all 9 unit suites / 91 tests passed; all 3 PostgreSQL/HTTP suites / 115 tests passed (7 new routing cases, plus expanded workspace/transfer assertions). Prisma validation passed and the isolated test database has all 11 migrations applied. The first e2e run identified two test-harness expectations, corrected before the complete passing rerun.
- Frontend verification: ESLint, TypeScript and Vite build passed. Complete sequential Chromium acceptance passed: Employee 12 groups, operational 9 groups, administration 5 groups. Two sandboxed launches timed out before Page.enable; the approved run outside the sandbox passed all scenarios without runtime exceptions. Git diff whitespace check passed.
- Correction files: `server/src/tickets/ticket-authorization.service.ts`, `server/src/tickets/tickets.service.ts`, `server/src/tickets/ticket-workspace.controller.ts`, `server/src/tickets/tickets.service.spec.ts`, `server/test/tickets-authorization.e2e-spec.ts`, `client/src/components/TicketOperationForm.tsx`, `client/src/pages/OperationalTicketPage.tsx`, `client/src/types/operations.ts`, `client/test/operations-flow.mjs`, `README.md`, `docs/decision.md`, and `status.md`.

## Ticket Collaboration and Communication

- Current unfinished-cycle subtask assignees gain parent/history/conversation/internal-note access without changing explicit manager/team/primary-agent ownership. Completion preserves collaboration; last reassignment or cycle end removes it. Previous-cycle assignments and ordinary membership never grant current parent access.
- Collaborators can work their own subtasks but gain no parent metadata/status, resolve/close/reopen, routing, manager-transfer or arbitrary subtask powers. Existing independent primary-agent/lead/manager powers remain intact. Agent queues include current collaboration, and authorized standalone subtask views link to the normal parent view.
- Separate TicketMessage/TicketInternalNote models with same-ticket cycle FKs, retained authorship, bounded plain text, createdAt/editedAt and creation idempotency. Public messages are available to requesters/current support; notes only to current support. Intake managers can read conversation but must claim responsibility before posting or seeing notes. ADMIN/SUPER_ADMIN remain excluded.
- GET/POST stream endpoints and author-only PATCH endpoints implemented. Authors may edit only their own current unfinished-cycle records while authorized. No deletion or revision-history feature. Terminal and historical records remain read-only after reopening.
- Only a NEW requester message while WAITING_FOR_EMPLOYEE atomically changes the ticket to IN_PROGRESS. Support messages, notes, edits and duplicate replay never change status. Creation keys and a private request fingerprint prevent duplicate creation, including recovery after an author edit.
- Consistent-snapshot reads and serializable writes reuse ticket/user locks. Communication writes additionally lock agent assignment/team relationship rows to reject stale authority after reassignment or lead removal. Stale cycle IDs and serialization conflicts return 409; there is no silent retry or draft transfer.
- Shared responsive conversation/note UI groups work by cycle, displays author/timestamps/edited markers and exposes only permitted own-record edits. Recoverable failures retain drafts; sibling drafts survive stream refreshes. New-cycle submission requires explicit draft review. Employee responses never contain internal-note content.

## Employee Frontend

- Responsive role-aware shell, real employee dashboard, searchable/status-filtered request list, creation, detail, metadata editing, and public cycle history.
- Confirmed cancellation, closure, and reason-required reopening. Terminal edit restrictions and permanently cancelled tickets match backend behavior. Standard 409 conflicts require explicit reload; legacy invalid routing offers explicit return-to-intake recovery.
- Real catalog choices through the minimal authenticated GET /ticket-options endpoint. Only category/tag/region/department ID/name data is returned; administrative roles remain excluded. No fake IDs or default ownership.
- Session restoration on reload, single-flight refresh, Redux identity synchronization, protected deep links, local logout protection, and connection-error retry. Tokens stay in memory.
- Loading, empty, search-empty, missing-catalog, validation, 403/404, network-error, and stale-ticket states. The employee workspace now includes public conversation, with no support subtasks, internal notes or assignment controls.
- Existing classic frontend folders and installed dependencies retained. Larger route modules load on demand. The original Employee frontend phase introduced no schema, migration or dependency changes; the communication migration is documented below.

## Manager and Agent/Team Lead Frontend

- Manager dashboard, shared unowned NEW intake, current owned-ticket queue, claim, primary team/agent changes and explicit clearing, ownership transfer, metadata/status operations, closure/reopen, and authorized subtask creation/management.
- Agent dashboard/primary-assignment and collaboration queue. Metadata/status work remains independently authorized. Team Lead navigation and queues derive from the actual led-team relationship; primary agent and subtask assignment controls are scoped to that team. No cross-team or manager authority.
- Shared ticket forms/presentation/history retained. Authorized current-cycle subtasks appear separately from frozen historical work. Standalone subtask detail shows actual assignment and completedBy information without loading parent-ticket content/history. Historical participation never adds active tickets.
- GET /ticket-workspace returns caller led teams. GET /ticket-workspace/tickets/:ticketId returns existing-policy action hints and eligible choices. GET /ticket-workspace/subtasks/:subtaskId returns the limited authorized subtask with display names, lifecycle flags and choices. All are read-only, MANAGER/AGENT-only, and use existing visibility/policy logic; no general account directory or new mutation authority.
- Primary assignment choices use only the responsible Manager's organizationally managed teams or GLOBAL teams, with active eligible member agents. Separate subtask choices preserve existing delegation. Incompatible agents require explicit clearing/replacement. Standard 409 conflicts require reload; important operations use confirmation dialogs and disable submission while pending.
- Responsive layouts, loading/empty/error/retry states and protected deep links verified. No dependency, schema, migration, or backend mutation-service changes.

## Administration Frontend

- Dedicated /admin, /admin/accounts, /admin/organization, and team detail routes with administrative-only navigation. /users redirects to /admin/accounts. No administrative requests for ticket queues/details/history or support subtasks.
- Directory identity/email/role/status plus existing nullable region/department labels, search/status filters, validated account creation, and confirmed activation/deactivation. SUPER_ADMIN creation supports ADMIN/MANAGER/AGENT/EMPLOYEE after the user's explicit approval of the small backend matrix change; ADMIN supports MANAGER/AGENT/EMPLOYEE. No SUPER_ADMIN creation/deactivation or delete-user control.
- Deactivation confirmation explains existing offboarding without operational previews or replacement choices. Reactivation does not restore sessions/responsibilities. Successful mutations reload account status. Protected account creation participates in shared 401 recovery.
- List/create regions, departments and specialties; list/create REGION/GLOBAL teams; view team details; add/remove AGENT membership; assign/replace/remove Team Lead; assign/remove organizational TeamManager. Existing specialty links are displayed only. Active eligibility, one-led-team restriction, member/lead removal ordering, and nullable assignments are respected.
- Minimal backend read additions: GET /users includes region/department id/name; GET /organization/teams includes member userId and user id/username/role/status. Existing administrative guards retained. No new endpoints, schema, migrations, dependencies, or organization mutation rules.
- Loading/empty/validation/error states, native confirmations, pending controls, explicit 403/404/409 reload, and responsive layouts. Missing rename/delete, coverage updates, specialty-link mutations, and account profile/role/home-organization editing remain deferred because the backend does not provide them.

## Implemented

- Existing account provisioning, organization administration, explicit responsible-manager ownership, shared intake, and separate ticket/subtask authorization preserved.
- UserStatus ACTIVE/INACTIVE with sessionVersion. SUPER_ADMIN manages ADMIN/MANAGER/AGENT/EMPLOYEE status; ADMIN manages MANAGER/AGENT/EMPLOYEE. No SUPER_ADMIN deactivation or user/ticket DELETE endpoints.
- Atomic administrative offboarding: active manager-owned tickets return to NEW with manager/team/agent NULL; primary-agent assignments clear only the target agent; actionable current-cycle subtasks clear only that agent; Team Lead and TeamManager responsibilities are removed without replacement.
- Historical/terminal ownership, prior-cycle subtasks, completed/cancelled work, and requester attribution remain unchanged. Offboarding returns only user ID/status and grants no service-desk visibility or ordinary ticket authority.
- Inactive login/refresh rejected. Access JWTs are checked against database status, current role, and sessionVersion. Deactivation revokes refresh tokens and invalidates existing access; reactivation requires fresh login. Refresh consumption/replacement is atomic.
- New manager/agent/subtask/Team Lead/TeamManager assignments require active eligible users. Operational mutations recheck actor status/version within their transaction.
- Explicit requester cancellation from NEW/ASSIGNED. CANCELLED is permanent. All ordinary metadata, ownership, and subtask writes freeze on RESOLVED/CLOSED/CANCELLED.
- Explicit requester/responsible-manager reopening with a required public reason and no time limit. Normal reopening preserves eligible ownership and sets IN_PROGRESS. Inactive agents clear automatically; inactive/missing managers return to empty NEW intake. Other invalid legacy routing needs explicit returnToIntake recovery.
- TicketWorkCycle ORIGINAL/REOPENED attempts with sequence, reasons, outcomes, actors, timestamps, and ending-ownership snapshots. Resolution/cancellation ends work; closure annotates that same cycle. Reopening clears current ticket resolution/closure times while preserving previous cycles.
- Required immutable Subtask.createdInCycleId with same-ticket FK, plus nullable completedById recording the actual completion actor. All old-cycle subtasks remain frozen, including unfinished work; repeating work requires a new subtask.
- Current detail includes scope/tag IDs, ownership, and latest-cycle summary. History uses current ticket visibility, including current collaboration, with independent subtask filtering. Employees receive no support subtasks. Historical subtask-only access never includes parent/history; historical participation never expands ticket visibility.
- Active/status ticket filters and currentWork subtask filters. No currentCycleId on Ticket, assignment event stream, or generic audit infrastructure.
- Serializable parent-ticket/user locking and 409 conflict mapping reused across lifecycle writes. Offboarding and ticket/cycle changes are atomic; stale requests reload and explicitly retry. Consistent-snapshot history reads.

## Migration

Twelve migrations are applied in the local development and isolated test databases. `20260923150000_in_app_notifications` adds an empty notification table, enum, indexes and restrictive references with no historical backfill. `20260923120000_ticket_communication` adds the two empty communication tables, indexes, idempotency constraints and restrictive author/same-ticket-cycle FKs. Existing users, tickets, cycles and subtasks are unchanged; no messages or notes are backfilled. The previous `20260918120000_user_lifecycle_work_cycles` migration remains unchanged.

Backfill creates one ORIGINAL cycle per existing ticket and attaches existing subtasks without changing their work data. Known timestamps are retained; unknown actors/times remain NULL. Terminal ownership is explicitly marked RECORDED_AT_MIGRATION, not falsely represented as proven ownership at resolution. No inferred managers, earlier reopenings, or replacement people were created.

The historical work-cycle backfill requires old application writers to be paused during that migration/backend switch. The communication and notification migrations are additive and must be applied before serving the new API/frontend. Existing nonterminal managerless fixtures still require explicit reconciliation; this phase does not invent historical owners or an ordinary legacy-adoption endpoint.

## Verification

- Client TypeScript/Vite production build and ESLint: passed.
- Chromium browser acceptance: passed for session restore, form payloads, edit/conflict recovery, cancel/close/reopen, history, mobile navigation/layout, deep reload, error/retry/empty states, token renewal/session rejection, and admin route exclusion. No browser runtime exceptions.
- Employee Chromium suite: thirteen scenario groups passed, including notification list/badge, mark one/all read, ticket navigation, lost-access history, mutation refresh and mobile panel, plus public posting/editing, private-note exclusion, waiting-reply behavior, preserved 503/409 drafts, explicit stale-cycle review and frozen history, plus existing lifecycle/session/mobile flows.
- Operational Chromium browser suite: eleven scenario groups passed, including Manager/Agent notification navigation and lost-access history, plus eligible managed regional/GLOBAL primary choices, exclusion of other-manager regional choices, retained ineligible-team selection, separate subtask choices, manager messages/notes, author edits, sibling-draft preservation, completed collaborator parent access and communication without primary-agent powers, plus existing Manager/Agent/Team Lead flows and errors.
- Browser profile cleanup retries were lengthened after one Windows temporary-profile lock outlasted the original retry window. The complete sequential browser rerun passed and cleaned its profiles.
- Administration Chromium browser suite: five scenario groups passed for ADMIN/SUPER_ADMIN provisioning and lifecycle matrices, all exposed organization mutations, relationship constraints, 401/403/404/409/network handling, role isolation, and mobile layout. No runtime or console errors. Employee and operational browser suites rerun and passed.
- Browser checks use isolated API fixtures; real PostgreSQL authorization/contracts are covered separately by backend e2e tests.

- Prisma schema validation and client generation: passed.
- Development and isolated-test migration status: twelve migrations applied in each; both schema diffs report no difference.
- Backend TypeScript, including tests: passed.
- Nest build: passed.
- Unit tests: nine suites, 91 tests passed, including communication validation and collaborator/support visibility predicates.
- PostgreSQL/HTTP e2e: four suites, 143 tests passed. Coverage includes notification events, recipient/privacy/read matrices, idempotency, lost access, six notification-write rollback cases, plus managed regional/GLOBAL primary routing, other-manager and unmanaged regional rejection, specialty-match rejection, active primary-team membership, retained assignments after manager transfer, concurrent TeamManager removal, collaborator gain/completion/reassignment/cycle-end/reopen boundaries, unchanged ownership/mutation powers, communication role matrix and privacy, own edits, terminal/historical freezes, idempotency before/after editing, current authorization on replay, inactive author attribution, waiting transitions, migration constraints and controlled concurrent authority/lifecycle changes. Existing account, organization, ticket and subtask regressions pass.
- E2e includes existing authorization regressions, account/session lifecycle, atomic offboarding, cancellation/freeze/reopen matrices, repeated cycles, safe history projections, historical/current-work separation, and controlled concurrent reopen/close/assignment/offboarding races.
- Migration test replays the historical schema in a private test-database schema, verifies truthful work-cycle backfill, then applies the communication and notification migrations and verifies empty tables, same-ticket cycle constraints and restrictive notification references. It rolls everything back.
- Injected database failures verify complete rollback of reopening, administrative offboarding and employee message insertion when the automatic waiting transition fails. Expected HTTP 500 errors appear in test logs; all rollback tests pass.
- Test fixtures are scoped and cleaned up. No dependency installation.
- Node experimental VM-modules and pg concurrent-query deprecation warnings remain non-failing.
- Git diff whitespace check and final scope review completed before the final report. No commit created.

## Validation Commands

From `client/`, run `pnpm lint`, `pnpm build`, then `pnpm test:browser`. Browser checks require an installed Chrome/Edge or BROWSER_PATH and a free port 3000. Equivalent existing-CLI commands are `node node_modules/eslint/bin/eslint.js .`, `node node_modules/typescript/bin/tsc -b`, `node node_modules/vite/bin/vite.js build`, `node test/employee-flow.mjs`, `node test/operations-flow.mjs`, and `node test/administration-flow.mjs`. The package browser script runs all three suites sequentially. Screenshots are written to the OS temp directory; the isolated browser profile is cleaned up.

Run from `server/` with existing dependencies. The direct local CLI invocations below avoid package-manager installation behavior:

```powershell
node node_modules/prisma/build/index.js validate --config prisma7.config.ts
node node_modules/prisma/build/index.js generate --config prisma7.config.ts
node node_modules/prisma/build/index.js migrate status --config prisma7.config.ts
node node_modules/prisma/build/index.js migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code --config prisma7.config.ts
node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit --incremental false
node node_modules/jest/bin/jest.js --runInBand --no-cache
node node_modules/@nestjs/cli/bin/nest.js build
```

Equivalent package scripts exist for `pnpm typecheck`, `pnpm test --runInBand --no-cache`, and `pnpm build`.

For database-backed tests, explicitly use a separate database whose name ends in `_test`, apply the existing migrations there, and supply TEST_DATABASE_URL:

```powershell
# Local Compose test database used for verification; development database is separate.
$env:TEST_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/eds_stabilization_test'
$env:DATABASE_URL = $env:TEST_DATABASE_URL
node node_modules/prisma/build/index.js migrate deploy --config prisma7.config.ts
node --experimental-vm-modules node_modules/jest/bin/jest.js --config ./test/jest-e2e.json --runInBand --no-cache
# pnpm test:e2e --runInBand --no-cache runs the same e2e command.
# Use a fresh shell or restore DATABASE_URL before development operations.
```

The test harness refuses an absent TEST_DATABASE_URL or a database name without `_test`. Database creation is an explicit local setup step, not an automatic test action. The Compose credentials above are development-only.

From the repository root:

```powershell
git diff --check
git status --short
```

## Remaining Roadmap

1. Attachments
2. My Work History
3. Automatic RESOLVED -> CLOSED behavior
4. General polish/stabilization
5. AI routing/recommendations

Attachments are next and are not implemented yet.

## Deferred Work and Remaining Boundaries

- Browser notifications, polling/realtime transport, generic audit infrastructure, SSO/SCIM and other optional enterprise features remain deferred. Notification history pagination, preferences, deletion and retention jobs are not implemented.
- Communication uses explicit REST refresh with no pagination, read receipts or revision history. Edits retain original authorship/time and only the latest editedAt/content. Names are current display labels for stable author IDs. Drafts are in-memory and are not promised across navigation, sign-out or a full browser reload.
- Organization master/team rename/delete, existing team coverage updates, specialty-link changes, account identity/role/home-organization editing, and broader organization/membership lifecycle reconciliation remain deferred due to missing mutation APIs/business rules. Existing member removal does not transfer retained work; no new reconciliation behavior was introduced.
- Pagination remains deferred. Employee catalogs and operational assignment choices retain their scoped read-only endpoints.
- Work-cycle snapshots capture ending responsibility, not every within-cycle assignment. Legacy unknown facts remain NULL; names are current display labels for stable user IDs.
- Subtask statuses retain their existing within-cycle transition behavior; earlier-cycle work is permanently frozen.
- Serialization conflicts require explicit reload/retry. Offboarding does not automatically retry or choose replacements.
- Logout revokes the supplied refresh token; immediate access invalidation here applies to deactivation, not a new per-session logout scheme.
- Use a real JWT_SECRET for deployment. NULL organization/ownership values must never be replaced with fabricated records.
