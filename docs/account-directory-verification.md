# ISS-012 / ISS-013 investigation (2026-10-11)

Status: **not reproduced against the current working-tree application; unresolved**.
No production fix is claimed. The user clarified that only the bootstrap Super
Admin existed, no filters were active, and the row appearing after reload was
that existing root. Pagination therefore does not explain the reported incident.
Earlier uncommitted bootstrap and regression-alignment changes were preserved.

## Findings

- **ISS-012 exact incident cause:** not established. Real PostgreSQL/HTTP tests
  return 409 for normalized duplicate email, preserve every User
  and action-token row, send no mail, and return the identical directory after
  the failure. Concurrent identity creation has one 201 winner and one 409 loser,
  exactly one new identity, one activation token and one mail. No failed duplicate
  persisted an account in these tests; this is not a claim about an uncaptured
  historical request.
- **ISS-013 exact incident cause:** not established. A fresh isolated schema goes
  through actual setup, emailed-token activation and login. Its very first
  authenticated GET /users contains the sole persisted root. Explicit reload is
  identical. Chromium also shows the sole activated root immediately after login
  and navigation, in both the built client and Vite development StrictMode.
- **Same or separate bugs:** cannot determine without reproducing the incident.
  The evidence does not support treating failed creation as a successful insert
  or attributing the root's appearance to that mutation.
- **Mail delivery:** no demonstrated contribution. Account insertion commits
  before invitation issuance. Invitation tokens are issued in their own
  Serializable transaction; mail is sent after that transaction commits. SMTP
  failure preserves the pending account and token and returns 201 with
  `delivery: FAILED`. Issuance exceptions also retain the existing success-with-
  delivery-failure contract. The client closes the successful creation dialog,
  refreshes the directory, and explicitly says the account was created but email
  delivery failed. Duplicate rejection occurs before invitation issuance.

## Directory and reload inspection

GET /users admits ADMIN and SUPER_ADMIN and returns the same administrative
directory to both. The role hierarchy restricts mutation actions, not directory
rows. There is no bootstrap-specific, activation, password, home-organization or
implicit role predicate. Search/status/role predicates are explicit. The client
renders returned rows directly; manageableRoles controls actions only.

The existing bounded contract is id DESC, default 25, maximum 100, with keyset
continuation. With more than 25 newer accounts, the oldest root is on a later
page; tests verify it is reachable exactly once and search/role filtering finds
it. No root pinning, unbounded fetch or sort-contract change was made. This scale
case is distinct from the user's single-account report.

Filters live in the URL. Filter changes reset the cursor. usePagedList holds
component-local results, resets on a new filter key, and aborts superseded
requests, checking cancellation before applying responses. There is no shared
account query cache. The HTTP security middleware specifies Cache-Control:
no-store. The delayed browser test verifies a canceled old empty search cannot
replace newer root results.

The header's current label is **Refresh accounts**; a conflict dialog offers
**Reload administration**. Both call the same reload function: close dialogs,
clear the cursor, increment the request attempt, and fetch the first page with
the same filters. Neither creates accounts or changes the database. Duplicate
errors leave the directory unchanged until this explicit reload.

## Changes in this batch

- `server/test/account-directory.e2e-spec.ts`: seven PostgreSQL/HTTP cases covering
  actual bootstrap first load, identical reload, duplicate email with
  unchanged persisted rows/tokens/mail, concurrent identity conflicts, delivery
  failure, both directory roles, creation hierarchy, filters and pagination.
- `client/test/account-directory.mjs`: focused browser checks for sole-root login
  and initial navigation, identical refresh/conflict reload, duplicate identities,
  filters, canceled stale responses and truthful delivery-failure success.
- `client/test/administration-flow.mjs`: wire `--account-directory` and optional
  `--dev`; align fixture duplicate rejection, unique IDs and delivery status with
  the existing API. Handle only the expected canceled delayed CDP interception.
  Earlier changes in this file belong to the preceding bootstrap batch.
- This investigation record.

No application, API, schema, migration, dependency, authorization, bootstrap,
activation, requester or UI-polish changes. Neither status.md nor decision.md was
changed in this batch. No commit or push.

## Verification

Only `eds_stabilization_test` was used for PostgreSQL tests, with temporary schemas
and fake mail. No development/manual database, SMTP provider or real account was
modified. Browser tests use API fixtures, separately from PostgreSQL/HTTP tests;
they are not a browser connected to a live database.

From `server`, set:

```powershell
$env:TEST_DATABASE_URL='postgresql://postgres:postgres@localhost:5432/eds_stabilization_test'
```

| Command | Result |
| --- | --- |
| `node --experimental-vm-modules node_modules/jest/bin/jest.js --config ./test/jest-e2e.json --runInBand --runTestsByPath test/account-directory.e2e-spec.ts` | 7 tests pass against unchanged application code |
| `node --experimental-vm-modules node_modules/jest/bin/jest.js --config ./test/jest-e2e.json --runInBand --runTestsByPath test/account-directory.e2e-spec.ts test/account-security.e2e-spec.ts test/account-metadata.e2e-spec.ts test/hardening.e2e-spec.ts test/list-scale.e2e-spec.ts` | 5 suites / 67 tests pass |
| `node node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/auth/auth.service.spec.ts src/auth/account-security.spec.ts src/auth/auth.guard.spec.ts src/users/account-authority.spec.ts` | 4 suites / 32 tests pass |
| `pnpm.cmd exec eslint test/account-directory.e2e-spec.ts --max-warnings 0` | Pass |
| `pnpm.cmd typecheck` | Pass |

From `client`:

| Command | Result |
| --- | --- |
| `pnpm.cmd build` | Pass |
| `pnpm.cmd lint` | Pass |
| `node test/administration-flow.mjs --account-directory` | Pass |
| `node test/administration-flow.mjs --account-directory --dev` | Pass, including development StrictMode |
| `node test/administration-flow.mjs` | Pass |
| `node test/administration-flow.mjs --bootstrap` | Pass |
| `node test/session-flow.mjs` | All 16 groups pass |

Repository-root `git diff --check` passes (existing line-ending warnings only).
The initial sandboxed Chromium attempt timed out at Page.enable; successful
browser runs used permitted execution outside the sandbox. Test development
also corrected selector quoting, request-count tracking, expected canceled CDP
interception handling and TypeScript fixture typing. No application changes were
needed to make the tests pass. Existing Node/pg warnings remain visible.

A full unrelated regression gate was not run: final changes are tests/docs only,
with no broad backend/frontend implementation impact.

## Remaining manual reproduction

Do not reset or repeat bootstrap for this batch. Use the existing activated root
in the isolated manual environment described in manual-testing.md.

1. Open browser Network tools with Preserve log before signing in. Navigate to
   `/admin/accounts` without query parameters. Record the first GET /users URL,
   status and response envelope, and whether that root ID is rendered.
2. If it is missing, retain that evidence before refreshing. Note any loading,
   error or empty state and console exception. Record which current server/client
   processes/builds are running and confirm the intended manual database locally.
3. Attempt creation with the existing root email and a different displayName.
   Record the POST /auth/accounts status/body. It should be 409, with no activation
   mail or new identity. Reload administration and compare root IDs in the two
   GET /users responses. Repeat with duplicate displayName and a distinct email: creation must succeed.
4. If the first GET already contains the root but the UI does not, investigate
   rendering/request ordering using that trace. If the first GET fails or omits
   it, investigate that response and runtime/database state. A different running
   build, failed initial fetch or wrong database is only a hypothesis until the
   trace establishes it. Exclude cookies, bearer tokens and activation links from
   any shared evidence.

ISS-012 and ISS-013 remain open pending this runtime evidence. Passing automated
checks do not invalidate the user's observation or establish its exact cause.
