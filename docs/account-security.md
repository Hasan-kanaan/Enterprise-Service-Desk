# Account activation and password recovery

Implemented 2026-09-27. Administrators manage accounts; users own their passwords. No administrator chooses, receives, retrieves or emails another user's password.

Email is out of scope for ordinary ticket notifications. Email is used only for account activation, password recovery, and security notices. Ticket, assignment, message, subtask and resolution notifications remain in-app only.

## Account metadata editing scope

Role changes are outside the metadata-editing phase. The metadata-editing endpoint must not accept `role` and must preserve the user's current role unchanged. Its dialog may display the current role as read-only because this particular dialog does not edit it. This is an endpoint-specific restriction, not permanent role immutability.

A future dedicated role-transition phase will allow an existing account to change role while preserving the same account identity and email. Changing job function must not require a new account or email. That phase must explicitly define reconciliation for AGENT Team memberships, Agent specialties, Team Lead responsibility, MANAGER TeamManager responsibility, current ticket ownership, current subtask assignments, sessions/authorization after role changes, and historical attribution. Those reconciliation rules are neither designed nor implemented in the metadata-editing phase.

## State and migration

`User.status` remains administrative `ACTIVE` / `INACTIVE`. `activatedAt` is independent: a newly provisioned ACTIVE account has null activation and null credentials. The existing `password` column stores only a bcrypt hash; it is now nullable (the column was retained rather than renamed to avoid needless migration churn). `emailVerifiedAt`, `phoneNumber` and `phoneVerifiedAt` are nullable.

Migration `20260927180000_account_activation` backfills `activatedAt = createdAt` only for existing password-bearing users. It never backfills email verification. Existing development users keep access. Initial `/auth/setup` remains secret-protected, rate-limited and serialized by the existing PostgreSQL advisory lock; its first SUPER_ADMIN chooses a password and is immediately activated, without claiming email verification or requiring email. No ordinary endpoint creates SUPER_ADMIN.

Legacy `passwordChangeRequired` is retained and enforced so previously forced accounts are not stranded. New flows never set it. Successful self-change or recovery clears it. No users or historical relationships are deleted.

## Flows and authority

- `POST /auth/accounts`: username, email, permitted role, optional phone; no password field. Existing organization management remains available separately. SUPER_ADMIN creates ADMIN/MANAGER/AGENT/EMPLOYEE; ADMIN creates MANAGER/AGENT/EMPLOYEE. The response contains safe identity and delivery status, never a token/hash/password.
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
