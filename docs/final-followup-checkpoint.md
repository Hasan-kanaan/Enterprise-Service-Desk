# Final follow-up regression checkpoint (2026-10-16)

## Later operational wrap-up (2026-10-16)

The original checkpoint below remains a historical record. During this later
wrap-up, the normal local development database `enterprise_service_desk` at
`localhost:5432` was verified from the existing development environment and
Docker configuration; it is neither the isolated test DB nor production,
demo/public or remote cloud infrastructure.

The approved command
`pnpm.cmd --dir server exec prisma migrate deploy --config prisma7.config.ts`
successfully applied the three migrations listed in the original pending note
below. No collision or migration warning occurred (only a Prisma version-update
notice; no upgrade was performed). All 26 migrations now match repository state.

Follow-up commands used `pnpm.cmd --dir server exec prisma` with
`--config prisma7.config.ts` and the normal development configuration:

- `migrate status`: all 26 current, exit 0.
- `validate`: valid schema, exit 0.
- `generate`: Prisma client generated successfully, exit 0.
- `migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`:
  no difference detected, exit 0.

Focused smoke used a PostgreSQL READ ONLY transaction: migration-history count
is 26; pg_index/pg_get_indexdef inspection confirms all seven indexes named below
are unique and valid, with lower(btrim(name)), regional Team keys and the GLOBAL
partial predicate intact. LIMIT 0 reads of User displayName/jobTitle and all six
catalogs succeed without exposing account data or creating fixtures. No full
regression rerun was needed. No reset, seed, db push, migration-file edits,
arbitrary data repair or production/demo/cloud database changes occurred.

The seven files listed under Final changes and evidence are included in the
later `chore: finalize follow-up regression checkpoint` commit and pushed to
`origin/development`. Original uncommitted/no-push statements below refer to
the checkpoint before this wrap-up, not the current repository state.

Final follow-up regression checkpoint passed.

ISS-034 through ISS-053 are complete, including ISS-048. This verification used
the current decisions and follow-up contracts; earlier dated deferrals and
uncommitted statements remain historical. No product features or application
behavior changed. Two test files needed corrections for superseded expectations.

## Repository and dependency integrity

- Branch: `development`; HEAD: `28639e4803b075fac59e5b40d008721f033b4855`.
- Upstream: `origin/development`. HEAD, the local upstream and live
  `git ls-remote origin refs/heads/development` matched that SHA.
- Starting tree: clean; no staged, modified or untracked files. The requester
  batch is already committed/pushed in `28639e4`; prior administration/account
  follow-up is in `da04bbd`. This checkpoint alone remains uncommitted/unpushed.
- Node `24.12.0`, pnpm `11.9.0`. `pnpm.cmd install:apps` successfully ran both
  app installs with `--frozen-lockfile`. SHA-256 comparisons confirm all three
  manifests and lockfiles unchanged. The pnpm update-notice metadata fetch was
  blocked in the sandbox, but both installations exited successfully.
- No packages updated, lockfiles normalized, generated sources changed, accounts
  seeded, development database mutated, commit created or push performed.

## Commands and accepted results

Commands below ran from the repository root. All database-backed verification
explicitly set both `TEST_DATABASE_URL` and `DATABASE_URL` to the approved
`eds_stabilization_test` database on local PostgreSQL. The harness's `_test` guard
is unchanged. Existing Docker PostgreSQL was already running.

| Command | Result |
| --- | --- |
| `pnpm.cmd install:apps` | Both frozen installs pass; hashes unchanged |
| `pnpm.cmd --dir server lint` | Pass, including final test correction |
| `pnpm.cmd --dir server typecheck` | Pass, including final test correction |
| `pnpm.cmd --dir server build` | Nest production build passes |
| `pnpm.cmd --dir server test --runInBand` | **21 suites / 269 tests pass** |
| `pnpm.cmd --dir server test:e2e --runInBand` | **18 suites / 386 tests pass** on final tree |
| `pnpm.cmd --dir server test:dependencies` | 2 tests pass |
| `pnpm.cmd --dir server manual-test:verify` | 5 script tests pass; no live seed/reset |
| `pnpm.cmd --dir client lint` | Pass, including browser-test corrections |
| `pnpm.cmd --dir client build` | TypeScript/Vite production build passes |
| `pnpm.cmd --dir client test:phone` | **13 tests pass** |
| `node --test client/test/admin-conflict.test.mjs` | 2 tests pass |
| `pnpm.cmd --dir client test:browser` | All 5 canonical invocations pass; **65 PASS groups** |
| `git diff --check` | Pass |

Full backend coverage includes account security/lifecycle, authorization, sessions,
ticket lifecycle and requester edits, routing, organization/configuration,
attachments, communication, notifications, work history, auto-close, list scale
and migration regressions. No tests were skipped to obtain a passing checkpoint.

Prisma commands used `pnpm.cmd --dir server exec prisma` with
`--config prisma7.config.ts` and the explicit test database environment:

| Prisma arguments | Result |
| --- | --- |
| `validate` | Valid schema |
| `generate` | Client generation succeeds |
| `migrate deploy` | 26 migrations; no pending migrations |
| `migrate status` | All 26 migrations current |
| `migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` | No difference detected; exit 0 |

The 13 catalog-name PostgreSQL tests separately confirm seven unique expression
indexes using `lower(btrim(name))`: `Region_name_ci_key`, `Department_name_ci_key`,
`Specialty_name_ci_key`, `TicketCategory_name_ci_key`, `TicketTag_name_ci_key`,
`Team_name_regionId_ci_key`, and `Team_global_name_ci_key`. They verify display
casing, archived-name reservation, create/rename/concurrent-write enforcement,
Team coverage changes and unchanged Region/GLOBAL uniqueness boundaries.
Migration collision tests execute the actual SQL against temporary shadow tables
and prove collisions abort without repairing the original names. The migration
`20261016120000_catalog_case_insensitive_names` remains intact. Zero Prisma diff
alone was not used as evidence for these migration-owned expression indexes.

## Browser results

The exact canonical `test:browser` script ran unchanged. Its emitted PASS groups:

| Invocation from `client` | PASS groups |
| --- | ---: |
| `node test/employee-flow.mjs` | 21 |
| `node test/operations-flow.mjs` | 19 |
| `node test/administration-flow.mjs` | 7 |
| `node test/session-flow.mjs` | 16 |
| `node test/administration-flow.mjs --manual-polish` | 2 |
| Total | 65 |

All supplementary commands also passed. Each row uses
`node client/test/<flow>-flow.mjs <mode>` from the repository root:

| Flow | Mode | PASS groups |
| --- | --- | ---: |
| administration | `--bootstrap` | 2 |
| administration | `--account-security` | 2 |
| administration | `--shell-profile` | 2 |
| administration | `--loading-feedback` | 1 |
| administration | `--account-directory` | 3 |
| administration | `--account-metadata` | 2 |
| administration | `--identity-lifecycle` | 2 |
| administration | `--lifecycle-ux` | 1 |
| administration | `--phone` | 1 |
| administration | `--administration-refinement` | 1 |
| administration | `--organization-maintenance` | 2 |
| administration | `--team-coverage` | 2 |
| administration | `--ticket-configuration` | 2 |
| employee | `--request-followup` | 1 |
| employee | `--ticket-configuration` | 1 |
| session | `--session-ui` | 3 |
| employee | `--ui-polish` | 1 |
| operations | `--ui-polish` | 1 |
| administration | `--ui-polish` | 2 |
| session | `--ui-polish` | 3 |
| operations | `--list-fallbacks` | 1 |
| Total: 21 supplementary invocations | | 36 |

Final accepted canonical plus supplementary runs emitted **101 PASS groups across
26 invocations**. These are script assertion groups, not individual test counts;
focused correction reruns are not added to that total.

The combined `--request-followup` mode covers New Request guidance, attachment
picker, drafts, active-only home defaults and requester metadata lifecycle/stale
edits. There are no separate attachment-picker or requester-edit flags. Independent
support metadata editing is covered by the canonical operations flow. Canonical
session tests cover draft clearing/account replacement; `--session-ui` adds logout
styling/focus/theme coverage. Final browser runs report no runtime errors.

## Issue and business-rule conclusions

- **ISS-034–038:** Active/pending Setup has no circular sign-in link; completed
  and error navigation remains. Compact activation/reset requirements and password
  submit gating pass, including Unicode/UTF-8 boundaries. Public recovery remains
  generic, and resend does not promise delivery. All 13 phone tests and browser
  checks pass country-aware length, overlong edit/paste rejection, formatting,
  deletion/replacement and international country recognition. Backend security
  semantics are unchanged.
- **ISS-039–041, 044, 048:** Pending role changes explain activation-link
  invalidation; specialty eligibility, retained/removable links, contextual
  Agent/Manager cleanup, deactivation and neutral transitions pass. Directory
  striping and current-device logout styling retain existing behavior.
- **ISS-042–046:** Correctable conflicts preserve editable drafts; genuine stale
  state retains reload. Catalog enforcement passes separately at PostgreSQL level.
  Team row navigation excludes Actions; Category/Tag menus, keyboard and focus
  behavior pass.
- **ISS-047, 049–052:** Tag/Priority guidance and MEDIUM default pass. Application
  file counts, removal/reselection and unchanged limits pass. Non-file drafts
  survive SPA navigation and clear on success. Files are not restored. Home
  Region/Department defaults are editable and intersect active options only;
  null/missing/archived references cannot fabricate selectable options.
- **ISS-053:** Backend and browser checks allow requester structured edits only
  in NEW/ASSIGNED and block IN_PROGRESS, WAITING_FOR_EMPLOYEE, BLOCKED, RESOLVED,
  CLOSED and CANCELLED. Policy runs after Ticket `FOR UPDATE` and current read
  within Serializable. Stale ASSIGNED-to-IN_PROGRESS edits return 409 without
  changing stored metadata. UI directs the requester to conversation and preserves
  unsaved form text for copying until explicit reload; it never converts edits
  into messages. A new requester reply still resumes WAITING_FOR_EMPLOYEE to
  IN_PROGRESS. Independent support metadata authority and terminal freezes pass.
- **Draft/session security:** Real Redux/session browser checks prove same-user
  refresh retention and logout, definitive rejection and identity-change clearing.
  Account replacement is tested through `signedIn`, not a second-account UI login.
  Source review confirms drafts/File objects are not written to localStorage,
  sessionStorage or IndexedDB. Existing durable writes are theme preference and
  non-secret session-coordination metadata. Access tokens remain in memory and
  refresh cookies remain HttpOnly; no storage architecture change was made.

## Failures, classification and corrections

1. Initial `pnpm.cmd --dir client test:browser` failed at `CDP timeout: Page.enable`
   before assertions. This was sandbox/browser startup, not application behavior.
   Permitted execution used the same browser harness. Initial remote/Docker probes
   and npm advisory calls were also sandbox-blocked; permitted checks succeeded.
2. Initial full e2e: 17 suites/385 tests passed, one failed. In
   `organization-maintenance.e2e-spec.ts`, `archives/reactivates catalogs without
   deleting references and excludes new scope choices` expected HTTP 200 for an
   employee edit of its IN_PROGRESS fixture but correctly received 409 under
   ISS-053. The stale expectation now asserts requester rejection, conversation
   guidance and unchanged title, then exercises archived-scope retention through
   the independently authorized responsible Manager. Existing retained-reference
   assertions remain. Focused organization/ticket suites passed 150 tests; final
   organization/catalog verification passed 38 tests; full e2e passed 386 tests.
3. Permitted canonical administration initially timed out waiting for
   `administratively offboards`. The test still expected superseded deactivation
   prose. It now checks the approved heading, revocation and no-replacement copy.
   The focused rerun then timed out at `ready: Save password` because invalid
   confirmation now correctly disables submission. The test asserts the disabled
   state and retains mismatch feedback and successful corrected submission checks.
   The old public resend completion expectation was also updated to current
   conditional wording. The focused administration and subsequent canonical and
   supplementary account-security/lifecycle runs pass. Assertions were not removed
   to bypass product failures.
4. The new server test assertion initially triggered a formatting lint error and
   TS2339 because the HTTP helper types successful PATCH bodies as tickets. The
   correction uses the existing typed-test convention for error-body matching and
   proper formatting. Final lint/typecheck/build and focused/full e2e pass.

No application regression was found. Intentional rollback HTTP 500/attachment
cleanup logs are expected only in the context of their passing assertions.
Existing pg concurrent-query deprecation and Node VM-module warnings remain.

## Audits, development database and manual boundaries

`pnpm.cmd --dir server audit --prod --audit-level high` and the equivalent client
command both pass with **no known vulnerabilities**. Informational
`audit --audit-level low` results (development-inclusive, exit 1) remain:

- Server: **28 findings: 2 critical, 20 high, 6 moderate**, involving handlebars,
  brace-expansion, js-yaml, browserslist, baseline-browser-mapping and sprintf-js.
- Client: **9 findings: 7 high, 2 moderate**, involving brace-expansion,
  browserslist, baseline-browser-mapping and source-map-js.

These tooling advisories were recorded without dependency remediation.

A separate read-only Prisma status check of normal development
`enterprise_service_desk` reports three pending migrations:

- `20261002120000_user_identity_metadata`
- `20261011120000_remove_username`
- `20261016120000_catalog_case_insensitive_names`

Normal development must receive migration deployment before manually testing
case-insensitive catalog behavior there. With its intended development database
configuration selected, the existing command is
`pnpm.cmd --dir server exec prisma migrate deploy --config prisma7.config.ts`.
This command was **not run against development**. No reset, `db push`, development
seed, arbitrary duplicate repair or migration change occurred.

Browser tests use isolated API/mail fixtures; PostgreSQL/HTTP tests are separate.
This is not browser-to-live-backend certification. Real SMTP/Mailpit delivery and
mailbox rendering, manual screen-reader validation, Firefox/Safari, native browser
zoom, real GCS and public deployment were not tested. The user's prior Mailpit
activation experience does not certify those areas. Manual Network evidence for
ISS-012/ISS-013 remains outstanding.

Manager statistics/dashboard remains deferred, as do AI, MFA/SMS/WhatsApp, ticket
email, deployment/cloud infrastructure, generic audit/history and malware scanning.
Role-testing account seeding/setup is not outstanding product work: ordinary
accounts can be provisioned through the real flow and activated using local
Mailpit. No new role-testing accounts were created.

The repository contains `docs/Enterprise_Service_Desk_Issue_Log_Simplified.xlsx`.
It was not edited: spreadsheet status updates were not explicitly included in
this run and remain separate from this documentation reconciliation.

## Final changes and evidence

Exact checkpoint changes:

- `client/test/administration-flow.mjs`: current deactivation/password/resend checks.
- `server/test/organization-maintenance.e2e-spec.ts`: current requester/support policy.
- `status.md`: new current checkpoint and commit/defer reconciliation.
- `docs/administration-refinement.md`: new checkpoint link and current migration boundary.
- `docs/request-followup.md`: new checkpoint link and current completion/commit truth.
- `docs/frontend-polish.md`: new checkpoint link and final verified completion.
- `docs/final-followup-checkpoint.md`: this report (new file).

`docs/decision.md` already states the durable rules correctly and is unchanged.
Historical entries were preserved. Final diff review found no debug code, secrets,
authorization removal, test-only product bypasses, schema/migration/dependency
changes, unexpected generated files or machine-specific paths added to source/docs.
Evidence remains in ignored `final-followup-*.log` files; no temporary helper
scripts were added. Final status: six modified tracked files, this one untracked
report, nothing staged. **No commit or push was performed.**
