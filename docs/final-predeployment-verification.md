# Final pre-deployment verification

**Date:** 2026-10-18  
**Branch / starting revision:** `development` / `3dfe6383f2b8108e4bb9892f1fc7dd1bf84879fe`  
**Disposition:** **NO-GO — do not deploy until the storage and browser checks below are resolved.**

## Findings requiring follow-up

The application’s configured Google Cloud Storage path is not healthy in this environment. An authenticated live ticket upload returned a storage failure; a subsequent SDK-compatible upload/read/delete probe failed with `EACCES`. A separate earlier storage probe passed, so the result is inconsistent. The bucket policy inspection showed public access prevention and uniform access enabled, no public grants, and the runtime object role limited to `roles/storage.objectUser`. Recheck the runtime credentials and repeat an upload/read/delete test from the deployment runtime before release. The API intentionally masks provider details, so this QA run cannot establish whether the failure came from credentials, the process environment, or the provider request.

The final browser rerun is incomplete. The browser-mode matrix initially completed 31 of 33 modes; a focused account-security rerun then passed. The remaining administration-refinement run exposed that a keyboard-opened action menu did not focus its first action. The menu now opens its native popover explicitly, reports `aria-expanded`, and focuses the first enabled action; the regression checks Tab and Shift+Tab. Client lint and build pass, but the final Chromium rerun could not start because Chrome and Edge GPU processes exited in the host. Treat this keyboard regression as unverified until it passes in a working browser environment.

The latest PostgreSQL end-to-end run passed 507 of 508 tests across 20 of 21 suites. Its only failure was the analytics browser-review subprocess exiting with code 1; the test deliberately omits subprocess output to protect its payload and credentials. A prior complete run passed all 508 tests, but the post-dependency-update run was not fully clean. Rerun the browser review in a working browser environment before deployment.

## Checks that passed

- Server install, lint, typecheck, build, unit tests, dependency-compatibility checks, and manual-test helper checks passed after dependency updates.
- Client install, lint, production build, and all 30 unit tests passed after dependency updates.
- Prisma validation, client generation, migration status, and schema-drift check passed against the local development database. It had 27 completed migrations and no reported drift.
- The full production dependency audits are clean for both server and client. The client full audit is clean. The server full audit has one remaining **moderate development-only** `sprintf-js` advisory; no critical or high findings remain. The audit fix also updated the vulnerable Handlebars development dependency to 4.7.10, which is the version identified as patched by the [maintainer advisory](https://github.com/handlebars-lang/handlebars.js/security/advisories/GHSA-p8wg-vrv2-v86f).
- Authenticated local API checks passed for role separation, ticket visibility, manager transfer and resolution, reopen, cancellation, session invalidation after role change, inactive-account denial, analytics privacy, and attachment access controls. The attachment bytes and access checks passed in the earlier live workflow and the PostgreSQL test suite.
- AI and ticket-assistance smoke checks passed with synthetic test data. Cloud policy inspection passed as described above.

## Local QA data and database handling

The local Docker development database `enterprise_service_desk` was preserved; no production database was targeted. The two verified inactive local ESD test/manual databases were removed as authorized. The isolated `eds_final_checkpoint_test` database was created for migrations and end-to-end checks, then dropped. The final database inventory contains only `enterprise_service_desk` and PostgreSQL system databases.

Twenty local-only QA users were added—five each for Admin, Manager, Agent, and Employee—along with QA organization fixtures and synthetic tickets. The development database now contains 28 active users and 9 synthetic tickets. The existing eight-user baseline remains present; the QA fixture script targeted only the new `@example.test` accounts. No new Super Admin was created. QA account credentials are stored in the ignored local file `docs-local/qa-accounts.local.md`; that file and `.qa-checkpoint/` are excluded from Git. Keep those credentials local and remove the QA users and synthetic tickets when they are no longer needed.

## Code and repository state

Ticket mutation responses now omit the internal `creationHash` and `clientRequestId` fields while keeping persisted idempotency behavior. Regression coverage checks create, replay, and ticket lifecycle responses. The shared action menu gained explicit keyboard focus handling and a browser regression check. The dependency audit fixes updated server and client manifests/lockfiles and pinned the patched Handlebars transitive dependency.

No commit or push was made. The worktree contains the application/test changes and this report for review.
