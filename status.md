# Project Status

Verified on 2026-09-18. [README.md](README.md) describes the project and [docs/decision.md](docs/decision.md) records architectural decisions.

## Current Phase

Ticket authorization and lifecycle stabilization completed. The frontend ticket workflow and subsequent service-desk features remain separate work.

## Implemented

- PostgreSQL-backed users, bcrypt passwords, JWT access tokens, serialized initial SUPER_ADMIN bootstrap, admin-provisioned account hierarchy, refresh-cookie rotation, and logout revocation.
- Frontend login/setup, account directory/creation, profile identity, role-aware navigation, and logout. Dashboard/tickets/settings/notifications remain placeholder surfaces.
- Region, Department, Specialty, Team, memberships, organizational TeamManager, and optional Team Lead models and administration foundation.
- Ticket creation, general metadata editing, filtered list/detail, primary assignment, status transitions, subtask creation/update, and separately authorized subtask list/detail APIs.
- Explicit nullable Ticket.assignedManagerId and restrictive manager deletion. TeamManager is organizational only and grants no ticket authority.
- Shared MANAGER intake: NEW with NULL manager. Any manager can assign themselves or another real MANAGER. This leaves NEW; first primary-team assignment sets ASSIGNED with an optional agent.
- Only the responsible manager has manager-level ticket authority, including manager transfer and any real destination-team selection. Transfer preserves team/agent/status/timestamps.
- Team Leads can assign primary agents within their current primary team, but cannot change manager/team. Ordinary primary agents cannot reassign ownership.
- ADMIN and SUPER_ADMIN denied every ticket/subtask API; account and organization administration preserved.
- Employees have no support-subtask access. Direct subtask agents can work on their own subtasks; primary parent-agent assignment grants no additional access. Team Leads oversee their subtask team and may create explicitly team-assigned subtasks when they lead the parent primary team. Responsible managers manage all parent-ticket subtasks and cross-team delegation.
- Omitted PATCH fields preserve values; explicit NULL clears only supported nullable ownership. Incompatible retained agents cause rejection unless explicitly cleared/replaced. Manager and primary-team clearing are unsupported.
- RESOLVED/CLOSED reject manager transfer, team/agent reassignment, and all subtask mutations. Other reassignment preserves status/timestamps. No implicit reopening or parent-state changes from subtask status.
- All existing-ticket/subtask mutations lock the parent Ticket row in serializable transactions. Stale writes return 409 without automatic retry. Claims use conditional ownership/status writes.
- Controller-test dependency mismatch fixed. Unit/e2e Jest maps only relative .js imports; e2e uses Node VM modules for Prisma's dynamic imports. Separate no-output TypeScript checking includes tests.

## Migration

`20260918090000_add_ticket_responsible_manager` adds nullable assignedManagerId, its FK with ON DELETE RESTRICT, and manager/intake indexes. Applied to the local development database and separate test database; all nine migrations are applied.

No manager inference/backfill occurred. Existing non-NEW managerless tickets intentionally remain outside manager visibility; reconcile development fixtures explicitly if needed. No return-to-intake or legacy-adoption endpoint exists.

## Verification

- Prisma schema validation: passed.
- Migration status: up to date (nine migrations); database-to-schema diff reports no difference.
- Git diff --check: passed.
- Backend TypeScript including test sources: passed.
- Backend Nest build: passed.
- Unit tests: six suites, 62 tests passed.
- PostgreSQL/HTTP e2e: two suites, 24 tests passed, including controlled concurrent claims, stale manager edits after transfer, and subtask work racing parent resolution.
- Real HTTP tests exercise guards, DTO validation, relational visibility, administrative exclusion, preserved administration, strict NULLs, and terminal freezes.
- Test fixtures use a separate database and are explicitly cleaned up; no development fixtures were rewritten.
- No dependency installation. Prisma configuration uses Node's built-in loadEnvFile instead of undeclared dotenv.
- E2e emits Node's experimental VM-modules warning and a pg concurrent-query deprecation warning; neither fails validation.
- Frontend files/contracts were not changed; frontend validation is not required for this backend-only stabilization.

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

## Deferred Work

- Ticket/organization frontend integration and richer ticket read contracts/catalog APIs.
- Frontend reload session restoration (refresh retry exists, but startup restoration is absent).
- Employee/support conversations and separate historical support-only internal notes. Neither a note model nor messaging API exists.
- AI analysis, recommendation review, and routing, deferred until the non-AI workflow is functional. Existing AI schema fields do not represent an implemented integration.
- Notifications, email, audit history, three-business-day auto-close, attachments, explicit reopening, and return-to-intake/unrouted operations.

## Remaining Boundaries

General ticket metadata edits retain the existing requester/operational relationship policy, including terminal tickets; the terminal freeze implemented here covers ownership and subtask work. Subtask statuses retain no additional transition graph. Organization-role/membership lifecycle changes, pagination, and broader authentication hardening remain separate work.

Use a real JWT_SECRET for deployment. Access JWTs remain valid until expiry after logout; refresh revocation does not invalidate existing access tokens. NULL organization/ownership values must never be replaced with fabricated records.
