# Project Status

Frontend and backend verification updated on 2026-09-23. [README.md](README.md) describes the project and [docs/decision.md](docs/decision.md) records architectural decisions.

## Current Phase

ADMIN/SUPER_ADMIN management frontend implemented and verified on the accepted Employee and Manager/Agent/Team Lead baselines. The earlier account lifecycle/work-cycle backend phase is committed. All three frontend phases remain uncommitted; no push performed.

## Employee Frontend

- Responsive role-aware shell, real employee dashboard, searchable/status-filtered request list, creation, detail, metadata editing, and public cycle history.
- Confirmed cancellation, closure, and reason-required reopening. Terminal edit restrictions and permanently cancelled tickets match backend behavior. Standard 409 conflicts require explicit reload; legacy invalid routing offers explicit return-to-intake recovery.
- Real catalog choices through the minimal authenticated GET /ticket-options endpoint. Only category/tag/region/department ID/name data is returned; administrative roles remain excluded. No fake IDs or default ownership.
- Session restoration on reload, single-flight refresh, Redux identity synchronization, protected deep links, local logout protection, and connection-error retry. Tokens stay in memory.
- Loading, empty, search-empty, missing-catalog, validation, 403/404, network-error, and stale-ticket states. No support subtasks, conversations, internal notes, or assignment controls in the employee workspace.
- Existing classic frontend folders and installed dependencies retained. Larger route modules load on demand. No schema, migration, or dependency changes in this phase.

## Manager and Agent/Team Lead Frontend

- Manager dashboard, shared unowned NEW intake, current owned-ticket queue, claim, primary team/agent changes and explicit clearing, ownership transfer, metadata/status operations, closure/reopen, and authorized subtask creation/management.
- Agent dashboard/direct-assignment queue and authorized metadata/status work. Team Lead navigation and queues derive from the actual led-team relationship; primary agent and subtask assignment controls are scoped to that team. No cross-team or manager authority.
- Shared ticket forms/presentation/history retained. Authorized current-cycle subtasks appear separately from frozen historical work. Standalone subtask detail shows actual assignment and completedBy information without loading parent-ticket content/history. Historical participation never adds active tickets.
- GET /ticket-workspace returns caller led teams. GET /ticket-workspace/tickets/:ticketId returns existing-policy action hints and eligible choices. GET /ticket-workspace/subtasks/:subtaskId returns the limited authorized subtask with display names, lifecycle flags and choices. All are read-only, MANAGER/AGENT-only, and use existing visibility/policy logic; no general account directory or new mutation authority.
- Assignment choices use only real teams and active eligible users. Incompatible agents require explicit clearing/replacement. Standard 409 conflicts require reload; important operations use confirmation dialogs and disable submission while pending.
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
- Current detail includes scope/tag IDs, ownership, and latest-cycle summary. History uses current ticket visibility with independent subtask filtering. Employees receive no support subtasks; subtask-only access never includes parent/history; historical participation never expands ticket visibility.
- Active/status ticket filters and currentWork subtask filters. No currentCycleId on Ticket, assignment event stream, or generic audit infrastructure.
- Serializable parent-ticket/user locking and 409 conflict mapping reused across lifecycle writes. Offboarding and ticket/cycle changes are atomic; stale requests reload and explicitly retry. Consistent-snapshot history reads.

## Migration

`20260918120000_user_lifecycle_work_cycles` applied to the local development and isolated test databases. All ten migrations are applied. It adds user lifecycle/session version, CANCELLED, work cycles, subtask cycle/completion-actor references, and new historical foreign keys without changing unrelated existing SET NULL relationships.

Backfill creates one ORIGINAL cycle per existing ticket and attaches existing subtasks without changing their work data. Known timestamps are retained; unknown actors/times remain NULL. Terminal ownership is explicitly marked RECORDED_AT_MIGRATION, not falsely represented as proven ownership at resolution. No inferred managers, earlier reopenings, or replacement people were created.

Deploy with old application writers paused while migrating and switching backend versions. Existing nonterminal managerless fixtures still require explicit reconciliation; this phase does not invent historical owners or an ordinary legacy-adoption endpoint.

## Verification

- Client TypeScript/Vite production build and ESLint: passed.
- Chromium browser acceptance: passed for session restore, form payloads, edit/conflict recovery, cancel/close/reopen, history, mobile navigation/layout, deep reload, error/retry/empty states, token renewal/session rejection, and admin route exclusion. No browser runtime exceptions.
- Operational Chromium browser suite: six scenario groups passed for Manager/Agent/Team Lead flows, assignment/transfer/status/metadata/reopen, subtask completion/own-team delegation, frozen history, unauthorized exclusion, 401/403/404/409 and network recovery, and mobile layout.
- PostgreSQL was initially unavailable because Docker was stopped; after starting the existing local container, the full e2e rerun passed. No migrations or development-data writes were needed.
- Administration Chromium browser suite: five scenario groups passed for ADMIN/SUPER_ADMIN provisioning and lifecycle matrices, all exposed organization mutations, relationship constraints, 401/403/404/409/network handling, role isolation, and mobile layout. No runtime or console errors. Employee and operational browser suites rerun and passed.
- Browser checks use isolated API fixtures; real PostgreSQL authorization/contracts are covered separately by backend e2e tests.

- Prisma schema validation and client generation: passed.
- Development and isolated-test migration status: ten migrations applied in each; both schema diffs report no difference.
- Backend TypeScript, including tests: passed.
- Nest build: passed.
- Unit tests: eight suites, 84 tests passed, including expanded SUPER_ADMIN provisioning and prohibited-role coverage.
- PostgreSQL/HTTP e2e: three suites, 91 tests passed. Administration adds both caller provisioning matrices over HTTP and safe directory/member projection tests. Five additional operational-projection tests cover caller led-team scope, policy-derived actions, active eligible choices, Team Lead restrictions, subtask-only confidentiality, and frozen history/completion attribution; existing catalog and mutation regressions remain passing.
- E2e includes existing authorization regressions, account/session lifecycle, atomic offboarding, cancellation/freeze/reopen matrices, repeated cycles, safe history projections, historical/current-work separation, and controlled concurrent reopen/close/assignment/offboarding races.
- Migration test replays the nine previous migrations in a private schema in the test database, verifies truthful backfill and same-ticket/not-null constraints, and rolls everything back.
- Injected database failures verify complete rollback of reopening and administrative offboarding. The corresponding expected HTTP 500 errors appear in test logs; both rollback tests pass.
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

## Deferred Work and Remaining Boundaries

- AI routing/recommendations; conversations/messages; internal notes; notifications/email; automatic RESOLVED -> CLOSED scheduling; generic audit log; My Work History; SSO/SCIM remain deferred.
- Organization master/team rename/delete, existing team coverage updates, specialty-link changes, account identity/role/home-organization editing, and broader organization/membership lifecycle reconciliation remain deferred due to missing mutation APIs/business rules. Existing member removal does not transfer retained work; no new reconciliation behavior was introduced.
- Pagination and My Work History remain deferred. Employee catalogs and operational assignment choices retain their scoped read-only endpoints.
- Work-cycle snapshots capture ending responsibility, not every within-cycle assignment. Legacy unknown facts remain NULL; names are current display labels for stable user IDs.
- Subtask statuses retain their existing within-cycle transition behavior; earlier-cycle work is permanently frozen.
- Serialization conflicts require explicit reload/retry. Offboarding does not automatically retry or choose replacements.
- Logout revokes the supplied refresh token; immediate access invalidation here applies to deactivation, not a new per-session logout scheme.
- Use a real JWT_SECRET for deployment. NULL organization/ownership values must never be replaced with fabricated records.
