# Administration refinement: ISS-042/043/045/046 (2026-10-16)

This batch completes these four issues only. Previous follow-up batches remain
intact. No backend application service/DTO, authorization, lifecycle, session,
requester or Team-coverage contract was changed.

## Correctable conflicts versus stale records

`AdminDialog` no longer interprets every HTTP 409 as stale data. Its narrow,
unit-tested `admin-conflict.ts` mapping uses existing exact backend contracts:

- 403/404 retain permission/missing-record recovery when `onReload` exists.
- 409 with `Data changed concurrently; reload before retrying` retains reload.
- Known eligibility changes (`Region/Department/Team/Specialty is archived` or
  `Agent must be active and activated`) retain reload to refresh obsolete choices
  or target state.
- Other 409s, including duplicate names/relationships and business prerequisites,
  keep drafts open and editable with existing inline errors and error toasts.
  Unknown 409s do not lock the form. Every retry still reaches authoritative
  validation; there is no automatic retry or weakened transaction protection.

The audit covered organization create/rename, Team creation/coverage/responsibility
forms, Category/Tag creation/rename, account creation/metadata/status/role forms,
and specialty links. Account creation still has no reload callback. Region archival
blocked by active Teams now allows cancellation or retry rather than requiring a
reload; the administrator still must archive those Teams first. No API status or
error payload change was necessary. The mapping is deliberately centralized and
small, not substring matching against arbitrary error prose.

## Catalog identity and migration

Migration `20261016120000_catalog_case_insensitive_names` adds seven PostgreSQL
unique expression indexes using `lower(btrim(name))`. Region, Department,
Specialty, TicketCategory and TicketTag each have a global name key, including
archived rows. Existing service/DTO trimming and administrator-supplied display
casing remain. No lowercase storage, title-casing, accent folding or new Unicode
normalization was introduced; case conversion uses the database's existing locale.
The SQL key trims ordinary surrounding spaces; API trimming continues using the
existing JavaScript whitespace rule.

Team investigation confirmed an existing `(name, regionId)` unique key plus a
partial unique name index for `regionId IS NULL` (GLOBAL). Both allowed case-only
duplicates. Two new expression indexes enforce the same keys case-insensitively:
same name in different Regions remains valid, as does that name in GLOBAL and a
Region; case variants within the same Region or GLOBAL conflict. Coverage changes
and rename naturally use the same constraints. No scope or routing rule changed.

The migration is transactional and takes SHARE locks on the six catalogs before
preflight and index creation. Preflight checks every catalog and each Team coverage
key, including archived records. A collision raises an explicit catalog/name error
and aborts without deleting, renaming or merging rows. Duplicate resolution requires
an explicit business decision before retrying deployment. No collisions were found
in the approved isolated `eds_stabilization_test` database. No controlled fixture
names needed changing and no production/developer records were altered.

Existing ordinary Prisma unique indexes remain. The expression indexes are
migration-owned, documented in `schema.prisma`, and must be retained by future
migrations; Prisma cannot represent them in the schema. Schema diff alone is
therefore insufficient evidence for them: the new PostgreSQL tests also inspect
`pg_indexes` and prove direct concurrent SQL constraint enforcement. Existing
Prisma P2002 handling returns concise 409 messages without exposing SQL/index names.

Only the isolated test database received the migration: 26 migrations applied,
status current, Prisma schema diff empty. Normal developer/deployment databases
still require their normal migration deployment. No reset, `db push`, arbitrary
record repair or role-testing account seed was performed. Database tests use
temporary/uniquely prefixed fixtures and the existing isolated test harness.

## Team navigation and configuration menus

The Team name remains a native React Router link. Its pseudo-element stretches
across the non-action row area; the Actions trigger is a separate sibling above
that area, and its popover remains in the native top layer. There are no nested
interactive elements or row click handlers to propagate menu actions. Native
Enter navigation, ordinary Space scrolling, modifier-click behavior and the link's
accessible name are preserved. Hover, pointer and visible row focus treatments
work for ordinary and Needs Manager rows in both themes and on mobile.

Category and Tag rows now reuse `ActionMenu`, with useful kind/name labels and
Rename plus Archive/Reactivate entries. Create actions remain outside the menus.
Existing confirmation, refresh, error and success-toast behavior is preserved,
with only the intentional dialog conflict-classification change above. Keyboard
open/Tab/Enter and focus return after cancel are browser-tested.

## Verification actually run

Commands are relative to `server` or `client` as indicated. Database commands set
`DATABASE_URL=postgresql://postgres:postgres@localhost:5432/eds_stabilization_test`;
PostgreSQL tests set `TEST_DATABASE_URL` to that same approved isolated database.

| Location | Command | Final result |
| --- | --- | --- |
| server | `pnpm.cmd lint` | Pass |
| server | `pnpm.cmd typecheck` | Pass |
| server | `pnpm.cmd build` | Pass |
| server | `pnpm.cmd test --runInBand --runTestsByPath src/organization/organization.service.spec.ts src/organization/ticket-configuration.service.spec.ts` | 2 suites, 16 tests pass |
| server | `pnpm.cmd test:e2e --runInBand --runTestsByPath test/catalog-names.e2e-spec.ts test/organization-maintenance.e2e-spec.ts test/ticket-configuration.e2e-spec.ts test/team-coverage.e2e-spec.ts` | Existing 3 suites, 41 tests pass; initial new suite had fixture failures described below |
| server | `pnpm.cmd test:e2e --runInBand --runTestsByPath test/catalog-names.e2e-spec.ts` | Corrected new suite: 13 tests pass; final total 54 focused PostgreSQL tests pass across the two runs |
| server | `pnpm.cmd exec prisma generate --config prisma7.config.ts` | Pass |
| server | `pnpm.cmd exec prisma validate --config prisma7.config.ts` | Pass |
| server | `pnpm.cmd exec prisma migrate deploy --config prisma7.config.ts` | New migration applied to isolated test DB only |
| server | `pnpm.cmd exec prisma migrate status --config prisma7.config.ts` | 26 migrations, current |
| server | `pnpm.cmd exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code --config prisma7.config.ts` | No difference detected; expression indexes separately verified |
| client | `pnpm.cmd lint` | Pass |
| client | `pnpm.cmd build` | TypeScript/Vite pass |
| client | `node --test test/admin-conflict.test.mjs` | 2 tests pass |
| client | `node test/administration-flow.mjs --administration-refinement` | Pass |
| client | `node test/administration-flow.mjs --organization-maintenance` | Pass |
| client | `node test/administration-flow.mjs --team-coverage` | Pass |
| client | `node test/administration-flow.mjs --ticket-configuration` | Pass |
| client | `node test/administration-flow.mjs --account-metadata` | Pass |
| repository | `git diff --check` | Pass |

New database coverage includes all five catalogs, Team coverage keys, casing,
whitespace, same-record case edits, rename collisions, archive/reactivate,
concurrent direct SQL writes and safe migration failure with duplicate data.
Initial direct-SQL fixtures omitted the required `updatedAt` value; they now supply
it, and migration assertions compare names independently of database sort order.
The existing injected rollback tests intentionally emit server error logs.

Browser checks cover duplicate create/rename draft retention and correction across
all catalogs and Teams, coverage conflict correction, explicit concurrency reload,
independent Team Actions, native keyboard navigation, configuration lifecycles,
focus return and light/dark/mobile layouts. A new hover test caught CSS precedence
on Needs Manager rows; the scoped hover rule was corrected. The browser driver
also needed native Enter text in its key event. Final runs pass without runtime
errors. The optional account-metadata run was initially blocked by an automatic
approval-review usage limit; it passed after the user asked to continue.

No complete repository regression, normal developer database migration, live
role-testing account setup, manual screen-reader verification, commit or push.
ISS-047, ISS-049 through ISS-052, requester edit locks/ticket-creation changes,
manager statistics/dashboard, MFA and AI remain deferred.

## Exact files for this batch

- `client/src/components/AdminDialog.tsx`
- `client/src/components/admin-conflict.ts` (new)
- `client/src/pages/OrganizationPage.tsx`
- `client/src/pages/TicketConfigurationPage.tsx`
- `client/src/workspace.css` (additional rules; prior batch rules preserved)
- `client/test/admin-conflict.test.mjs` (new)
- `client/test/administration-refinement.mjs` (new)
- `client/test/administration-flow.mjs` (existing prior-batch additions preserved)
- `server/prisma/schema.prisma` (migration ownership comment)
- `server/prisma/migrations/20261016120000_catalog_case_insensitive_names/migration.sql` (new)
- `server/src/organization/ticket-configuration.service.spec.ts` (new)
- `server/test/catalog-names.e2e-spec.ts` (new)
- `docs/decision.md`
- `docs/frontend-polish.md`
- `docs/administration-refinement.md` (new)
- `status.md`
