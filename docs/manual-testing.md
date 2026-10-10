# Local manual browser testing

This opt-in utility is separate from startup, migrations and automated tests. It
uses **only `MANUAL_TEST_DATABASE_URL`**, never `DATABASE_URL`, `TEST_DATABASE_URL`
or `.env`. Both seed and reset require a loopback PostgreSQL URL with credentials,
no query parameters, and the exact database name `enterprise_service_desk_manual`.
This is intentionally stricter than the `_manual` suffix rule: other manual
databases are refused too. The connected database name is checked again inside
the transaction before writes. No new dependencies, schemas or migrations exist.

## 1. Start local services and create the database

Use Node 24.12.0 and pnpm 11.9.0 with the existing app dependencies installed
(`pnpm.cmd install:apps` if needed). These PowerShell commands run from the repo
root. `pnpm.cmd` avoids Windows PowerShell execution-policy restrictions.

```powershell
docker compose --profile development up -d postgres mailpit
# Run once. If it already exists, this fails without replacing it.
docker compose exec postgres createdb -U postgres -T template0 enterprise_service_desk_manual

$env:MANUAL_TEST_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/enterprise_service_desk_manual'
# This override is limited to this shell; do not edit your normal server/.env URL.
$env:DATABASE_URL = $env:MANUAL_TEST_DATABASE_URL
pnpm.cmd --dir server exec prisma migrate deploy --config prisma7.config.ts
pnpm.cmd --dir server exec prisma generate --config prisma7.config.ts
```

The credentials above match the existing Compose defaults. Substitute your local
credentials if your volume was initialized differently. Do not use `migrate reset`,
`db push`, or any automated e2e preparation command. Existing migrations are applied
only to the explicitly selected manual database. Leave the normal and stabilization
databases alone. Do not remove Docker volumes.

## 2. Start the backend and frontend, then test bootstrap first

Stop any backend already listening on port 8000. In the same PowerShell:

```powershell
$env:NODE_ENV = 'development'
$env:INITIAL_SETUP_SECRET = node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
# Display locally so you can enter it in /setup. Retain it for this testing session.
$env:INITIAL_SETUP_SECRET
$env:MAIL_PROVIDER = 'smtp'
$env:SMTP_HOST = '127.0.0.1'
$env:SMTP_PORT = '1025'
$env:SMTP_SECURE = 'false'
$env:SMTP_USER = ''
$env:SMTP_PASSWORD = ''
$env:MAIL_FROM = 'Enterprise Service Desk <accounts@localhost>'
$env:APP_PUBLIC_URL = 'http://localhost:3000'
$env:ALLOWED_ORIGINS = 'http://localhost:3000'
$env:STORAGE_PROVIDER = 'local'
# Isolate manual uploads from normal local attachments too.
$env:ATTACHMENT_STORAGE_DIR = '.attachments/manual'
pnpm.cmd --dir server start:dev
```

In another terminal at the repository root:

```powershell
pnpm.cmd --dir client dev
```

Backend: <http://localhost:8000>. Frontend: <http://localhost:3000>.
Existing Mailpit inbox: <http://localhost:8025> (SMTP port 1025).
No alternate mail product or mail container changes are needed.

Open <http://localhost:3000/setup> in a fresh browser session. Create your first
SUPER_ADMIN with your own username, synthetic email, display name, job title,
password and the setup secret. Reserve the `manual-*` usernames/emails below for
fixtures. Confirm `/setup` is locked afterward, including in a signed-out browser.
**Do not seed before this check.** Seed refuses a database without exactly one
active, activated, password-bearing SUPER_ADMIN. It never creates SUPER_ADMIN
and has no bypass mode. The utility cannot verify your visual browser check.

## 3. Seed after bootstrap

Stop the backend briefly with Ctrl+C; keep its terminal/environment for restart.
In a second PowerShell at the root:

```powershell
$env:MANUAL_TEST_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/enterprise_service_desk_manual'
pnpm.cmd manual-test:seed
```

Restart with `pnpm.cmd --dir server start:dev` in the original backend terminal.
Seed is transactional. The first run requires only the bootstrap account and empty
organization/configuration/ticket data. A complete existing set of fixture emails
makes subsequent runs a no-op, preserving password changes, roles, deactivations,
archives, tickets and relationship changes you made in the UI. Partial fixture sets
or other pre-seed data cause refusal rather than an overwrite. Reset is the way to
restore the original scenario; seed is not a fixture repair command.

### Credentials

Login uses **email**, not username. Every password-bearing fixture starts with
**`ManualDesk!2026`**. These are public, local-only test credentials. Passwords
are stored as bcrypt hashes. Email verification remains unset; no fake activation
tokens, sessions, notifications or emails are created by the seed. Ordinary
application provisioning still sends activation links for user-owned passwords.

| Username | Login email | Initial role/state | Home Region / Department |
| --- | --- | --- | --- |
| manual-admin | manual-admin@example.test | ADMIN, active/activated | North / IT |
| manual-manager-a | manual-manager-a@example.test | MANAGER, active/activated | North / IT |
| manual-manager-b | manual-manager-b@example.test | MANAGER, active/activated | South / IT |
| manual-agent-a | manual-agent-a@example.test | AGENT, active/activated; North Team Lead | North / IT |
| manual-agent-b | manual-agent-b@example.test | AGENT, active/activated | North / IT |
| manual-agent-c | manual-agent-c@example.test | AGENT, active/activated | South / IT |
| manual-employee-a | manual-employee-a@example.test | EMPLOYEE, active/activated | North / Finance |
| manual-employee-b | manual-employee-b@example.test | EMPLOYEE, active/activated | South / People |
| manual-pending | manual-pending@example.test | AGENT, active but unactivated; **no password** | South / IT |
| manual-inactive | manual-inactive@example.test | AGENT, activated but INACTIVE; login refused | North / IT |

SUPER_ADMIN credentials are the ones you chose through `/setup`, not seeded.
Use Accounts → Resend activation for `manual-pending`, open its Mailpit email,
choose a password and test login. The inactive account has the fixture password
but cannot log in until you reactivate it through the UI. Neither has operational
memberships or responsibilities.

### Organization and scenarios

All catalog/team names below have the literal prefix `Manual ` and start active.
Regions: North, South. Departments: IT, Finance, People. Specialties: Hardware,
Network, Applications. Categories: Hardware, Connectivity, Access. Tags: VPN,
Laptop, Onboarding.

| Team | Coverage | Manager | Members | Team Lead | Specialties |
| --- | --- | --- | --- | --- | --- |
| Manual North Support | REGION: Manual North | manager-a | agent-a, agent-b | agent-a | Hardware, Network |
| Manual South Support | REGION: Manual South | manager-b | agent-c | None | Hardware |
| Manual Global Applications | GLOBAL; region NULL | None | agent-b, agent-c | None | Applications |

User specialties: agent-a = Hardware + Network; agent-b = Network + Applications;
agent-c = Hardware + Applications. Usernames in this table omit `manual-` for brevity.

**No tickets, subtasks or lifecycle history are seeded.** Create requests as the
two employees and perform all assignment/status/history actions yourself:

- Manager A can claim intake, then route to North Support or Global Applications;
  Manager B can route their own tickets to South Support or Global Applications.
  Organizational TeamManager membership itself grants no ticket authority.
- Agent A leads North and can test team visibility and within-team agent assignment.
  Agent B is an ordinary North member: membership alone grants no parent access.
- Assign cross-team subtasks to South/agent-c or Global/agent-b to test current
  collaboration and isolation. Primary routing restrictions remain separate from
  cross-team subtask choices. Home organization and specialties grant no authority.
- Admin and SUPER_ADMIN manage configuration and their own requests without gaining
  support access to other users' tickets. Use separate browser profiles or private
  sessions for simultaneous roles; same-origin tabs share session coordination.

## 4. Explicit reset (optional, destructive only to the manual database)

Stop the backend first. In the terminal with `MANUAL_TEST_DATABASE_URL` set:

```powershell
pnpm.cmd manual-test:reset --confirm=enterprise_service_desk_manual
```

This transaction truncates public data tables and restarts their identity sequences,
including SUPER_ADMIN, accounts, sessions and tickets. It retains `_prisma_migrations`,
schemas and constraints. There is no automatic seed or bootstrap afterward. Restart,
test `/setup` and its lock again, then seed. Reset does not delete attachment files
or Mailpit messages; old email links will no longer be valid. It does not touch other
databases. Close the backend terminal when finished so its DATABASE_URL override
cannot carry into normal development commands.

## Targeted tooling verification

```powershell
pnpm.cmd manual-test:verify
# Equivalent direct command if the local pnpm wrapper cannot run:
node --test server/scripts/manual-test.test.cjs
```

Five offline tests cover rejected URLs/no fallback, explicit reset confirmation,
connected-database identity checks, bootstrap refusal, rollback, seed/no-op behavior,
persona states/password hashing, team relationships and reset SQL. These use a fake
connection and never contact PostgreSQL. Real migration/seed/reset and browser flows
remain manual checks; the full regression suite is not part of this tooling change.
