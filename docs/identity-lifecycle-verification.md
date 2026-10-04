# Identity and role lifecycle verification ? 2026-10-04

Both implementation slices are complete. No commit or push was performed. Existing
staged changes were preserved; subsequent edits remain in the working tree.

## Migration and metadata

`20261002120000_user_identity_metadata` adds nullable `User.displayName` and
`User.jobTitle`, each VARCHAR(100), with no invented legacy backfill. New provisioning
and initial bootstrap require trimmed, nonblank values. Metadata PATCH can populate
or update them but rejects null/blank values. Email and role are excluded from
ordinary metadata editing. Safe auth/directory/person projections include the new
labels; current display names fall back to usernames. Job title grants no authority.

The migration was applied to `eds_stabilization_test` only. The development and
production databases still need their normal migration-deploy step before running
this version. Prisma generation and validation passed; migration status reports
24 applied migrations and migrate diff reports no schema differences on the test DB.

## Requester authorization

- Creation and the minimal active ticket-options catalog accept all authenticated,
  active, activated roles. Creation still uses the authenticated requester ID,
  unowned NEW status and existing idempotency/category/scope/attachment validation.
- `queue=requests` and requester summary counts always select the caller's requests.
  Default Agent/Manager lists, Work counts, intake, primary, collaboration and
  Team Lead queues keep their operational predicates. Administrative callers cannot
  select support queues. Detail/public-history/attachment visibility accepts own
  requester identity or independent existing support visibility.
- Metadata editing, cancellation from NEW/ASSIGNED, closing RESOLVED, and reopening
  RESOLVED/CLOSED use requester identity independently of role. Existing responsible
  Manager powers remain. No general Agent or Team Lead reopen/close power is added.
- Public requester replies resume WAITING_FOR_EMPLOYEE regardless of role.
  Notification recipients use current requester/support relationships and ACTIVE
  eligibility. Existing deduplication behavior remains.
- Notes, subtasks, routing and support context endpoints retain separate support
  authorization. Agents/Managers may support their own tickets if independently
  authorized. Requester status is exposed minimally to authorized operational
  readers; inactive status causes a warning, never a ticket lifecycle transition.
- Every role has My Requests; Work and Administration stay separately protected.
  Notification ticket links resolve through requester detail and redirect to Work
  for authorized non-requester viewers; destination APIs remain authoritative.

## Role transitions and offboarding

`PATCH /users/:userId/role` is a dedicated workflow. ADMIN may change
MANAGER/AGENT/EMPLOYEE among those roles; SUPER_ADMIN may also change to/from ADMIN.
No caller can target SUPER_ADMIN or create one through this flow. Active, inactive
and pending targets are supported. Same-role returns `changed: false` without
revocation. A real change preserves User ID, email, username, directory/home fields,
requester history and historical attribution.

Actor/target User locks use stable ID order, active actor/session/authority are
rechecked transactionally, and affected Tickets are locked in ascending ID order.
Within the same Serializable transaction, old responsibilities are reconciled,
role/sessionVersion are updated, and unrevoked sessions, refresh tokens and unused
unrevoked action tokens are revoked. No asynchronous cleanup or automatic retries.

Leaving AGENT clears current primary Agent assignments only, retains Manager/Team/
status, and clears assignedAgentId on every subtask in the current unfinished cycle,
including COMPLETED/CANCELLED. Status, Team, completedById/completedAt and old/ended
cycle work remain. Team Lead and all TeamMember links are removed. Specialties remain.
Entering a role creates/restores no responsibilities.

Leaving MANAGER returns current operational owned tickets to NEW with Manager/Team/
Agent cleared, retaining ticket content and work-cycle existence; it removes
TeamManager links. Terminal tickets and historical cycle records are unchanged.

Deactivation uses the same reconciliation implementation, retaining its deliberate
Agent differences: memberships survive and only TODO/IN_PROGRESS current-cycle
subtask links clear. It now revokes unused AccountActionTokens atomically. Simple
reactivation neither revokes tokens nor restores cleared responsibilities.

## Managerless Teams, reopening and specialties

Before removing TeamManager links, offboarding collects active REGION Teams and
returns only `{ id, name }` in `managerlessTeams`. GLOBAL and archived Teams are
excluded. Role changes and deactivation surface the warning with Review Teams,
which opens the frontend `needsManager=true` filter over the existing Team catalog.
No ticket IDs/counts/previews or replacement picker are returned to administration.

Reopen treats a missing, inactive, unactivated or former Manager as unavailable and
returns the ticket to empty NEW intake. A missing, inactive, unactivated or former
Agent is cleared automatically when other routing is valid. Other invalid routing
keeps the existing explicit returnToIntake requirement.

Existing specialties can be listed/removed by authorized administration for any
current role/status. Adding requires a current active activated AGENT and an active
Specialty. The retained-specialty UI disables additions for former Agents.

## Verification actually run

- Focused unit tests: **6 suites, 97 tests passed** (`auth.service`, `auth.guard`,
  `ticket-authorization.service`, `ticket-visibility.service`, `ticket-lifecycle`,
  `tickets.service`).
- New `identity-lifecycle.e2e-spec.ts`: **26 tests passed** against PostgreSQL/HTTP.
  Includes all-role requester behavior and isolation, metadata, the complete
  source/destination role matrix, pending/inactive targets, revocation, Agent and
  Manager cleanup, retained specialties, historical completion preservation,
  reopen recovery, role versus assignment/membership races, deactivation versus
  reset consumption, and an injected role-update failure verifying atomic rollback.
- Existing focused PostgreSQL/HTTP suites: **165 tests passed across targeted runs**:
  `tickets-authorization` (115), plus `account-metadata`, `notifications` and
  `organization-maintenance` (50 combined). Updated obsolete role-denial and safe
  projection assertions; ticket-list fixtures now scope to their own category so
  unrelated shared intake data cannot invalidate the test.
- Chromium: `node client/test/administration-flow.mjs --account-metadata` and
  `--identity-lifecycle` passed. The latter covers all-role My Requests navigation,
  Admin requester isolation, separate Work/Admin links, creation/edit metadata,
  permitted role choices, cleanup/pending warnings, retained-specialty removal,
  role-change and deactivation managerless warnings, Review Teams filtering,
  SUPER_ADMIN promotion and mobile layouts. No runtime/console errors.
- Backend: `pnpm.cmd --dir server lint`, `typecheck`, `build` passed.
- Frontend: `pnpm.cmd --dir client lint`, `build` (including TypeScript) passed.
- Prisma: `generate`, `validate`, isolated `migrate deploy`, `migrate status`,
  `migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`
  passed. `git diff HEAD --check` passed.

Initial test failures exposed old authorization expectations, fixture-contract
mistakes and shared requester/Work summary usage; these were corrected. Intentional
rollback tests log HTTP 500 errors while asserting successful rollback. Node VM-module
and pg concurrent-query deprecation warnings remain non-failing. Chromium required
execution outside the sandbox because its CDP connection stalled inside it.

## Boundaries

Browser tests use isolated API fixtures; database/HTTP tests exercise real PostgreSQL
separately. Browser-to-live-database, Firefox/Safari, Mailpit/GCS smoke tests and the
full repository regression suite were not run. No deployment was performed.

Atomic ticket-by-ticket reconciliation can be expensive for thousands of active
tickets. Existing serialization/deadlock conflicts remain 409/reload with no silent
retry; no global lock-order redesign was attempted. Current display labels are not
immutable historical name snapshots. Generic audit and historical role-event logging
remain deferred; not every past role transition is recorded.

## Files changed

- [README.md](../README.md)
- [client/src/components/AccountForm.tsx](../client/src/components/AccountForm.tsx)
- [client/src/components/ChangeRoleForm.tsx](../client/src/components/ChangeRoleForm.tsx)
- [client/src/components/EditAccountForm.tsx](../client/src/components/EditAccountForm.tsx)
- [client/src/components/NotificationBell.tsx](../client/src/components/NotificationBell.tsx)
- [client/src/components/TicketCommunication.tsx](../client/src/components/TicketCommunication.tsx)
- [client/src/components/TicketHistory.tsx](../client/src/components/TicketHistory.tsx)
- [client/src/layouts/AppLayout.tsx](../client/src/layouts/AppLayout.tsx)
- [client/src/pages/EmployeeTicketPage.tsx](../client/src/pages/EmployeeTicketPage.tsx)
- [client/src/pages/EmployeeTicketsPage.tsx](../client/src/pages/EmployeeTicketsPage.tsx)
- [client/src/pages/OperationalTicketPage.tsx](../client/src/pages/OperationalTicketPage.tsx)
- [client/src/pages/OrganizationPage.tsx](../client/src/pages/OrganizationPage.tsx)
- [client/src/pages/SetupPage.tsx](../client/src/pages/SetupPage.tsx)
- [client/src/pages/UsersPage.tsx](../client/src/pages/UsersPage.tsx)
- [client/src/routes/AppRoutes.tsx](../client/src/routes/AppRoutes.tsx)
- [client/src/services/administration.service.ts](../client/src/services/administration.service.ts)
- [client/src/services/auth.service.ts](../client/src/services/auth.service.ts)
- [client/src/services/tickets.service.ts](../client/src/services/tickets.service.ts)
- [client/src/services/users.service.ts](../client/src/services/users.service.ts)
- [client/src/types/auth.ts](../client/src/types/auth.ts)
- [client/src/types/tickets.ts](../client/src/types/tickets.ts)
- [client/test/administration-flow.mjs](../client/test/administration-flow.mjs)
- [docs/decision.md](../docs/decision.md)
- [docs/identity-lifecycle-verification.md](../docs/identity-lifecycle-verification.md)
- [server/prisma/migrations/20261002120000_user_identity_metadata/migration.sql](../server/prisma/migrations/20261002120000_user_identity_metadata/migration.sql)
- [server/prisma/schema.prisma](../server/prisma/schema.prisma)
- [server/src/auth/auth.guard.ts](../server/src/auth/auth.guard.ts)
- [server/src/auth/auth.service.spec.ts](../server/src/auth/auth.service.spec.ts)
- [server/src/auth/auth.service.ts](../server/src/auth/auth.service.ts)
- [server/src/auth/dto/create-account.dto.ts](../server/src/auth/dto/create-account.dto.ts)
- [server/src/auth/dto/setup.dto.ts](../server/src/auth/dto/setup.dto.ts)
- [server/src/notifications/notification-events.ts](../server/src/notifications/notification-events.ts)
- [server/src/organization/organization.service.ts](../server/src/organization/organization.service.ts)
- [server/src/tickets/attachments.controller.ts](../server/src/tickets/attachments.controller.ts)
- [server/src/tickets/dto/list-tickets.dto.ts](../server/src/tickets/dto/list-tickets.dto.ts)
- [server/src/tickets/ticket-authorization.service.spec.ts](../server/src/tickets/ticket-authorization.service.spec.ts)
- [server/src/tickets/ticket-authorization.service.ts](../server/src/tickets/ticket-authorization.service.ts)
- [server/src/tickets/ticket-communication.controller.ts](../server/src/tickets/ticket-communication.controller.ts)
- [server/src/tickets/ticket-communication.service.ts](../server/src/tickets/ticket-communication.service.ts)
- [server/src/tickets/ticket-lifecycle.spec.ts](../server/src/tickets/ticket-lifecycle.spec.ts)
- [server/src/tickets/ticket-options.controller.ts](../server/src/tickets/ticket-options.controller.ts)
- [server/src/tickets/ticket-response.mapper.ts](../server/src/tickets/ticket-response.mapper.ts)
- [server/src/tickets/ticket-visibility.service.spec.ts](../server/src/tickets/ticket-visibility.service.spec.ts)
- [server/src/tickets/ticket-visibility.service.ts](../server/src/tickets/ticket-visibility.service.ts)
- [server/src/tickets/ticket-workspace.controller.ts](../server/src/tickets/ticket-workspace.controller.ts)
- [server/src/tickets/tickets.controller.ts](../server/src/tickets/tickets.controller.ts)
- [server/src/tickets/tickets.service.ts](../server/src/tickets/tickets.service.ts)
- [server/src/users/dto/update-user-metadata.dto.ts](../server/src/users/dto/update-user-metadata.dto.ts)
- [server/src/users/dto/update-user-role.dto.ts](../server/src/users/dto/update-user-role.dto.ts)
- [server/src/users/users.controller.ts](../server/src/users/users.controller.ts)
- [server/src/users/users.service.ts](../server/src/users/users.service.ts)
- [server/test/account-metadata.e2e-spec.ts](../server/test/account-metadata.e2e-spec.ts)
- [server/test/identity-lifecycle.e2e-spec.ts](../server/test/identity-lifecycle.e2e-spec.ts)
- [server/test/notifications.e2e-spec.ts](../server/test/notifications.e2e-spec.ts)
- [server/test/organization-maintenance.e2e-spec.ts](../server/test/organization-maintenance.e2e-spec.ts)
- [server/test/tickets-authorization.e2e-spec.ts](../server/test/tickets-authorization.e2e-spec.ts)
- [status.md](../status.md)
