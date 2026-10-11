# Identity model and navigation verification - 2026-10-11

Implemented against the existing dirty working tree. Earlier UI polish, bootstrap,
security and directory work was preserved. No commit, push, database reset, account
replacement, profile-image feature or authorization expansion was performed.

## Former username uses and replacements

| Former use | Replacement |
| --- | --- |
| Prisma User column / unique index | Column and index removed by a forward migration; User.id and unique email retained. |
| Legacy missing human name | One-time migration backfill from former username; neutral Account only if that is also blank. Valid displayName values remain exactly intact. |
| Setup / pending-root correction | displayName, jobTitle, email, setupSecret and optional restart; no username. |
| Admin account provisioning | displayName, jobTitle, email, permitted role and optional phone; no username. |
| Admin metadata PATCH | displayName/jobTitle/phone/home organization only; email and role remain excluded. |
| Username lookup and duplicate checks | Removed; normalized email uniqueness remains. Duplicate displayName is permitted. |
| Auth guard, login/refresh and profile identity | Required displayName, existing authorized metadata and stable IDs; no username. |
| Obsolete unused RegisterDto | Removed; no public registration route was added. |
| Account directory search and identity | displayName primary, email secondary; search matches both. Existing limits, pagination, filters and stale-response logic retained. |
| Organization members, Manager and Team Lead projections | id/displayName and existing role/status where already exposed. |
| Ticket/subtask assignee lookup and search ordering | displayName with id tie-break; same eligibility predicates and maximum 20 results. No new email disclosure/search in operational selectors. |
| Requester/support message and internal-note author | displayName through the existing authorized author projection. Requester badges still compare IDs. |
| Ticket owners, subtask assignees/completers and cycle/history actors | displayName, with existing Unassigned/Not recorded states; no email or raw-user-ID fallback. |
| Retained people selection / member removal confirmation | Known displayName passed from current context; neutral selection/unavailable labels if projection is absent. |
| Role/deactivation dialogs, account/team lists | displayName; IDs still identify mutations. |
| Topbar / Profile / compact account marker | Shared Avatar using first Unicode grapheme of trimmed displayName; neutral UserRound icon for corrupt blank data. |
| Sidebar bottom identity control | Settings gear/link with active route state, title and aria-label; shared desktop/mobile rendering. |
| Notifications | Audited: existing event-based wording contains no person-name fallback and remains unchanged; bell preserved. |
| Unit, HTTP, browser and seed fixtures | Required deterministic displayName and email; no runtime username dependency. |
| Architecture and manual verification documentation | Superseded identity, uniqueness, fallback, setup and navigation descriptions updated. |

Intentional remaining occurrences of the word username are historical SQL migrations,
historical-schema migration test inputs, negative contract assertions, this removal
documentation, URL credential parsing and HTML's standard `autocomplete="username"`
on the **email** login input. That autocomplete token is browser/password-manager
semantics, not a product field, label or fallback. Historical migrations were not
rewritten because existing installations have already applied their checksums.

## Schema and migration

`20261011120000_remove_username` runs transactionally: backfills only NULL/blank
legacy displayName, sets NOT NULL and a nonblank CHECK constraint, drops
User_username_key, then drops username. No unique constraint is added to displayName.
All inspected User relationships, session/token ownership and historical attribution
reference id, never username. Email, credentials, valid names, timestamps, IDs,
relationships and history are preserved. Duplicate names are deliberately allowed.

Prisma validate/generate pass. The isolated `eds_stabilization_test` database has
25 applied migrations and no Prisma schema drift. The migration was applied there;
development and manual databases were not reset, seeded or migrated by this work.
Fresh-schema HTTP suites also apply the migration chain in private schemas.
Migration assertions cover NULL and blank backfill, valid-name preservation,
legacy login/password-change compatibility and retained token/session ownership.

For development, with the intended DATABASE_URL configured in server/.env, run
from the repository root before starting the new server/client:

```powershell
pnpm.cmd --dir server exec prisma migrate deploy
pnpm.cmd --dir server exec prisma generate
```

For the manual database use the same commands with DATABASE_URL explicitly pointing
to `enterprise_service_desk_manual`; for tests it points to `eds_stabilization_test`.
Do not use migrate reset. Deploy schema, server and client together: old clients
sending username receive 400 under the existing strict DTO policy, and old servers
still expecting the dropped column are incompatible. Reload open browser tabs after
deployment. Sessions are not intentionally revoked or changed by this migration.
Legacy names copied once from the old column can be corrected through authorized
metadata editing; they are now ordinary displayName data, not a fallback.

## API, bootstrap and account behavior

Setup/account DTOs reject the obsolete username key. Account metadata editing also
rejects it. displayName is trimmed, nonblank, at most 100 characters and preserves
case; duplicate names are accepted. Email stays normalized, unique and immutable
after provisioning. Login remains email plus password. Bootstrap remains setup
secret -> one pending root -> emailed activation -> chosen password -> normal login.
Pending-root restart/correction, single-root locking, activation, recovery, role
transitions, password rules, session coordination and lifecycle checks are unchanged.

Profile shows the shared initial, displayName, email, job title and existing role,
password and session controls. Topbar contains one Profile link with a visible
focus state and responsive name, while retaining notifications. Sidebar bottom
opens the existing /settings placeholder using a gear, active state and accessible
label/title; the mobile drawer closes on navigation and retains its focus behavior.

## Verification

Commands below ran from the repository root unless stated otherwise.

| Check | Result |
| --- | --- |
| `pnpm.cmd --dir server lint` | Pass |
| `pnpm.cmd --dir server typecheck` | Pass |
| `pnpm.cmd --dir server build` | Pass |
| `pnpm.cmd --dir server test --runInBand` | 19 suites / 244 tests pass |
| `pnpm.cmd --dir server test:dependencies` | 2 pass |
| `pnpm.cmd --dir server manual-test:verify` | 5 pass |
| Focused account-security/account-metadata/account-directory/identity-lifecycle PostgreSQL | 4 suites / 58 tests pass |
| Focused ticket-authorization / historical work-cycle migration PostgreSQL | 2 suites / 116 tests pass |
| Full PostgreSQL e2e | 17 suites / 363 tests pass |
| Prisma validate / generate / test migration status / drift | Pass; 25 migrations; no difference |
| `pnpm.cmd --dir client lint` | Pass |
| `pnpm.cmd --dir client build` | TypeScript and Vite pass |
| `pnpm.cmd --dir client test:phone` | 8 pass |
| `pnpm.cmd --dir client test:browser` | Employee, operations, administration, all 16 session groups and manual-polish pass |
| Bootstrap, account-metadata, identity-lifecycle and account-directory browser modes | Pass |
| Employee, operations, administration and session `--ui-polish` modes | Pass |
| `git diff --check` | Pass |
| Client runtime audit | No known vulnerabilities |
| Server runtime audit | FAIL: existing proxy-addr critical advisory GHSA-jqcg-44mw-7w3h; patched version reported as 2.0.8 |

The server lockfile was unchanged by this phase. The full gate is therefore **not
entirely green**: the runtime dependency advisory requires a separate dependency fix.
Dependency compatibility checks pass, but do not remove an advisory. Audit command:
`pnpm.cmd --dir server audit --prod --audit-level high` (client equivalent also run).
No dependency suppression, threshold change or unrelated package upgrade was made.

PostgreSQL commands used:

```powershell
$env:TEST_DATABASE_URL='postgresql://postgres:postgres@localhost:5432/eds_stabilization_test'
pnpm.cmd --dir server test:e2e --runInBand --runTestsByPath test/account-security.e2e-spec.ts test/account-metadata.e2e-spec.ts test/account-directory.e2e-spec.ts test/identity-lifecycle.e2e-spec.ts
pnpm.cmd --dir server test:e2e --runInBand --runTestsByPath test/tickets-authorization.e2e-spec.ts test/work-cycle-migration.e2e-spec.ts
pnpm.cmd --dir server test:e2e --runInBand
```

Additional browser commands:

```powershell
node client/test/administration-flow.mjs --bootstrap
node client/test/administration-flow.mjs --account-metadata
node client/test/administration-flow.mjs --identity-lifecycle
node client/test/administration-flow.mjs --account-directory
node client/test/administration-flow.mjs --manual-polish
node client/test/employee-flow.mjs --ui-polish
node client/test/operations-flow.mjs --ui-polish
node client/test/administration-flow.mjs --ui-polish
node client/test/session-flow.mjs --ui-polish
```

Added/updated checks include obsolete DTO rejection, missing/blank required names,
duplicate-name creation/edit with distinct emails, duplicate-email rejection,
name search, exact safe projections, migration backfill, setup/create/edit field
absence, Unicode composed/decomposed/emoji grapheme initials, neutral fallback,
keyboard Profile/Settings activation, active Settings state, mobile navigation and
correct selected-person names after clearing lookup search.
Existing authorization, result-limit, privacy, relationship, lifecycle and session
assertions remain. Browser fixtures now search/display names without imposing
username's former uniqueness or lowercase rules.

Earlier failures were corrected transparently: stale nullable-name/field-order
expectations, a historical-schema fixture that must still use its historical column,
and an existing rotation test that established two sessions concurrently (legitimate
Serializable login conflict). That test now establishes its independent sessions
sequentially and retains simultaneous rotation, exactly-one-success, replay rejection
and independent-device logout assertions. Runtime session behavior was not changed.
One focused session UI run timed out waiting for login after logout; its unchanged
rerun passed, as did the full session suite. Docker initially was stopped and
sandboxed Chromium/network audits were unavailable; after starting installed Docker
and using permitted Chromium/network execution, the reported final runs passed
apart from the dependency advisory. Expected injected rollback/cleanup logs and pg
warnings remain visible. Screenshots of desktop Settings/notification and 320px
mobile topbar were inspected. Browser suites use isolated API fixtures, not live SMTP.

## Manual seed and retest

The guarded manual seed now writes deterministic `Manual <persona>` display names
and `manual-<persona>@example.test` emails, with unchanged IDs/relationships generated
by the database. Seed validation uses email to find pending/inactive personas. The
existing seed remains explicit, refuses inappropriate targets/merges, and preserves
an existing valid fixture on repeated execution. No manual seed/reset was run.

1. Apply migrations to the intended development/manual database and restart both apps.
2. On a fresh manual database, verify setup has display name/job title/email/secret
   only; follow real Mailpit activation, choose password, and sign in with email.
3. Before activation, correct/restart pending setup and verify old links fail; after
   activation verify setup stays closed. Check existing accounts still sign in.
4. Provision/edit an authorized account without username; blank name fails, duplicate
   displayName with a different email succeeds, duplicate email fails, and email/role
   remain excluded from metadata editing. Check delivery-failure/resend behavior.
5. Verify Profile and account directory show displayName as primary and email secondarily;
   inspect login/profile/directory/people/message/history responses for absent username.
6. Check accented, combining-mark and emoji initials; keyboard-activate topbar Profile;
   check focus and Back, notification bell and 320/390px layout. Blank corrupt data
   should show a neutral icon, without exposing email as its initial.
7. Check sidebar Settings gear, active state and tooltip/label on desktop/mobile;
   no sidebar avatar/Profile entry. /settings remains the existing placeholder.
8. Search admin directory by displayName/email; search operational people by displayName.
   Verify eligibility and 20-result limits, requester isolation and unchanged team rules.
9. Check owners, team leads/managers, messages, notes, completion credit and historical
   actors use current displayName while stable IDs/history remain intact.
10. Retest password change, recovery, remote/current-device logout and multi-tab sessions.
11. ISS-012/ISS-013 remain unresolved pending real manual Network evidence. Their
    pagination/stale-response logic was not modified; retain the dedicated evidence
    collection checklist in account-directory-verification.md.

## Files changed for this phase

This list is relative to the saved pre-change working tree, not a claim that all
pre-existing git changes belong to this phase. Generated Prisma client/build output
and ignored verification logs are not listed. RegisterDto is deleted.

- `README.md`
- `client/src/components/AccountForm.tsx`
- `client/src/components/AssignmentFields.tsx`
- `client/src/components/Avatar.tsx`
- `client/src/components/ChangeRoleForm.tsx`
- `client/src/components/EditAccountForm.tsx`
- `client/src/components/OrganizationForms.tsx`
- `client/src/components/PeopleLookup.tsx`
- `client/src/components/SubtaskForm.tsx`
- `client/src/components/SubtaskUI.tsx`
- `client/src/components/TicketCommunication.tsx`
- `client/src/components/TicketHistory.tsx`
- `client/src/components/TicketOperationForm.tsx`
- `client/src/layouts/AppLayout.tsx`
- `client/src/pages/EmployeeTicketPage.tsx`
- `client/src/pages/EmployeeTicketsPage.tsx`
- `client/src/pages/OperationalTicketPage.tsx`
- `client/src/pages/OrganizationPage.tsx`
- `client/src/pages/ProfilePage.tsx`
- `client/src/pages/SetupPage.tsx`
- `client/src/pages/SubtaskPage.tsx`
- `client/src/pages/UsersPage.tsx`
- `client/src/services/auth.service.ts`
- `client/src/services/users.service.ts`
- `client/src/types/administration.ts`
- `client/src/types/auth.ts`
- `client/src/types/tickets.ts`
- `client/src/workspace.css`
- `client/test/account-directory.mjs`
- `client/test/administration-flow.mjs`
- `client/test/communication-fixture.mjs`
- `client/test/employee-flow.mjs`
- `client/test/list-fixture.mjs`
- `client/test/manual-polish.mjs`
- `client/test/operations-flow.mjs`
- `client/test/session-flow.mjs`
- `docs/account-directory-verification.md`
- `docs/account-security.md`
- `docs/bootstrap-verification.md`
- `docs/decision.md`
- `docs/frontend-polish.md`
- `docs/identity-lifecycle-verification.md`
- `docs/identity-model-verification.md`
- `docs/manual-testing.md`
- `docs/manual-ui-verification.md`
- `server/prisma/migrations/20261011120000_remove_username/migration.sql`
- `server/prisma/schema.prisma`
- `server/scripts/manual-test.cjs`
- `server/scripts/manual-test.test.cjs`
- `server/src/auth/account-security.service.ts`
- `server/src/auth/account-security.spec.ts`
- `server/src/auth/auth.guard.ts`
- `server/src/auth/auth.service.spec.ts`
- `server/src/auth/auth.service.ts`
- `server/src/auth/dto/create-account.dto.ts`
- `server/src/auth/dto/register.dto.ts`
- `server/src/auth/dto/setup.dto.ts`
- `server/src/organization/organization.service.ts`
- `server/src/security/security.spec.ts`
- `server/src/tickets/ticket-communication.service.ts`
- `server/src/tickets/ticket-lifecycle.spec.ts`
- `server/src/tickets/ticket-response.mapper.ts`
- `server/src/tickets/ticket-visibility.service.ts`
- `server/src/tickets/ticket-workspace.controller.ts`
- `server/src/users/dto/update-user-metadata.dto.ts`
- `server/src/users/users.service.ts`
- `server/test/account-directory.e2e-spec.ts`
- `server/test/account-metadata.e2e-spec.ts`
- `server/test/account-security.e2e-spec.ts`
- `server/test/attachments.e2e-spec.ts`
- `server/test/auto-close.e2e-spec.ts`
- `server/test/hardening.e2e-spec.ts`
- `server/test/http-test.ts`
- `server/test/identity-lifecycle.e2e-spec.ts`
- `server/test/list-scale.e2e-spec.ts`
- `server/test/notifications.e2e-spec.ts`
- `server/test/organization-maintenance.e2e-spec.ts`
- `server/test/team-coverage.e2e-spec.ts`
- `server/test/ticket-configuration.e2e-spec.ts`
- `server/test/ticket-stream-scale.e2e-spec.ts`
- `server/test/tickets-authorization.e2e-spec.ts`
- `server/test/work-history.e2e-spec.ts`
- `status.md`
