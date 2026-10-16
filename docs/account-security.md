# Account activation and password recovery

## Follow-up UX: ISS-034 through ISS-038 (2026-10-16)

Active first-run/pending Setup omits the circular Return to sign in link.
Completed/unavailable Setup and status-error recovery retain sign-in navigation;
bootstrap availability and Login redirects are unchanged.

Activation and reset retain the accessible requirement checklist, check icons,
Unicode code-point minimum of eight characters and maximum of 72 UTF-8 bytes.
Save password is disabled until both fields satisfy those rules and match, and
disables again when edited out of validity. Negative inline feedback remains;
redundant positive prose is removed. Browser/password-manager autocomplete,
server validation, fragment-token removal and explicit sign-in remain unchanged.

Login recovery links use smaller theme-aware secondary text, hover underline,
keyboard focus and 44px targets. Activation recovery now explains that it is for
provisioned accounts that have not completed activation and have lost a usable
email/link. Already-activated users have a separate Forgot password link.
Completion says: "If this email belongs to an account that still needs activation,
new instructions will be sent if eligible." The toast says "Request received."
No public result claims definite delivery. Backend eligibility, cooldown, minimum
response timing, anti-enumeration and session semantics are unchanged.

Phone editing uses libphonenumber-js/max's possible-length check to reject an
overlong edit as a whole, including paste, without truncating into another number.
Deletion remains possible for retained values that become overlong on country
change. Separators do not consume a character budget; valid international input
still recognizes its country and formats nationally. Invalid international input
is retained for validation rather than reformatted. Full validation remains;
blank is optional. Phone remains unverified informational data, not authentication.

Focused verification passed: client lint, TypeScript/Vite build, 13 phone unit
tests, and administration browser modes `--bootstrap`, `--account-security` and
`--phone`, plus `git diff --check`. Both password routes cover Unicode boundaries,
disabled/enabled transitions, mismatch removal, valid completion, unusable links
and no auto-login. Recovery fixtures compare activated, pending and unknown emails.
Phone browser checks cover LB/US/CA/GB typing limits, deletion, selection edits,
paste, formatting, recognition, country changes and optional blank. Browser modes
reported no runtime/console errors and use isolated API fixtures, not live accounts.
Sandbox Chromium initialization failed; permitted execution outside the sandbox
passed. A new Unicode test fixture was corrected to use explicit escapes after
the shell replaced literal characters. No backend files/tests, live mail delivery,
manual screen-reader verification or full regression run were involved.

Only ISS-034 through ISS-038 are complete in this batch. ISS-039 through ISS-052,
manager dashboards/statistics, role-testing accounts, MFA and AI remain deferred.
No schema or auth contract changes, account seeding, commit or push.

## Final issue-log checkpoint (2026-10-14)

ISS-015 through ISS-033, including Batches 4A, 4B, 5A, 5B and 6, are implemented
and were subsequently committed and pushed to `development` through `347b51f`.
See the [final checkpoint](../status.md#final-issue-log-checkpoint-2026-10-14)
for the complete regression results and remaining manual boundaries.
Email-link activation/recovery, public anti-enumeration and session invalidation
remain unchanged. Unified Profile/Settings, explicit themes, initial-loading
skeletons, mutation toasts and account-directory finishing polish are complete.

Dated batch verification records below describe the state when each batch was
verified. Their uncommitted/unpushed wording and deferrals subsequently completed
by Batches 4B/5A/5B/6 are historical, not the present repository state. The new
checkpoint documentation and test fixes remain uncommitted; no new push was made.
MFA/SMS/WhatsApp, ticket email, durable mail queue/outbox, AI and outstanding
deployment/manual verification remain deferred.

Checkpoint regression found two browser-test timing assumptions from before
Batch 5A: Setup and account-security checked the computed theme immediately after
emulating a system preference change. Both now use the existing bounded `until`
helper to wait for the root theme and computed color scheme, retaining the original
assertions. This matches the approved event-driven system-theme behavior and the
existing shell/profile checks; no application or security behavior changed.

## Setup UX and branded security email — Batch 4B (2026-10-13)

ISS-018, ISS-019, ISS-020 and the remaining Setup portion of ISS-025 are
implemented and focused-test verified. This completes the Setup/email scope
previously deferred by Batch 4A; the historical verification entries below remain
unchanged. Activation/reset/forgot-password/resend implementation is preserved.

### Setup behavior and reload boundary

The larger two-column Setup layout remains. A keyboard-operable native checkbox
inside a grouped recovery card explicitly confirms replacing pending identity
details and invalidating previous activation links. It is not described as a
resend. Setup reuses `ReturnToSignIn`; completed/unavailable states also reuse
`PublicAuthCard`. A small shared focus rule supports navigation outside the card.

The first submission is enabled without restart. After a successful API response,
including `delivery: FAILED` (the identity was committed), component memory holds
only the normalized displayName/jobTitle/email comparison baseline. Further
submissions require explicit restart confirmation and a meaningful change to one
of those fields. Names/titles are trimmed and email is trimmed/lowercased like the
backend; whitespace, email casing and setup-secret changes alone do not qualify.
Confirmation resets after each accepted submission. The form disables while busy;
a synchronous submission lock also prevents rapid duplicate requests. Rejected
requests leave the previous baseline intact and can be corrected/retried.

Successful delivery produces a success toast and persistent instructions to open
the email, verify the address, choose a password and then sign in. Delivery failure
produces an error toast and a truthful pending-identity-saved notice. Its link to
the existing `/resend-activation` flow supports unchanged-identity delivery recovery
after SMTP repair; that public flow retains generic responses and its cooldown.
There is no automatic navigation, login, resend or mutation retry.

No draft, secret or comparison baseline is persisted. After reload, the API only
reports setup availability and exposes no pending identity. The page explicitly
explains that it cannot compare previous details: ordinary initial submission is
available and the server rejects it if a pending root exists; explicit authorized
restart remains available. This memory-only UX guard is not a security boundary.

### Email rendering and unchanged contracts

All three existing provider methods now send both `text` and `html` via Nodemailer.
Activation/reset messages have a Kino Service Desk header, restrained teal CTA,
visible fallback URL, single-use/24-hour or 30-minute expiry guidance, and a reason
footer. The changed-password notice has no URL/token and directs unexpected
changes to company IT/security. Templates use inline table styling with no remote
images/fonts, external CSS, JavaScript or tracking. Dynamic content is HTML-escaped;
action URLs reject non-HTTP(S) schemes and credentials without echoing the URL.
Only the existing application-generated URL contains an activation/reset token.

Bootstrap availability, mandatory server-validated secret, advisory/User locking,
restart invalidation, user-owned password selection, activation without auto-login,
public anti-enumeration, session/rate-limit/authorization rules, SMTP TLS requirements,
disabled URL/file loading, bounded timeouts and disabled transport logging are
unchanged. No backend setup/auth logic, DTO, schema, migration or ticket behavior
changed. No setup secret or password is accepted by the template functions.

### Focused verification and files

| Command (from the indicated application) | Result |
| --- | --- |
| Server: `pnpm.cmd test --runInBand --runTestsByPath src/auth/mail.provider.spec.ts src/auth/account-security.spec.ts src/auth/auth.service.spec.ts` | 3 suites, 31 tests pass |
| Server: `pnpm.cmd lint` | Pass |
| Server: `pnpm.cmd typecheck` | Pass |
| Server: `pnpm.cmd build` | Pass |
| Client: `pnpm.cmd lint` | Pass |
| Client: `pnpm.cmd build` | TypeScript/Vite pass |
| Client: `node test/administration-flow.mjs --bootstrap` | Pass |
| Client: `node test/administration-flow.mjs --account-security` | Pass |
| Repository: `git diff --check` | Pass |

Mail tests mock Nodemailer and verify both formats, URL/CTA/expiry, notice without
links, escaping/unsafe URL rejection, no secrets/ticket data/external dependencies
and the full safe transport options. Bootstrap browser fixtures cover initial send,
success/error toasts, normalized identity guards, confirmation/keyboard/focus,
duplicate/in-flight prevention, recoverable rejection, committed FAILED baseline,
prior-link invalidation, reload behavior, no stored secrets/drafts, sign-in navigation,
320px/dark layout, activation and no auto-login. Both browser modes assert no
runtime/console errors. Chromium uses the previously required approved execution
outside the sandbox. No real SMTP/Mailpit, mailbox-client rendering or manual
screen-reader verification was performed. No full PostgreSQL/e2e regression ran:
backend business behavior is unchanged.

Files: `client/src/pages/SetupPage.tsx`, `client/src/setup.css`,
`client/src/public-auth.css`, `client/test/administration-flow.mjs`,
`client/test/setup-polish.mjs`, `server/src/auth/mail.provider.ts`,
`server/src/auth/security-email.templates.ts`, `server/src/auth/mail.provider.spec.ts`,
this guide, `docs/decision.md`, and `status.md`.

Global theme/scrollbar/skeleton and mutation-toast work, settings/profile and
account-directory polish, ticket email, MFA/SMS/WhatsApp, durable mail delivery,
cloud/deployment and AI remain outside this batch. No commit or push performed.

## Public account-security UX slice (2026-10-13)

ISS-016, ISS-017, ISS-021, ISS-022, ISS-023, ISS-024, ISS-025 and ISS-026
are implemented and browser-verified for the requested public account-security scope.
The four routes share `PublicAuthCard`, scoped `public-auth.css` and a reusable
Return to sign in control. Login and Setup themselves are unchanged.

Activation/reset show requirements before submission and live, associated field
feedback for the eight-character minimum, 72 UTF-8 byte maximum and confirmation.
Native `autocomplete="new-password"` remains enabled; no custom password generator
or password persistence was added. Invalid submissions focus the offending field
and use a warning toast. Request failures use error toasts; completed operations
use success toasts. Activation and reset have distinct completion headings,
Sign in buttons and no recovery controls. Completion focuses the heading.

Recovery links appear only for a missing token or the existing HTTP 400
`Invalid, expired or used link` response. Token presence alone is not a validity
check. Other validation failures, network failures, 409 and 429 keep the form
retryable. Public email request completion uses fixed generic copy for both
eligible and unknown emails; errors never render account-specific backend details.

Security contracts are unchanged: email links, short-lived single-use server tokens,
fragment capture/removal, memory-only secrets, existing session coordinator and
explicit sign-in after completion. No backend, auth service, schema, migration,
authorization, rate-limit or session-invalidation changes.

Verification (commands run from `client`, except the final Git check):

| Command | Result |
| --- | --- |
| `pnpm.cmd lint` | Pass |
| `pnpm.cmd build` | Pass, TypeScript and Vite |
| `node test/administration-flow.mjs --account-security` | Pass |
| `node test/administration-flow.mjs --bootstrap` | Pass |
| `node test/administration-flow.mjs` | Pass |
| `git diff --check` | Pass |

The new focused mode covers inline guidance, no-request mismatches/short/over-byte
passwords, exactly 72 UTF-8 bytes, duplicate-submit prevention, completion/focus,
no auto-login, storage/fragment handling, generic public email copy and masked
backend error details, missing/invalid/replayed links, network/409/429 retry,
return navigation, 320px touch targets/overflow and dark theme. Existing
administration coverage also verifies old-password rejection and session clearing.
All browser modes report no runtime/console errors. API/mail responses are isolated
fixtures; these checks do not claim real SMTP or manual screen-reader validation.
PowerShell blocked the `pnpm.ps1` wrapper, so checks used `pnpm.cmd`. The initial
sandboxed browser attempt timed out before any test; approved external Chromium
runs passed. No backend suites were run because no backend behavior changed.

Deferred: `/setup` restart/resend UX and branded HTML email templates remain a
separate batch. Global theme switching and skeleton loaders are also out of scope.
The existing untracked issue workbook and root lockfile were left untouched;
this section and `status.md` record the issue-slice status without rewriting them.

## Identity and navigation (2026-10-11)

Username has been removed from the Enterprise Service Desk identity model.
Email is the unique immutable login, activation and recovery identity.
displayName is the required human-readable identity shown throughout the product.
User.id remains the stable relational identity. Duplicate display names are allowed.
The UI may render a generated avatar using the first initial of displayName.
User-uploaded profile pictures are not implemented in the current phase.
The topbar identity control opens Profile.
The sidebar bottom navigation uses Settings rather than a Profile/avatar control.

The migration preserves valid names and fills only missing/blank legacy names once
from the former username (or neutral Account if that too is blank), then enforces
NOT NULL/nonblank displayName and removes the old column/index. Historical IDs,
email, sessions, roles and lifecycle remain unchanged. No runtime fallback remains.
See [identity verification](identity-model-verification.md) for the migration,
contract changes, checks and retest list. ISS-012/ISS-013 still await manual Network
evidence; their pagination/stale-response implementation was not changed.

Implemented 2026-09-27. Administrators manage accounts; users own their passwords. No administrator chooses, receives, retrieves or emails another user's password.

Email is out of scope for ordinary ticket notifications. Email is used only for account activation, password recovery, and security notices. Ticket, assignment, message, subtask and resolution notifications remain in-app only.

## Account metadata editing scope

Role changes are outside the metadata-editing phase. The metadata-editing endpoint must not accept `role` and must preserve the user's current role unchanged. Its dialog may display the current role as read-only because this particular dialog does not edit it. This is an endpoint-specific restriction, not permanent role immutability.

A future dedicated role-transition phase will allow an existing account to change role while preserving the same account identity and email. Changing job function must not require a new account or email. That phase must explicitly define reconciliation for AGENT Team memberships, Agent specialties, Team Lead responsibility, MANAGER TeamManager responsibility, current ticket ownership, current subtask assignments, sessions/authorization after role changes, and historical attribution. Those reconciliation rules are neither designed nor implemented in the metadata-editing phase.

## Verified bootstrap (2026-10-11)

ISS-002/003/004 use the same AccountActionToken, activation page, password policy,
MailProvider and Mailpit SMTP settings as other account activation. No migration,
new provider, verification code or dependencies. Existing activated roots remain
complete; their email verification is not backfilled.

- `GET /auth/setup/status`: `{ available: boolean }` is true until the sole root
  has activatedAt. It discloses no pending identity.
- `POST /auth/setup`: `{ displayName, jobTitle, email, setupSecret,
  restart?: boolean }`. Password and role fields are rejected. Success is
  `{ message: "Super Admin pending email activation", delivery: "SENT" | "FAILED" }`,
  without identity, credentials, cookies or raw tokens.
- Default submission reserves exactly one pending root. An existing pending root
  rejects another creation (409). Explicit `restart: true` with the correct secret
  updates the same pending identity/email and atomically replaces unused activation
  links. Completed bootstrap rejects both forms (409). Invalid secret returns 403;
  malformed input returns 400. Conflicts use the same generic message and never
  identify an unrelated conflicting account.
- Activation lasts 24 hours and is single-use. `/auth/activate` verifies email and
  saves the user's chosen password without logging in. Existing ACTIVE/activated
  session and operational eligibility checks exclude the pending root.
- Setup remains recoverable after typo, expiry or SMTP failure. Restart deliberately
  bypasses the ordinary 60-second resend cooldown because it requires installation
  authority and retains the setup/IP limits. SMTP runs after commit; mail can arrive
  out of order, but only the latest committed unused token is valid.
- Bootstrap's advisory lock prevents multiple identities; locking the pending User
  row prevents email correction racing successful activation. Completion remains
  permanent under supported account lifecycle operations. The setup secret cannot
  change an activated root or recover its password.

The fresh/pending `/login` entry redirects to `/setup` without displaying normal
recovery links. Setup explains automatic role assignment, email verification,
password selection and explicit restart. After activation, sign-in is normal;
direct `/setup` shows the safe completed state. No public registration or
administrator-granted ticket authority is introduced.

## State and migration

`User.status` remains administrative `ACTIVE` / `INACTIVE`. `activatedAt` is independent: a newly provisioned ACTIVE account has null activation and null credentials. The existing `password` column stores only a bcrypt hash; it is now nullable (the column was retained rather than renamed to avoid needless migration churn). `emailVerifiedAt`, `phoneNumber` and `phoneVerifiedAt` are nullable.

Migration `20260927180000_account_activation` backfills `activatedAt = createdAt` only for existing password-bearing users. It never backfills email verification. Existing development users keep access. Initial `/auth/setup` is secret-protected, rate-limited and serialized by the existing PostgreSQL advisory lock; it reserves a pending SUPER_ADMIN for email activation as described above. No ordinary endpoint creates SUPER_ADMIN.

Legacy `passwordChangeRequired` is retained and enforced so previously forced accounts are not stranded. New flows never set it. Successful self-change or recovery clears it. No users or historical relationships are deleted.

## Flows and authority

- `POST /auth/accounts`: displayName, jobTitle, email, permitted role, optional phone; no password field. Existing organization management remains available separately. SUPER_ADMIN creates ADMIN/MANAGER/AGENT/EMPLOYEE; ADMIN creates MANAGER/AGENT/EMPLOYEE. The response contains safe identity and delivery status, never a token/hash/password.
- `POST /auth/accounts/:id/resend-activation`: authorized resend for pending accounts. `POST /auth/accounts/:id/reset-password`: send a link to an activated account; rejects password fields. Hierarchy is unchanged and neither action can target SUPER_ADMIN. Sending a reset link does not itself invalidate sessions.
- `POST /auth/resend-activation` and `POST /auth/forgot-password`: normalized email, generic responses for missing, inactive, pending/ineligible, cooldown and delivery failure cases. SUPER_ADMIN can use their configured email for self-service recovery.
- `POST /auth/activate`: token plus newPassword. Atomically sets the bcrypt hash, activation and email verification, consumes the token and revokes any prior sessions/action tokens.
- `POST /auth/reset-password`: token plus newPassword. Atomically changes credentials, consumes/revokes action tokens, increments sessionVersion and revokes all refresh tokens. Old access and refresh sessions on every device fail subsequent use. Sends a password-changed notice after commit.
- `POST /auth/password`: preserves current-password verification and existing coordinated multi-tab sign-out, revokes outstanding recovery links and sends a password-changed notice after commit.

Activation and reset never issue a session. The frontend serializes completion through the existing session coordinator and clears local/sibling session state before showing success. Users must sign in normally. Passwords retain the shared eight-character minimum and 72-byte UTF-8 maximum. Normal login, refresh rotation, HttpOnly cookies, memory-only access tokens, Origin/Referer checks, CORS, security headers and offboarding remain authoritative.

The directory shows status and activation independently, plus optional unverified phone. Pending accounts cannot authenticate, refresh sessions, receive manager/agent/subtask ownership, become Team Lead/TeamManager or appear in operational people selectors. Historical attribution is unchanged.

## Tokens, abuse controls and failure handling

`AccountActionToken` stores user, purpose (`ACCOUNT_ACTIVATION` or `PASSWORD_RESET`), unique SHA-256 digest, creation/expiry, usedAt and revokedAt. Tokens use 32 cryptographically random bytes encoded base64url. Raw values exist only in transient email construction and the recipient's link; no normal API response or application log includes them. Defaults are 24 hours for activation, 30 minutes for reset. Token lookup has a unique hash index; issuance history has a user/purpose/createdAt index.

Issuance locks the user and applies a persistent 60-second cooldown per user/purpose, then revokes previous unused links. Consumption and credential/session changes share a serializable transaction. Concurrent conflicting requests may return 409 and should be retried by the user. Public request endpoints share a requester-IP recovery bucket (10 requests / 10 minutes by default, `RATE_LIMIT_RECOVERY_MAX`), plus existing API throttling. Normalized email resolves to the persisted account cooldown. Generic public responses have a 750ms minimum duration; SMTP/network outages can still affect latency. This is not a claim of constant-time network behavior.

Provisioning remains committed if token issuance or SMTP delivery fails. Administrators see delivery FAILED and can resend after cooldown. Public responses hide failures. Password-change/reset success survives notice delivery failure. Logs use bounded event names only, never SMTP exceptions/credentials or full links. Delivery is synchronous with bounded SMTP timeouts; there is no durable outbox or automatic retry worker in this phase.

Frontend `/activate` and `/reset-password` read `#token=...` into component memory and clear the fragment with history.replaceState. Tokens are not put in localStorage/sessionStorage. Reloading after capture requires reopening the email. Forms handle missing/invalid/expired/used links, matching passwords, loading, rate limits and network failure, and direct successful users to login.

## Mail abstraction and local development

Auth depends on `MailProvider` with activation, reset and changed-notice methods. `SmtpMailProvider` uses Nodemailer 10.0.10 (`@types/nodemailer` 8.0.2 is development-only); no ticket service depends on mail. Templates contain security instructions and a single-use link, never a password or sensitive ticket/account metadata.

Copy safe settings from `server/.env.example`. Configure `MAIL_PROVIDER=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, optional paired `SMTP_USER`/`SMTP_PASSWORD`, `MAIL_FROM`, and `APP_PUBLIC_URL`. Set the public URL to the actual frontend origin. Only explicit development/test modes have local defaults. Deployed modes require explicit SMTP/public URL configuration and HTTPS; SMTP requires TLS. No deployed fake/console/Mailpit fallback exists. Transport debugging and file/URL loading are disabled.

Start local capture with `docker compose --profile development up -d mailpit`. Mailpit v1.30.7 is in a development-only Compose profile, bound to loopback: SMTP `127.0.0.1:1025`, web inbox `http://localhost:8025`. No credentials or external email provider are needed. Open the inbox to follow activation/reset links. Mailpit is not production infrastructure and was not needed for automated tests. The pinned version includes the upstream WebSocket origin-check fix ([advisory](https://github.com/advisories/GHSA-8r62-w5wh-fc5m)). See [official Mailpit Docker instructions](https://mailpit.axllent.org/docs/install/docker/) and [Nodemailer SMTP options](https://nodemailer.com/smtp).

Phone input requires an international + prefix and 8?15 digits, starting with a nonzero country code; spaces, parentheses and hyphens are normalized away. No country inference or external lookup occurs. `phoneVerifiedAt` remains null. Phone is not a login/recovery factor and is excluded from operational ticket/message/notification projections. SMS, WhatsApp and MFA remain deferred.

## Verification and changed areas

Backend coverage uses an injected in-memory `FakeMailProvider`; no Docker, external SMTP, SMS, WhatsApp, GCS or AI calls are required. PostgreSQL tests cover provisioning/activation, purpose binding, expiry/revocation/replay, concurrent consumption, cooldown, generic responses, failure semantics, reset/session invalidation, self-change, hierarchy and pending assignment rejection. Chromium uses isolated API/mail fixtures, alongside the existing role and multi-tab suites. It does not claim a real SMTP end-to-end browser run.

Changed areas: Prisma schema/new migration; auth controller/service/DTOs and new account-security/mail/phone modules; users service; shared transaction eligibility; organization/ticket assignment and people lookups; security middleware; frontend account/password forms, directory, public security pages/routes, login links and API services; test fixtures and security/role/browser tests; Compose, environment example, server manifest/lockfile and these documentation updates. Existing unrelated working-tree changes were retained.

No AI, cloud configuration, deployment, SMS/WhatsApp/MFA, commit or push was performed. Phone verification, durable mail retry, ticket email and device-management UI remain out of scope.


## Final verification (2026-09-27)

| Check | Result |
| --- | --- |
| Backend lint / typecheck / build | Pass |
| Unit tests | 17 suites, 208 tests pass |
| PostgreSQL/e2e | 11 suites, 270 tests pass |
| Dependency compatibility tests | 2 pass; no external GCS calls |
| Frontend lint / TypeScript / Vite build | Pass |
| Chromium browser suites | Employee, operations, administration/account-security, multi-tab/session all pass |
| Prisma validate / generate | Pass |
| Development and test migration status | 19 migrations applied on each, up to date |
| Development and test schema drift | Zero differences on each |
| Server and client runtime audits | Zero known vulnerabilities (`pnpm audit --prod`) |
| Server and client frozen installs | Pass |
| Compose configuration / git diff --check | Pass |

The backend suite includes intentional simulated failures and safe bounded error logs. Browser tests require local headless Chrome/Edge permissions; the initial sandbox CDP startup timed out, and the subsequent local runs passed. Mailpit was configured but not started or contacted by tests. No real email provider was configured or contacted.


## File map for this phase

- Data: `server/prisma/schema.prisma`, `server/prisma/migrations/20260927180000_account_activation/migration.sql`.
- Account implementation: `server/src/auth/account-security.service.ts`, `mail.provider.ts`, `phone.ts`, `auth.service.ts`, `auth.controller.ts`, `auth.module.ts`, `auth.guard.ts`, `dto/create-account.dto.ts`, `dto/password.dto.ts`; `server/src/users/users.service.ts`.
- Eligibility/security: `server/src/prisma/transactions.ts`, `server/src/organization/organization.service.ts`, `server/src/tickets/tickets.service.ts`, `ticket-workspace.controller.ts`, `server/src/security/http-security.ts`, `security.config.ts`.
- Frontend: `client/src/pages/AccountSecurityPage.tsx`, `LoginPage.tsx`, `UsersPage.tsx`; `client/src/components/AccountForm.tsx`, `PasswordForm.tsx`; `client/src/routes/AppRoutes.tsx`; `client/src/services/auth.service.ts`, `users.service.ts`, `api.ts`; `client/src/types/administration.ts`.
- New tests: `server/src/auth/account-security.spec.ts`, `server/test/account-security.e2e-spec.ts`, `server/test/fake-mail.provider.ts`. Updated auth/guard/security/ticket unit tests, PostgreSQL fixtures in existing e2e suites, `server/test/security-test-app.ts`, and `client/test/administration-flow.mjs`.
- Configuration/dependencies: `docker-compose.yml`, `server/.env.example`, `server/package.json`, `server/pnpm-lock.yaml`.
- Documentation: `README.md`, `docs/decision.md`, `status.md`, `docs/pre-ai-hardening.md`, this guide. `docs/demo-deployment-plan.md` was left unchanged because it contains no obsolete all-email exclusion.

The repository already had unrelated modified/untracked files before this phase; this map identifies the account-security work rather than claiming ownership of the entire working-tree diff.
