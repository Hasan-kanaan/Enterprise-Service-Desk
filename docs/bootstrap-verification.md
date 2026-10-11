# Verified bootstrap: ISS-002 / ISS-003 / ISS-004

Implemented 2026-10-11. No commit or push.

## Root cause and implementation

Setup previously hashed the submitted password and immediately set activatedAt,
then considered any root identity completion. Login rendered without checking
bootstrap availability. Thus an unverified mailbox could own the only root.

Setup now reserves one pending User and creates its existing ACCOUNT_ACTIVATION
link in the same transaction. Restart=true, protected by the same timing-safe
installation-secret check, corrects that User and replaces unused activation
links. Advisory locking protects the single-root invariant, and User row locking
coordinates with activation. Existing activation selects the password, verifies
the mailbox, revokes sessions/action tokens and requires normal sign-in.
SMTP failure does not strand the reserved account. No role, session, ordinary
account lifecycle or ticket-authority rules were weakened.

Login waits for setup status, redirects fresh/pending deployments to /setup,
and renders normally after activation. Setup explains automatic Super Admin
assignment, email verification, password ownership and secret-protected restart.

## API and schema

No schema, migration, dependency, SMTP configuration or provider changes.
Legacy activated roots remain complete, without backfilled email verification.

- GET /auth/setup/status retains `{ available }`, now based on activated root
  existence, including administratively inactive activated roots.
- POST /auth/setup retains required displayName, jobTitle, email and
  setupSecret; removes password; adds optional boolean restart (default false).
  Unknown password/role fields are rejected by existing DTO validation.
- Success returns `{ message: "Super Admin pending email activation", delivery:
  "SENT" | "FAILED" }`; no user/session/token response. It stays on setup.
- Pending duplicate creation and completed setup/restart return generic 409.
  Incorrect secret returns 403; invalid DTO returns 400. Identity collisions
  neither change unrelated users nor identify them in the response.
- POST /auth/activate remains token + newPassword, with the existing single-use
  24-hour activation and no automatic login. Setup secret has no authority after
  activation. Ordinary account reset/resend behavior remains unchanged.

## Changed files

- Backend: server/src/auth/account-security.service.ts (atomic reservation/restart,
  shared token creation/mail delivery); auth.service.ts (secret check/delegation);
  dto/setup.dto.ts (password-free input/restart); server/src/users/users.service.ts
  (activated-root status, removal of immediate-activation bootstrap).
- Frontend: client/src/pages/LoginPage.tsx, SetupPage.tsx;
  client/src/services/auth.service.ts.
- Tests: server/src/auth/auth.service.spec.ts, auth.guard.spec.ts,
  account-security.spec.ts; server/src/security/security.spec.ts;
  server/test/hardening.e2e-spec.ts, account-security.e2e-spec.ts;
  client/test/administration-flow.mjs, employee-flow.mjs, operations-flow.mjs,
  session-flow.mjs. Existing account-security fixtures now supply the previously
  approved required displayName/jobTitle. Browser fixtures explicitly return
  completed setup status; administration adds --bootstrap acceptance mode.
- Documentation: README.md, status.md, docs/decision.md, account-security.md,
  manual-testing.md and this report.

## Coverage

The hardening HTTP tests cover secret rejection with no created account,
concurrent setup (one success/one conflict), exactly one pending identity,
NULL credentials/verification, issued email, no cookie, login rejection,
protected-route and provisioning rejection even with a signed pending-user JWT,
secret-protected correction, generic collision/rollback, expired/replaced links,
SMTP failure/restart, concurrent restarts retaining one identity/live token, activation/restart races,
password selection, activation replay rejection, no automatic login, successful
normal login and permanent setup/restart closure. Existing account-security
coverage retains token-purpose, expiry, concurrency, cooldown, session revocation,
ordinary provisioning hierarchy and operational eligibility checks.

Chromium --bootstrap covers first-run redirect, no welcome/recovery primary UI,
no redirect loop, password-free setup, wrong-secret error, delivery instructions,
email correction/link replacement, activation/password selection, no auto-login,
completed /setup and normal post-bootstrap login. The session suite exercises
multi-tab refresh/login/logout/recovery behavior.

## Verification commands and results

Commands below run from the repository root unless a working directory is stated.
PowerShell requires pnpm.cmd here (pnpm.ps1 is blocked by execution policy).
PostgreSQL tests use only the existing isolated eds_stabilization_test database;
no development/manual database was reset or seeded. Browser tests use isolated
API fixtures, not live SMTP or a live database.

| Command | Result |
| --- | --- |
| `pnpm.cmd --dir server lint` | Pass |
| `pnpm.cmd --dir server typecheck` | Pass |
| `pnpm.cmd --dir server build` | Pass |
| `pnpm.cmd --dir client lint` | Pass |
| `pnpm.cmd --dir client build` | Pass |
| `node node_modules/jest/bin/jest.js --runInBand` (server) | 19 suites, 244 tests pass |
| `node --test test/dependency-compatibility.cjs` (server) | 2 tests pass |
| `node test/administration-flow.mjs --bootstrap` (client) | Pass |
| `node test/session-flow.mjs` (client) | All 16 groups pass |
| `node test/employee-flow.mjs` (client) | Pass after regression alignment below |
| `node test/operations-flow.mjs` (client) | Pass after regression alignment below |
| `node test/administration-flow.mjs` (client) | Pass after regression alignment below |
| `git diff --check` | Pass |

Database command (PowerShell, then working directory server):

```powershell
$env:TEST_DATABASE_URL='postgresql://postgres:postgres@localhost:5432/eds_stabilization_test'
node --experimental-vm-modules node_modules/jest/bin/jest.js --config ./test/jest-e2e.json --runInBand
```

Initial bootstrap PostgreSQL result: **12 suites pass / 4 fail; 348 tests pass / 9 fail**.
Those nine stale expectations are classified and corrected in the follow-up below.
Both hardening and account-security suites passed (24 tests combined); production
behavior was not changed to accommodate old requester/projection assertions.

Focused command also run with the same database environment:

```powershell
node --experimental-vm-modules node_modules/jest/bin/jest.js --config ./test/jest-e2e.json --runInBand --runTestsByPath test/hardening.e2e-spec.ts test/account-security.e2e-spec.ts
```

The initial runs found stale identity fixtures and a new test using /profile
instead of /users/profile; both were corrected. An initial new browser assertion
used the old administration heading and was corrected. Sandboxed Chromium timed
out at CDP Page.enable; browser results above use the permitted outside-sandbox
run. Initial pnpm test wrappers stalled and were interrupted; Jest was then run
directly with Node. No Mailpit delivery smoke or production provider was exercised.

## Manual retest

1. Follow docs/manual-testing.md with the isolated manual database and Mailpit.
   Before seeding, open /login and confirm automatic /setup navigation without
   Welcome back, Forgot password or Resend activation as the primary screen.
2. Submit an incorrect setup secret: no account/mail should be created. Submit
   the correct secret and a test identity: receive activation instructions,
   remain on /setup, and see no password input or authenticated session.
3. Before activating, correct the email with Restart pending setup selected and
   the secret. The old email link must fail; only the newest link should work.
   Repeating setup without restart must not reserve another root.
4. Open the newest Mailpit activation link, select your own password, and confirm
   it asks you to sign in. Reusing the link must fail. Sign in with that password.
5. In a signed-out browser, /login should now show normal sign-in/recovery options;
   /setup should show Initial setup is complete. Even the valid setup secret must
   no longer permit changing this root. Only then run the guarded manual seed.
6. Optionally stop SMTP before submitting a fresh/pending bootstrap: confirm a
   delivery-failure explanation, then restore SMTP and restart with the secret.
   Expired links similarly recover via restart; no second root should appear.

## Regression alignment follow-up (2026-10-11)

Bootstrap is accepted pending manual retest. This follow-up changes **tests and
documentation only**; it does not change any production file, API, authorization,
account directory, UI, schema or dependency. Earlier uncommitted bootstrap changes
remain present. No commit or push.

Authority: README's universal-requester section, the current status entries and
`docs/decision.md` (universal requester identity/lifecycle, communication and
attachment privacy), plus the approved frontend polish documented in
`docs/frontend-polish.md`. Dated blanket role exclusions are superseded.

### Classification of every previously failing PostgreSQL case

All nine are **A: stale expectations**. No category B application regression or
category C unrelated application defect was found. The HTTP status is specific to
the endpoint: hidden public reads/deletions return 404; support-only role guards
and forbidden metadata mutations retain 403. These are not blanket replacements.

| Previous failure | Why stale and exact correction |
| --- | --- |
| Attachments: creates immutable original ticket files | ADMIN/SUPER_ADMIN are unrelated to the employee's ticket. Download expects generic 404, like other unrelated users, instead of role-only 403. Existing requester download, intake visibility, private storage and immutable-file assertions remain. |
| Attachments: current message attachment visibility | Unrelated ADMIN/SUPER_ADMIN download now expects 404. Current manager/agent/lead/collaborator success and loss-of-relationship denial remain. |
| Attachments: author deletion of message attachments | Public message attachment deletion by unrelated administrators expects 404. Internal-note role rejection stays 403; authorized nonauthors still get 403; only the current author may delete. |
| Attachments: soft deletion of messages | Unrelated administrators' public-message deletion expects 404. Internal-note guards and authorized nonauthor denial retain 403. Tombstones, replay, attribution and creation-key consumption checks remain. |
| Ticket stream: employee/collaborator/operational exclusion | Unrelated ADMIN public messages expect 404; added explicit ADMIN internal-notes 403. Employee note denial and collaborator access/loss checks remain. |
| List scale: ADMIN directory/access | Replaced `/tickets` blanket 403 with a real own-request fixture. Both default and `queue=requests` lists must contain exactly that ticket; own detail is 200, unrelated search empty, unrelated detail 404, metadata mutation 403 with unchanged title. Support people lookup remains 403 even on own requests. |
| List scale: SUPER_ADMIN directory/access | Same precise requester-only and mutation/support-denial assertions as ADMIN, with an independent root-owned fixture. Directory pagination/filtering remains unchanged. |
| List scale: primary people lookup | Existing `ticket-workspace.controller.ts` selects exactly id and displayName. Added displayName to the exact key and GLOBAL collaborator expectations. Fixtures now require displayName; every returned projection is checked against persisted identity, and the 20-result/eligibility bounds remain. No production field was added. |
| Team coverage: identity/relationships/work preservation | Other people's tickets remain hidden with 404 after every coverage transition for both administrative roles. All stable-identity, ownership, current/terminal work and relationship assertions remain. |

### Classification of every previously failing browser suite

All three are **A: stale expectations**. Later assertions exposed after the first
stop were inspected against the same approved UI and corrected in these suites.

| Suite | Test-only correction and preserved behavior |
| --- | --- |
| Employee | Replaced ADMIN blanket `/tickets` exclusion with ADMIN and SUPER_ADMIN own-list/detail access. Still asserts absent support navigation, blocked `/work/intake` without support API requests, and the current inaccessible-ticket state. No runtime errors are accepted. |
| Operations | Replaced old `Posting is unavailable` text with `This conversation is read-only.` The absence of post/edit/subtask controls and notes before intake ownership remains. Replaced `.communication:last-of-type` with the named internal-notes region because attachments/history are now separate sibling sections. Exact 61/62 record counts, pagination, private draft retention, upload/edit/delete checks remain. |
| Administration | Assert current `h1` Administration and navigate via the Accounts destination link. Requester `/tickets/:id` is no longer treated as a role-blocked support route: the fixture returns 404 and the test verifies the API request, unavailable state and no notes/subtask/support requests. Administration screens still reject unexpected ticket API requests; support routes and operational-user administration routes remain blocked. Activation/reset tests open the account's Actions menu and select the named mail action instead of clicking the first button. Password ownership, no auto-login, replay, reset and hierarchy checks all remain. |

A new deny-mutation assertion initially expected 404, but inspection of
TicketAuthorizationService confirmed the approved forbidden-mutation 403; the
assertion was corrected before the passing run. The extra GLOBAL people
expectation and older browser selectors were hidden behind the original failures.
The scoped requester fixture in the administration harness preserves its strict
no-ticket-requests rule on actual administration screens.

### Follow-up files

- `server/test/attachments.e2e-spec.ts`
- `server/test/ticket-stream-scale.e2e-spec.ts`
- `server/test/list-scale.e2e-spec.ts`
- `server/test/team-coverage.e2e-spec.ts`
- `client/test/employee-flow.mjs`
- `client/test/operations-flow.mjs`
- `client/test/administration-flow.mjs`
- `docs/bootstrap-verification.md`, `status.md`

### Follow-up verification

Previously failing suites were run first, then the full gates. PostgreSQL uses the
same isolated `_test` database named above. Exact commands, in `server`:

```powershell
$env:TEST_DATABASE_URL='postgresql://postgres:postgres@localhost:5432/eds_stabilization_test'
node --experimental-vm-modules node_modules/jest/bin/jest.js --config ./test/jest-e2e.json --runInBand --runTestsByPath test/attachments.e2e-spec.ts test/ticket-stream-scale.e2e-spec.ts test/list-scale.e2e-spec.ts test/team-coverage.e2e-spec.ts
node --experimental-vm-modules node_modules/jest/bin/jest.js --config ./test/jest-e2e.json --runInBand
```

Focused result: **4 suites / 66 tests passed**. Full final result: **16 suites / 357 tests passed**.

Exact browser commands, in `client` (all pass):

```powershell
node test/employee-flow.mjs
node test/operations-flow.mjs
node test/administration-flow.mjs
node test/session-flow.mjs
node test/administration-flow.mjs --bootstrap
```

Employee and operations passed both focused and full browser runs. Administration
passed its final rerun after adding the scoped requester-denial fixture. All 16
session groups and bootstrap acceptance pass. Browser tests use isolated API
fixtures and the permitted local Chromium execution outside the sandbox.

Additional commands, repository root:

```powershell
pnpm.cmd --dir server exec eslint test/attachments.e2e-spec.ts test/ticket-stream-scale.e2e-spec.ts test/list-scale.e2e-spec.ts test/team-coverage.e2e-spec.ts --max-warnings 0
pnpm.cmd --dir server typecheck
pnpm.cmd --dir client lint
git diff --check
```

These pass. No production builds or unit reruns were necessary for test-only
changes; the earlier bootstrap build/unit results remain recorded above.

One full database attempt failed with connection/setup errors after the local
Docker engine stopped: 356 failed / 1 passed, not a usable application regression
result. Restarting the installed Docker Desktop restored the existing PostgreSQL
container; no database was reset, seeded, migrated or reconfigured. The final
full run after restoration is authoritative. Expected injected rollback/cleanup
error logs and Node/pg warnings remain visible; none are suppressed.

Remaining application/test failures: **none**. Real Mailpit/bootstrap manual retest
is still pending and is not replaced by these fixture-based browser checks.
