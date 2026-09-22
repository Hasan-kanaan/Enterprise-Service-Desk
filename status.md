# Project Status

Implementation verified on 2026-09-18; final documentation/review completed on 2026-09-22. [README.md](README.md) describes the project and [docs/decision.md](docs/decision.md) records architectural decisions.

## Current Phase

Account lifecycle, administrative offboarding, cancellation, terminal immutability, explicit reopening, and work-cycle history implemented. Changes remain uncommitted pending user approval.

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

- Prisma schema validation and client generation: passed.
- Development and isolated-test migration status: ten migrations applied in each; both schema diffs report no difference.
- Backend TypeScript, including tests: passed.
- Nest build: passed.
- Unit tests: eight suites, 80 tests passed.
- PostgreSQL/HTTP e2e: three suites, 82 tests passed.
- E2e includes existing authorization regressions, account/session lifecycle, atomic offboarding, cancellation/freeze/reopen matrices, repeated cycles, safe history projections, historical/current-work separation, and controlled concurrent reopen/close/assignment/offboarding races.
- Migration test replays the nine previous migrations in a private schema in the test database, verifies truthful backfill and same-ticket/not-null constraints, and rolls everything back.
- Injected database failures verify complete rollback of reopening and administrative offboarding. The corresponding expected HTTP 500 errors appear in test logs; both rollback tests pass.
- Test fixtures are scoped and cleaned up. No dependency installation or frontend changes.
- Node experimental VM-modules and pg concurrent-query deprecation warnings remain non-failing.
- Git diff whitespace check and final scope review completed before the final report. No commit created.

## Validation Commands

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

- AI routing/recommendations; conversations/messages; internal notes; notifications/email; automatic RESOLVED -> CLOSED scheduling; generic audit log; frontend ticket pages; My Work History; SSO/SCIM remain deferred.
- Ticket/organization catalog APIs, pagination, broader organization-role/membership lifecycle design, and frontend startup session restoration remain separate work.
- Work-cycle snapshots capture ending responsibility, not every within-cycle assignment. Legacy unknown facts remain NULL; names are current display labels for stable user IDs.
- Subtask statuses retain their existing within-cycle transition behavior; earlier-cycle work is permanently frozen.
- Serialization conflicts require explicit reload/retry. Offboarding does not automatically retry or choose replacements.
- Logout revokes the supplied refresh token; immediate access invalidation here applies to deactivation, not a new per-session logout scheme.
- Use a real JWT_SECRET for deployment. NULL organization/ownership values must never be replaced with fabricated records.
