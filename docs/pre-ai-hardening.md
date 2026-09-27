# Pre-AI hardening and repository operation

Implemented 2026-09-27. AI, cloud provisioning, public-demo deployment, ordinary ticket email,
authorization-library changes and frontend data-hook replacement remain out of scope.

## Local installation and secrets

Use Node **24.12.0** (`.node-version`) and pnpm **11.9.0** (`packageManager`).
These match the verified local tools; previously neither version was pinned.
The repository contains two independently installed applications, **not a pnpm
workspace**. Each owns its package manifest and frozen lockfile. The root manifest
only provides convenience commands and has no dependencies. Do not install Prisma
at the root. Server `pnpm-workspace.yaml` is pnpm's local build-script allowlist,
not a multi-package workspace.

```sh
pnpm --dir server install --frozen-lockfile
pnpm --dir client install --frozen-lockfile
# Or: pnpm install:apps
```

Copy `server/.env.example` to `server/.env`, supply your own local DATABASE_URL,
and generate INITIAL_SETUP_SECRET. Generate independent secrets with:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Do not paste generated secrets into documentation, tickets or source control.
Never use a `VITE_` variable for secrets. `client/.env.example` contains only the
public API base URL. From `server/`:

```sh
pnpm exec prisma generate --config prisma7.config.ts
pnpm exec prisma migrate deploy --config prisma7.config.ts
pnpm start:dev
```

`start:dev` explicitly loads an optional local `.env`; it does not invent a
development runtime mode. Set `NODE_ENV=development` in that local file. Prisma's
config loads the same file without overriding supplied environment variables.
From `client/`, run `pnpm dev`. Ports remain 8000 and 3000.
After `pnpm build`, the actual server entry is `dist/src/main.js`; `start:prod`
now points there. Deployed environments supply variables outside the repository.

Only exact `NODE_ENV=development` or `test` permits local JWT/origin defaults.
Missing, misspelled or other values use deployed security rules: a strong explicit
JWT_SECRET (at least 32 characters, at least 12 distinct characters, no recognized
placeholder/default), exact HTTPS ALLOWED_ORIGINS, Secure refresh cookies and HSTS.
The distinct-character check rejects obvious weak values; it is not an entropy
estimator. Use random secrets. INITIAL_SETUP_SECRET has no default in **any** mode
and is validated on server startup. Existing tests do not need live secrets;
Jest explicitly identifies the test mode and bootstrap tests supply fixture secrets.

POST `/auth/setup` requires `setupSecret` plus the existing identity/password
fields. The installer enters it in a password input. The server compares fixed-size
SHA-256 digests with `timingSafeEqual` before hashing/provisioning the account.
The existing PostgreSQL advisory transaction lock and no-SUPER_ADMIN check are
unchanged. Having the secret never permits a second root. The secret is not stored
in PostgreSQL, returned in API projections or written to application logs.
Validation errors omit input objects/values. Rate limits still apply. Treat setup
request bodies as sensitive in any future host/access-log configuration too.

## Proxy and rate-limit model

`TRUST_PROXY=false` (also unset/0) ignores forwarded client-IP headers. Explicit
positive hop counts or comma-separated IP/CIDR lists configure Express's existing
trust resolver. `true`, wildcard and invalid values are rejected. The limiter uses
`req.ip`, not a raw header. Use a CIDR/address list when possible; a hop count is
safe only when **all** reachable paths have the expected length and the edge
overwrites forwarded headers. Actual settings must match the selected host and
network access controls. No production topology is chosen here.

The limiter remains bounded, in-memory and single-process. NAT sharing, restarts,
distributed clients and volumetric abuse remain limitations. No Redis was added.
All current budgets, body limit, cookie mode and storage settings are listed in
`server/.env.example`. Cross-site cookies require explicit `none` and deployed HTTPS.

## Ticket creation idempotency

POST `/tickets` now requires an opaque `clientRequestId` of 1–128 characters in
its JSON payload (including the multipart `payload` field). The browser creates
one random UUID per mounted creation form and retains it and selected files across
recoverable retries. It does not silently switch keys after an uncertain response.
After changing an already-submitted request, start a new request deliberately.
Page refresh/navigation does not persist file drafts or keys; inspect My tickets
before recreating an interrupted form. No password, token or ticket draft is saved
to persistent browser storage by this change.

A database unique index on `(requesterId, clientRequestId)` and immutable original
creation hash bind the key to its authenticated requester and payload. The hash
includes defaulted priority/scope, sorted region/department/tag IDs, exact text,
and ordered attachment names, MIME types, sizes and content digests. Storage keys
are excluded. Same-content replay returns the existing ticket; changed content
returns 409. Keys do not expire or get cleared on ticket edits/closure. Future
physical ticket deletion must preserve a tombstone before introducing key reuse.

The normal Serializable write remains. A uniqueness/serialization conflict may
perform a fresh authorized read of an already committed creation, never rerun a
mutation. Ticket, initial cycle and attachment metadata commit atomically. Replay
uploads remain unused and are cleaned by the existing upload wrapper. Initial
creation still produces no notifications; replay cannot duplicate events or cycles.
Internal idempotency metadata is excluded from ticket detail/list projections.

## Password management

One server validator enforces an eight-character minimum for new passwords and
a **72-byte UTF-8 maximum** for setup, activation and password management.
Login/current-password verification also enforces the byte maximum while accepting
existing nonempty credentials for authentication. No silent truncation and no
internal hashing explanation in validation failures. Hashing remains bcrypt cost 10.

ACTIVE users use Profile → Change password (`POST /auth/password`, currentPassword
and newPassword). Current credentials must match, and the new password must differ.
The transaction locks/revalidates the actor, updates the hash, increments
sessionVersion, and revokes all refresh tokens. A fresh login is required on every
device. The browser serializes this operation with refresh/login/logout through
its existing Web Lock and publishes sign-out to sibling tabs after success. It
does not automatically retry a password change. Other devices fail their next
authenticated request because authorization reads the current session version.

Accounts now use activation and password-reset email links; administrators do not set another user's password. The account-security phase supersedes the direct reset introduced here. See [account security](account-security.md) for endpoints, authority, state/migration, legacy forced-change compatibility, SMTP and local Mailpit configuration. Self-change above remains supported and additionally revokes outstanding recovery links and sends a security notice.

## CSV uploads

Based on [OWASP CSV Injection guidance](https://community.owasp.org/attacks/CSV_Injection),
validation inspects decoded cells and rejects formula prefixes, leading whitespace
and control variants, quoted cells and UTF-8 BOM/full-width variants. It checks
comma, semicolon and tab interpretations to cover common spreadsheet imports.
Malformed unterminated quoted cells are rejected. This is intentionally conservative:
negative/positive signed numbers and ambiguous dialects may be rejected. Uploaded
bytes are never rewritten. TXT/LOG do not receive CSV-specific validation.
Existing count/size/type/signature/private-storage/authorization rules remain.
This does not replace malware scanning or guarantee behavior in every spreadsheet
application or after a user changes import settings/content.

## Repository findings and migration

- Root Prisma 8.1.0-dev.6 and adapter/pg entries were remnants of initial database
  setup, with no root application or scripts using them. Root lock/workspace build
  policy were obsolete and removed. Ignored local caches are not runtime contracts.
- Server Prisma client/CLI/adapter remain **7.10.0**, now exact pins. Tests directly
  import pg types, so `@types/pg` 8.23.1 is explicitly owned by the server instead
  of being accidentally resolved from the root. No new runtime dependency.
- Client lockfile omitted 11 declared packages and did not describe its installed
  dependency tree. Client direct versions are pinned to the already installed
  verified versions; the lockfile was regenerated from the existing pnpm cache,
  and independent links rebuilt. Changes from the old lockfile reconcile existing
  installation state, not a requested broad dependency upgrade.
- Migration `20260927120000_ticket_creation_idempotency` adds two nullable Ticket
  columns and their requester/key unique index, plus the false-defaulted persisted
  User password-change flag. Existing rows retain their behavior. No AI columns
  were removed and no historical data is rewritten.

## CI and verification

`.github/workflows/ci.yml` runs on PRs, main/master/develop pushes and manual
dispatch. It installs each app from a frozen lockfile, runs lint with zero warnings,
client typecheck/Vite build, server typecheck/Nest build/unit tests and Prisma
validate/generate. PostgreSQL 17 service credentials belong only to an ephemeral
`service_desk_ci_test` database. CI applies migrations, checks status/drift and runs
the complete e2e suite; the suite refuses database names without `_test` and forces
local storage. No test contacts GCS.

The custom Chromium harness remains intact. All four suites run locally; the new
manual Windows workflow uses the runner's Chrome/Edge. The harness was verified
locally on Windows, not on GitHub-hosted Linux; it uses installed browser paths,
CDP, local ports 3000/3001 and native Node WebSocket. It is not added to the PR gate
until hosted-runner stability has been demonstrated. No Playwright migration.

Dependency CI gates **high/critical production** advisories; the full report is
informational. No blanket ignore list, auto-fix or major upgrades. Current known
findings and remediation are recorded in
[dependency-audit.md](dependency-audit.md). The follow-up runtime remediation
passes both runtime gates with zero known vulnerabilities; development-tooling
findings remain visible in the informational audit.

For local e2e, explicitly set TEST_DATABASE_URL to a migrated disposable `_test`
database. Run Prisma migration commands with DATABASE_URL pointing to that same
test database before `pnpm test:e2e --runInBand`. Never derive a CI URL from a
development/production secret. Full verification results are in [status.md](../status.md).

Previously intentional limitations remain: single-process limits, format-only file
screening, local storage development default, no generic audit/device UI,
no automatic business mutation retries, existing Serializable conflict handling,
and the current manual authorization/data-hook architecture. Cloud configuration,
AI, deployment, SLA/search/bulk features and speculative schema cleanup are deferred.
