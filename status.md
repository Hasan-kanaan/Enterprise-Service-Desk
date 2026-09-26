# Project Status

Frontend and backend verification updated on 2026-09-26. [README.md](README.md) describes the project and [docs/decision.md](docs/decision.md) records architectural decisions.

The [future public demo deployment plan](docs/demo-deployment-plan.md) records late-phase constraints only; demo infrastructure remains deferred while normal product development continues.

## Current Phase

Multi-tab authentication/session coordination is implemented on the completed pagination/search and business-authorization baseline. Multiple devices/browsers remain supported; logout remains refresh-session scoped. AI and public-demo/deployment work remain deferred. No commit or push performed.

## Multi-tab session stabilization (2026-09-26)

- Fixed the shared-cookie race between independent frontend refresh promises. Central Web Locks serialize refresh/login/logout; BroadcastChannel shares access-token/user snapshots transiently. Access tokens remain memory-only, refresh tokens HttpOnly. Persistent storage holds only non-secret revision/operation/cooldown metadata. Stale messages and late rejected requests cannot overwrite newer authentication.
- Logout clears sibling UI/Redux/access state under the lock and revokes the supplied session once for concurrent callers. Definitive refresh rejection and repeated unauthorized requests propagate invalidation. Login propagation preserves deep links; account/role changes remount protected views. Multiple independent devices/browsers remain supported; logout is not global. Deactivation/sessionVersion invalidation remains global, and reactivation requires fresh authentication.
- Network/5xx failures retain authentication, impose a two-second shared cooldown and use existing retry UI. No automatic retry/broadcast loop. HTTP timeout stays 15 seconds; lock waits abort after 20 seconds without stealing locks. Channel/listener/queued-wait cleanup covers teardown/HMR; focus/pageshow checks catch resumed tabs.
- Fallback: without BroadcastChannel, Web Locks serialize separate refreshes and storage events propagate logout. Without Web Locks or usable storage, fail safely with recovery guidance. Requires current browsers on HTTPS/localhost with site storage enabled. Different app origins cannot coordinate even when sharing an API cookie. Closing the refresh owner mid-request leaves an uncertain pending operation: offer fresh login instead of replay. Backend logout failure cannot guarantee revocation, but siblings still clear local authentication.
- No backend runtime, account-lifecycle, business-authorization, dependency, lockfile, schema or migration changes. Added a backend test only. Existing uncommitted changes preserved; demo-deployment-plan.md untouched. No AI, deployment, commit or push work.

### Session verification

- Backend and frontend lint: **0 errors / 0 warnings**, checked with `--max-warnings 0` and no autofixes. Backend typecheck/Nest build and frontend TypeScript/Vite production build passed.
- Backend unit tests: **13 suites / 133 tests passed**. PostgreSQL/HTTP: **8 suites / 239 tests passed** on the existing `eds_stabilization_test` database. Added coverage for two independent logins, exactly one successful concurrent rotation, replay rejection, session-scoped logout and continued access/refresh on the other login. Existing deactivation/reactivation and all business regressions pass.
- Complete Chromium browser suites: **Employee 18 groups, operations 17 groups, administration 6 groups, session 11 groups**. Real same-profile pages and a separate browser context use native Web Locks/BroadcastChannel/storage events, actual Axios/Redux and isolated rotating HttpOnly-cookie API fixtures. New coverage: simultaneous refresh/401s, sibling requests, profile isolation, concurrent logout behind refresh, stale broadcasts, login/deactivation propagation, network cooldown/recovery, missing channel/locks, blocked storage, owner closure/fresh login and no persisted tokens. No runtime errors in the successful complete run. Chromium-only execution; browser-to-live-database and Firefox/Safari execution are not claimed.
- Prisma validate/generate passed. Development and test databases each have **16 migrations applied**, up-to-date status and **no schema drift**. No migration deployment/reset. `git diff --check` passed.
- Initial sandbox Chromium/CDP startup failures were resolved by authorized local process execution. Corrected browser readiness timing and observed one interrupted lazy import during deliberate tab closure; subsequent complete runs passed. The new backend race test initially assumed only 401 for the loser; existing serializable contention may return 409. It now accepts either while separately requiring replay 401. Expected injected rollback errors and existing pg/experimental VM warnings remain in e2e logs; lint has no warnings.

### Files changed in this phase

- `client/src/services/session-coordinator.ts` (new)
- `client/src/services/api.ts`
- `client/src/services/auth.service.ts`
- `client/src/components/SessionBootstrap.tsx`
- `client/src/layouts/AppLayout.tsx`
- `client/src/pages/LoginPage.tsx`
- `client/src/routes/ProtectedRoute.tsx`
- `client/test/session-flow.mjs` (new)
- `client/package.json` (browser test command only)
- `server/test/tickets-authorization.e2e-spec.ts` (test addition only)
- `README.md`, `docs/decision.md`, `status.md`

## Enterprise list stabilization (2026-09-26)

- [Audit and measured query plans](docs/list-scale-audit.md) recorded before implementation: `/tickets`, global/per-ticket subtask reads, `/users`, embedded organization members and assignment-user collections were unbounded. Configuration catalogs remain small; notifications and My Work History already had bounds. Subject history/communication/note/attachment streams were explicitly deferred.
- Ticket/subtask queues now apply unchanged authorization AND queue/search/filter/cursor predicates in the database, ordered by immutable `createdAt DESC, id DESC`, taking at most page size + 1. Accounts and membership use immutable `id DESC`. Versioned base64url cursor payloads have strict structure, ID/date/length validation and no dependency on an existing boundary record. Default 25, maximum 100, `{ items, nextCursor, hasMore }`; no per-page total. Dashboard cards use scoped COUNT queries.
- Employee own requests, Manager intake/owned, Agent primary/collaboration, Team Lead led-team, subtask workspace, account directory and member display consume server pages. Search is trimmed, capped at 120, parameterized and literal for LIKE wildcard characters. Ticket title/reference, status, active/finished, category and queue filters combine with visibility; directory username/email, role and status filters preserve the existing projection/matrix.
- Primary Agent, transfer Manager, new/existing subtask Agent, organization member/lead/manager selectors now use purpose-specific authorized username lookup, at most 20 matches, without embedded user expansions. Existing active-role, membership, Team Lead, primary managed-regional/GLOBAL and subtask-specific policies remain authoritative. No unrestricted employee API or user deletion.
- Frontend: 300 ms debounce, initial/loading-more/end/empty/search-empty/error/retry states, retention of rows on continuation failure, cancelled/ignored stale requests, and URL filters on ticket/queue/account lists. Search/filter/back/forward changes reset cursor state; repeated records are deduplicated defensively. Existing React/service conventions and mobile layouts retained, without a fetching dependency.
- Migration `20260926120000_list_keyset_indexes` replaces five equivalent-prefix Ticket indexes with ordered composites, adds general ticket-order and User(role,status,id) indexes, and reuses existing membership/subtask/cycle keys. No data migration. Development and isolated test databases each have **16 migrations**, up to date with **zero schema drift**.
- Default test-only fixture: **128 users / 343 tickets / 57 subtasks**. Optional large fixture: **2,071 users / 12,001 tickets / 2,000 subtasks**, cleaned afterward. Actual parameterized Prisma SQL plans after ANALYZE showed direct list pages around **0.025–0.527 ms**, collaboration **12.222 ms** locally. No timing assertions or production-capacity claim; substring filtering and complex collaboration still require database work.
- Final verification: backend lint **0 errors / 0 warnings**, TypeScript and Nest build pass; **13 unit suites / 133 tests**; **8 PostgreSQL/e2e suites / 238 tests**. Frontend lint **0 errors / 0 warnings**, TypeScript/Vite build pass; all **3 browser suites / 41 named acceptance groups** pass (**Employee 18, operations 17, administration 6**) with no browser runtime errors. Prisma validate/generate, migration status/drift checks and `git diff --check` pass.
- Verification recovery: the local PostgreSQL container was stopped during continuation; restarting that existing development container restored test access. Sandboxed browser/CDP connections failed, so authorized local browser checks ran with process access. A browser test's immediate form click was changed to wait for readiness; the complete suites then passed. No production services or public deployment were involved.
- Remaining scale boundaries: small configuration/team catalogs, subject history/communication/note/attachment streams, existing offset-based My Work History, dashboard count cost, substring searches, relationship-heavy collaboration and accumulated load-more browser rows. Notifications retain their existing bound. Business authorization, mutations, auto-close, lifecycle/concurrency, offboarding, sessions and all explicitly excluded features are unchanged; existing uncommitted baseline work is preserved.

## Backend lint stabilization (2026-09-26)

- Audited the existing backend lint scope before editing application code: 84 owned TypeScript files, 818 errors and 138 warnings. `src/` accounted for 113 errors / 38 warnings; `test/` for 705 errors / 100 warnings. Configuration, generated code, migrations and other directories contributed zero. The package command explicitly targets `{src,apps,libs,test}/**/*.ts`; generated Prisma, node_modules, dist/build, coverage and migration SQL were not accidentally included. Tests remain covered. No ESLint configuration, package script, dependency or directory exclusion changes were needed.
- Main findings: 348 unsafe member accesses, 137 unsafe arguments, 88 unsafe assignments, 87 unsafe calls, 17 unsafe returns and 254 formatting violations. Smaller categories were unused bindings, unnecessary async/assertions, unbound mock methods, CommonJS import typing and an unhandled-promise lint warning.
- Applied the existing lint command's formatting/autofixes, typed authentication request/JWT/cookie boundaries and DTO transform inputs, preserved intentional field omission, and made startup promise handling explicit. Test changes type partial mocks/callbacks, PostgreSQL query results and HTTP response contracts. The test-only Supertest adapter derives response types from existing services/controllers and preserves the real requests and runtime assertions. No authorization, API contract, lifecycle, notification, communication, attachment, routing or database behavior changed.
- Exactly two line-level `no-control-regex` exceptions were added in attachment validation: the existing regexes intentionally sanitize filename control bytes and reject binary control bytes in text uploads. Each exception explains its purpose; neither regex changed. No broad disables, safety-rule relaxation or source/test exclusions were added.
- Maintenance scope: 37 existing TypeScript files modified plus one test-only HTTP typing helper (38 total): 24 application files, eight unit-test files, five e2e files and one test helper. Many application changes are formatting only. Documentation changed only in this status entry; pre-existing auto-close README/decision/schema/migration changes remain intact. No new or edited migrations, data repair, deployment work, AI work, commit or push.
- Final backend lint: **0 errors / 0 warnings** using the existing package command and a separate check without autofixes. No warnings intentionally remain. Server TypeScript check and Nest build passed; complete unit suite passed **12 suites / 124 tests**; complete PostgreSQL e2e suite passed **7 suites / 211 tests**.
- Frontend TypeScript/Vite build and ESLint passed. Complete Chromium suites passed: **Employee 17 groups, operations 13 groups, administration 5 groups**, without browser runtime errors. Prisma validate/generate and `git diff --check` passed. The first e2e attempt could not connect because Docker Desktop was stopped; starting the existing local installation restored the existing PostgreSQL container, and the complete rerun passed. No migration deployment or database reset was performed; database writes were limited to the existing isolated test fixtures and their cleanup.

## Automatic closure verification (2026-09-25)

- Migration synchronization: development `enterprise_service_desk` and isolated `eds_stabilization_test` both have all 15 migrations applied; Prisma migrate status is up to date and migrate diff reports zero differences in both. Migration `20260925180000_ticket_auto_close` adds nullable MANUAL/AUTO_TIMEOUT closeSource and `(status, resolvedAt)` index. Historical sources are left NULL; migration regression verifies existing cycle facts and tickets are preserved.
- Rule: 72 real elapsed hours continuously RESOLVED, with no business-day/weekend/holiday logic. Current persisted status/resolvedAt determines eligibility. Reopen invalidates the old deadline, re-resolution starts a fresh period, and CANCELLED remains frozen. Existing manual permissions and interactive 409 behavior are unchanged.
- Architecture: testable `AutoCloseService.runSweep(now)` plus independent Nest lifecycle `AutoCloseScheduler`, invoking a sweep every ten minutes (first run ten minutes after startup). One process-wide trigger, no per-ticket in-memory timers, no queue and no dependency changes. Future deployment may replace the scheduler without changing domain logic.
- Query: status=RESOLVED and resolvedAt<=now-duration, ordered by resolvedAt, LIMIT 100 FOR UPDATE SKIP LOCKED. At most ten Serializable batches/1,000 tickets per sweep. Parent locks precede current-state/cycle rechecks. Locked candidates and serialization conflicts defer to later sweeps; ticket/cycle updates are atomic and idempotent. An unexpected failure rolls back its batch and is logged. Backlogs may require additional sweeps.
- Automatic closure annotates the same resolved cycle, retaining outcome, summary, ending actor and ownership snapshot, with AUTO_TIMEOUT and no human closedBy actor. New manual closes record MANUAL and retain existing manual outcome behavior. Legacy unknown source remains NULL; no fake system user or source backfill.
- `AUTO_CLOSE_AFTER_HOURS` defaults to 72; positive finite values up to 87600 are accepted at startup. Configure all instances identically. API autoCloseAt uses the same value; Employee detail shows eligibility time and subsequent-check wording. History displays “Automatically closed”. No countdown or admin setting.
- No CLOSED notification exists; no closure notification or email is sent. Existing resolution notifications, frozen communication, readable authorized attachments, soft deletion, managed-regional/GLOBAL routing, collaborators, work history and offboarding remain unchanged. No attachment infrastructure or demo deployment plan changes.
- Complete unit verification: 12 suites / 124 tests passed. Complete PostgreSQL e2e verification: 7 suites / 211 tests passed. New cases cover eligibility boundaries and all excluded statuses, stale candidates, fresh resolution periods, manual attribution, races, locked rows, actual database rollback, batch caps, index strategy, configurable duration and scheduler lifecycle. Existing authorization and domain regression suites pass.
- Complete Chromium verification: Employee 17 groups, operations 13 groups, administration 5 groups passed, including auto-close date/history, manual close/reopen, mobile layout and no browser runtime errors. The initial sandbox browser launch timed out at Page.enable; the approved run outside the sandbox passed all three suites.
- Server TypeScript and Nest build, frontend ESLint/TypeScript/Vite build, Prisma validation/generation and git diff whitespace check passed. New auto-close source/test files pass ESLint. Full backend ESLint was run without broad autofixes and remains failing on repository-wide baseline issues: 818 errors / 138 warnings (formatting, unsafe types, unused variables and related rules). Existing e2e injected-rollback logs and pg/VM warnings are expected.
- Files changed: `server/prisma/schema.prisma`; `server/prisma/migrations/20260925180000_ticket_auto_close/migration.sql`; `server/src/tickets/auto-close.config.ts`; `server/src/tickets/auto-close.service.ts`; `server/src/tickets/auto-close.scheduler.ts`; `server/src/tickets/auto-close.service.spec.ts`; `server/src/tickets/tickets-authorization.module.ts`; `server/src/tickets/tickets.service.ts`; `server/src/tickets/ticket-response.mapper.ts`; `server/test/auto-close.e2e-spec.ts`; `server/test/work-cycle-migration.e2e-spec.ts`; `client/src/types/tickets.ts`; `client/src/pages/EmployeeTicketPage.tsx`; `client/src/components/TicketHistory.tsx`; `client/test/employee-flow.mjs`; `README.md`; `docs/decision.md`; `status.md`.
- No package/lockfile changes, commit or push.

## Secure Attachments and Soft Deletion

- Implemented original ticket, public-message and support-only internal-note attachments with a constrained shared Attachment table and author/uploader attribution. Original ticket files are immutable forever. No append, replace, restore or ticket-file deletion API.
- Current authorized authors alone may delete their own current unfinished-cycle messages/notes and attachments. Deleted parents expose null content, preserve metadata and hide all files. Attachment tombstones hide filenames/type/size; downloads reject deleted files/parents. Previous cycles and terminal work never thaw. No administrative/manager/lead override.
- Private local AttachmentStorage adapter, generated UUID keys, configurable ATTACHMENT_STORAGE_DIR (default server-process .attachments), temporary writes/rename and failed-operation/replay cleanup. Maximum five files per parent submission and 10 MB each, including the exact five-file/10 MB boundary. PNG/JPEG/WebP/PDF/TXT/LOG/JSON/CSV only, with format checks. Authenticated parent-authorized downloads use safe attachment headers; paths/keys are private.
- Existing JSON creation remains supported; multipart sends JSON payload plus files. Added original-ticket attachment list and authenticated download GET routes, plus cycle-checked DELETE routes for communication and individual communication files. Content PATCH remains content-only. Full API contracts are in README.md.
- Creation replay after deletion recovers the tombstone and consumes no new attachment/notification rows. Deletion never reverses WAITING_FOR_EMPLOYEE -> IN_PROGRESS, changes ownership/work cycles/collaboration/routing, creates/retracts notifications or marks notifications read.
- Migration 20260925120000_attachments_soft_deletion applied to development and isolated test databases: 13 migrations each, zero Prisma schema drift. Existing content is unchanged, deletedAt starts NULL, no historical attachments fabricated. Migration tests verify parent checks/FKs, immutable ticket deletion constraint and preservation of pre-existing communication.
- Verification: 10 unit suites / 109 tests; 5 PostgreSQL/HTTP suites / 163 tests. Includes all existing regressions plus 20 new attachment/deletion scenario groups and controlled deletion races against resolution, reassignment, lead removal and deactivation. Injected storage/database/domain failures verify rollback and binary cleanup. Complete Employee (16 groups), operational (11 groups) and administration (5 groups) Chromium suites pass; fixtures cover UI contracts, PostgreSQL tests cover real access/transactions. Client lint/build, backend typecheck/build, Prisma validation/generation and migration checks pass.
- The obsolete regression expecting no communication DELETE route now expects DTO validation failure when expectedCycleId is missing. No existing routing, membership, collaboration, notification or lifecycle behavior required correction. During implementation review, the text-edit response was corrected to redact already-deleted attachment filenames too.
- Deferred storage hardening: malware scanning (files are not scanned), S3/object storage, physical purge/garbage collection, crash orphan scavenging, capacity/rate controls and production storage backup/permission policies. Lightweight signatures/text checks are not full document validation. Email remains intentionally out of scope.
- No dependencies added, commit or push performed.

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
- Prisma validation/generation, backend TypeScript/Nest build, client TypeScript/Vite build and ESLint passed. Both development and isolated test databases had 12 migrations at the notification-phase checkpoint and zero schema differences; final read-only counts confirm zero notifications in both databases after fixture cleanup, with no backfill. Existing uncommitted work preserved; no dependency changes, commit or push.
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
- GET/POST stream endpoints and author-only PATCH endpoints implemented. Authors may edit only their own current unfinished-cycle records while authorized. Author-only current unfinished-cycle soft deletion is implemented; no revision-history feature. Terminal and historical records remain read-only after reopening.
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

Thirteen migrations are applied in the local development and isolated test databases. `20260925120000_attachments_soft_deletion` adds the empty constrained Attachment table and nullable communication deletedAt without changing existing content. `20260923150000_in_app_notifications` adds an empty notification table, enum, indexes and restrictive references with no historical backfill. `20260923120000_ticket_communication` adds the two empty communication tables, indexes, idempotency constraints and restrictive author/same-ticket-cycle FKs. Existing users, tickets, cycles and subtasks are unchanged; no messages or notes are backfilled. The previous `20260918120000_user_lifecycle_work_cycles` migration remains unchanged.

Backfill creates one ORIGINAL cycle per existing ticket and attaches existing subtasks without changing their work data. Known timestamps are retained; unknown actors/times remain NULL. Terminal ownership is explicitly marked RECORDED_AT_MIGRATION, not falsely represented as proven ownership at resolution. No inferred managers, earlier reopenings, or replacement people were created.

The historical work-cycle backfill requires old application writers to be paused during that migration/backend switch. The communication, notification and attachment migrations are additive and must be applied before serving the new API/frontend. Existing nonterminal managerless fixtures still require explicit reconciliation; this phase does not invent historical owners or an ordinary legacy-adoption endpoint.

## Verification

- Client TypeScript/Vite production build and ESLint: passed.
- Chromium browser acceptance: passed for session restore, form payloads, edit/conflict recovery, cancel/close/reopen, history, mobile navigation/layout, deep reload, error/retry/empty states, token renewal/session rejection, and admin route exclusion. No browser runtime exceptions.
- Employee Chromium suite: sixteen scenario groups passed, including attachment draft selection/removal, immutable ticket download, upload failure recovery, author-only message/attachment tombstones and non-author control exclusion, plus notification list/badge, mark one/all read, ticket navigation, lost-access history, mutation refresh and mobile panel, plus public posting/editing, private-note exclusion, waiting-reply behavior, preserved 503/409 drafts, explicit stale-cycle review and frozen history, plus existing lifecycle/session/mobile flows.
- Operational Chromium browser suite: eleven scenario groups passed, including message/note uploads and confirmed note/attachment tombstones, plus Manager/Agent notification navigation and lost-access history, plus eligible managed regional/GLOBAL primary choices, exclusion of other-manager regional choices, retained ineligible-team selection, separate subtask choices, manager messages/notes, author edits, sibling-draft preservation, completed collaborator parent access and communication without primary-agent powers, plus existing Manager/Agent/Team Lead flows and errors.
- Browser profile cleanup retries were lengthened after one Windows temporary-profile lock outlasted the original retry window. The complete sequential browser rerun passed and cleaned its profiles.
- Administration Chromium browser suite: five scenario groups passed for ADMIN/SUPER_ADMIN provisioning and lifecycle matrices, all exposed organization mutations, relationship constraints, 401/403/404/409/network handling, role isolation, and mobile layout. No runtime or console errors. Employee and operational browser suites rerun and passed.
- Browser checks use isolated API fixtures; real PostgreSQL authorization/contracts are covered separately by backend e2e tests.

- Prisma schema validation and client generation: passed.
- Development and isolated-test migration status: thirteen migrations applied in each; both schema diffs report no difference.
- Backend TypeScript, including tests: passed.
- Nest build: passed.
- Unit tests: ten suites, 109 tests passed, including communication validation and collaborator/support visibility predicates.
- PostgreSQL/HTTP e2e: five suites, 163 tests passed. Coverage includes notification events, recipient/privacy/read matrices, idempotency, lost access, six notification-write rollback cases, plus managed regional/GLOBAL primary routing, other-manager and unmanaged regional rejection, specialty-match rejection, active primary-team membership, retained assignments after manager transfer, concurrent TeamManager removal, collaborator gain/completion/reassignment/cycle-end/reopen boundaries, unchanged ownership/mutation powers, communication role matrix and privacy, own edits, terminal/historical freezes, idempotency before/after editing, current authorization on replay, inactive author attribution, waiting transitions, migration constraints and controlled concurrent authority/lifecycle changes. Existing account, organization, ticket and subtask regressions pass.
- E2e includes existing authorization regressions, account/session lifecycle, atomic offboarding, cancellation/freeze/reopen matrices, repeated cycles, safe history projections, historical/current-work separation, and controlled concurrent reopen/close/assignment/offboarding races.
- Migration test replays the historical schema in a private test-database schema, verifies truthful work-cycle backfill, then applies the communication, notification and attachment migrations and verifies empty tables, same-ticket cycle constraints, restrictive references, attachment parent constraints and unchanged pre-existing communication. It rolls everything back.
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

1. General polish/stabilization
2. AI routing/recommendations

Attachments, author-controlled communication soft deletion, My Work History and automatic closure are complete.

## Deferred Work and Remaining Boundaries

- Browser notifications, polling/realtime transport, generic audit infrastructure, SSO/SCIM and other optional enterprise features remain deferred. Notification history pagination, preferences, deletion and retention jobs are not implemented.
- Communication uses explicit REST refresh with no pagination, read receipts or revision history. Edits retain original authorship/time and only the latest editedAt/content. Names are current display labels for stable author IDs. Drafts are in-memory and are not promised across navigation, sign-out or a full browser reload.
- Organization master/team rename/delete, existing team coverage updates, specialty-link changes, account identity/role/home-organization editing, and broader organization/membership lifecycle reconciliation remain deferred due to missing mutation APIs/business rules. Existing member removal does not transfer retained work; no new reconciliation behavior was introduced.
- Pagination outside My Work History remains deferred. Employee catalogs and operational assignment choices retain their scoped read-only endpoints.
- Work-cycle snapshots capture ending responsibility, not every within-cycle assignment. Legacy unknown facts remain NULL; names are current display labels for stable user IDs.
- Subtask statuses retain their existing within-cycle transition behavior; earlier-cycle work is permanently frozen.
- Serialization conflicts require explicit reload/retry. Offboarding does not automatically retry or choose replacements.
- Logout revokes the supplied refresh token; immediate access invalidation here applies to deactivation, not a new per-session logout scheme.
- Use a real JWT_SECRET for deployment. NULL organization/ownership values must never be replaced with fabricated records.

## Attachment Phase Files Changed

- `.gitignore`
- `README.md`
- `client/src/components/Attachments.tsx`
- `client/src/components/TicketCommunication.tsx`
- `client/src/components/TicketForm.tsx`
- `client/src/pages/CreateTicketPage.tsx`
- `client/src/pages/EmployeeTicketPage.tsx`
- `client/src/pages/OperationalTicketPage.tsx`
- `client/src/services/attachments.service.ts`
- `client/src/services/tickets.service.ts`
- `client/src/tickets.css`
- `client/test/communication-fixture.mjs`
- `client/test/employee-flow.mjs`
- `client/test/operations-flow.mjs`
- `docs/decision.md`
- `server/prisma/migrations/20260925120000_attachments_soft_deletion/migration.sql`
- `server/prisma/schema.prisma`
- `server/src/tickets/attachment-storage.spec.ts`
- `server/src/tickets/attachment-storage.ts`
- `server/src/tickets/attachment-upload.interceptor.ts`
- `server/src/tickets/attachments.controller.ts`
- `server/src/tickets/dto/ticket-communication.dto.ts`
- `server/src/tickets/ticket-communication.controller.ts`
- `server/src/tickets/ticket-communication.service.ts`
- `server/src/tickets/tickets-authorization.module.ts`
- `server/src/tickets/tickets.controller.spec.ts`
- `server/src/tickets/tickets.controller.ts`
- `server/src/tickets/tickets.service.ts`
- `server/test/attachments.e2e-spec.ts`
- `server/test/tickets-authorization.e2e-spec.ts`
- `server/test/work-cycle-migration.e2e-spec.ts`
- `status.md`

## My Work History - 2026-09-25

- MANAGER/AGENT navigation and /work-history page use authenticated GET /my-work-history. EMPLOYEE/ADMIN/SUPER_ADMIN cannot use it, and no caller can select another user's history.
- Limited personal historical projection: IDs, cycle number/type/outcome, contribution labels, activity timestamp, own completed subtask title/status, and current canOpenTicket. No ticket title, requester, descriptions, ownership/scope/category detail, conversation, internal notes, deleted contents, attachments or notification data.
- Evidence: endedAt/outcome-qualified TicketWorkCycle endingManagerId/endingAgentId with END_OF_WORK basis, endedById, timestamped closedById, and REOPENED startedById. Matching cycle relations combine into one row. Separate completed-task rows require COMPLETED, completedById and completedAt; completed work may precede cycle end. Reopen attribution appears only once its cycle ends.
- History grants no ticket visibility. Open ticket uses the existing current-access predicate, scoped to returned IDs; detail and all related routes recheck normally. Team membership, Team Lead relationship, former assignment or collaboration alone create no record. Normal offboarding retains evidence, inactive sessions are rejected, and reactivation restores no responsibilities. Existing shared intake visibility remains intact.
- Truthfulness limits: intermediate within-cycle assignments are not stored; no missing participation is invented. RECORDED_AT_MIGRATION owners are not ending evidence. Within-cycle subtask reopening can clear completion facts; task titles are retained labels, not title-version snapshots. No assignment-event stream or duplicate history table.
- SQL pagination: page 1 / size 25 by default, size 1..100, at most 101 rows loaded, LIMIT/OFFSET, deterministic activityAt/kind/id descending. Contribution and inclusive date filters run in PostgreSQL. Cycle activity is endedAt or the caller's later closedAt; task activity is completedAt. No all-history query/count or browser reconstruction. Offset pages can shift as facts change between requests; deep offsets still require database work.
- Migration 20260925160000_work_history_indexes adds five cycle actor/time/id indexes and one subtask completer/time/id index. Applied to both local development and isolated test databases (14 migrations each, zero schema drift in both). Existing application data and sequences were verified unchanged in both databases; no migration files were created or modified. No backfill or fabricated history.
- UI includes loading, empty/filter state, pagination, retry, responsive cards and current-access-only ticket links. No history read writes or notifications. Existing browser suites cover the unchanged workflows; two additional operational browser groups cover Manager/Agent history, completed subtask, filters, pagination, empty/error states, access loss and mobile layout.

### My Work History files changed

- README.md
- docs/decision.md
- status.md
- client/src/layouts/AppLayout.tsx
- client/src/routes/AppRoutes.tsx
- client/src/pages/WorkHistoryPage.tsx
- client/test/operations-flow.mjs
- server/prisma/schema.prisma
- server/prisma/migrations/20260925160000_work_history_indexes/migration.sql
- server/src/tickets/tickets-authorization.module.ts
- server/src/tickets/dto/work-history.dto.ts
- server/src/tickets/work-history.controller.ts
- server/src/tickets/work-history.service.ts
- server/src/tickets/work-history.service.spec.ts
- server/test/work-history.e2e-spec.ts

Pre-existing README/status demo-plan references were preserved. docs/demo-deployment-plan.md and demo/deployment infrastructure were not changed. No commit or push.

### My Work History verification results

- Backend TypeScript check and Nest build: passed.
- Unit: 11 suites / 110 tests passed (`node node_modules/jest/bin/jest.js --runInBand --no-cache`). Includes bounded query/sentinel and page-scoped existing visibility predicate checks.
- PostgreSQL/HTTP: 6 suites / 192 tests passed (`node --experimental-vm-modules node_modules/jest/bin/jest.js --config ./test/jest-e2e.json --runInBand --no-cache`). New history suite: 29 tests, including a 261-cycle pagination fixture. Existing routing, collaborator, message/note/deletion, attachment, notification and offboarding regressions all pass.
- Chromium: Employee 16 groups, operational 13 groups (11 existing + 2 history), administration 5 groups passed. No runtime errors; mobile history screenshot saved to the OS temp directory as eds-work-history-mobile.png. Browser API fixtures test frontend contracts; PostgreSQL/HTTP tests verify real queries and authorization.
- Client ESLint, TypeScript and Vite production build: passed.
- Prisma validation/generation: passed. Local development and isolated test databases: all 14 migrations applied in each; migrate status is fully up to date and migrate diff reports no difference for both.
- git diff --check: passed.
- Initial verification corrected a new-file encoding issue and incorrect test assumptions about cancellation and reactivated-manager intake access. The first history run left a test ticket in shared intake before fixture cleanup was added; its verified fixture was removed, then the complete 192-test run passed. Restricted-sandbox database access failed; authorized local PostgreSQL and Chromium runs completed successfully. Expected injected rollback errors and existing pg/VM warnings remain in e2e logs.
