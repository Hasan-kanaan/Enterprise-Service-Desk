# Enterprise Service Desk

Enterprise Service Desk is a full-stack IT service management application for organizations that need a clear, accountable way to handle employee support requests. It gives employees a place to report issues and follow progress, while support teams coordinate ownership, communication, and resolution under explicit access rules.

## Capabilities

- Create and track tickets with categories, priorities, regions, departments, tags, and validated attachments.
- Route work through managers, teams, and agents, with optional rule-based automatic Manager assignment for new tickets, collaborative subtasks, and separate requester conversations and private internal notes.
- Preserve ticket work cycles, resolution and closure facts, reopen reasons, and paginated communication and work history.
- Manage identities, activation and recovery workflows, teams, coverage, specialties, and service catalogs.
- Provide in-app notifications and manager-only operational analytics.
- Offer optional AI drafting assistance to requesters and recommendation assistance to managers.

## Roles

Authorization is enforced by the backend against the current account, session, ticket visibility, and operational relationships.

| Role | Responsibilities |
| --- | --- |
| `EMPLOYEE` | Create and follow own tickets, communicate with support, manage eligible request details, and perform permitted cancel, close, or reopen actions. |
| `AGENT` | Work on tickets visible through assigned responsibilities and complete assigned collaborative tasks. |
| `MANAGER` | Coordinate and assign support work, access manager operations and aggregate analytics, and make authorized lifecycle decisions. |
| `ADMIN` | Administer identities, organization structure, teams, and service configuration; the role does not itself grant ticket-operation access. |
| `SUPER_ADMIN` | Perform protected initial and system-level administration; the role does not itself grant ticket-operation access. |

Automatic ticket routing is configured only by `SUPER_ADMIN`. It supports equal round-robin assignment or least-active-ticket assignment, using explicit category-to-specialty mappings and qualifying TeamManager/TeamSpecialty relationships. Routing assigns only the responsible Manager; it does not assign a Team or Agent or advance the ticket lifecycle.

Team Leads have a specific team relationship but remain Agents; that relationship does not grant general manager authority. See [the approved decisions](docs/decision.md) for complete visibility and mutation rules.

## Ticket lifecycle and work

Tickets use the persisted statuses `NEW`, `ASSIGNED`, `IN_PROGRESS`, `WAITING_FOR_EMPLOYEE`, `BLOCKED`, `RESOLVED`, `CLOSED`, and `CANCELLED`. These are not one simple linear sequence: assignment and status changes are separate operations, and assignment alone does not imply work has started. First primary-team assignment moves a new ticket to `ASSIGNED`; an individual Agent can remain unassigned. Active work, employee responses, resolution, closure, and cancellation each follow distinct authorization and transition rules.

Employees may cancel only eligible `NEW` or `ASSIGNED` tickets; cancellation is permanent. Resolution and closure are distinct actions. A resolved ticket can be closed explicitly, and eligible resolved or closed tickets can be reopened with a requester-visible reason. Reopening starts a new work cycle, preserves prior cycle history, and applies the approved ownership-validity rules; it is not a status value. Subtasks belong to a work cycle and do not change the parent ticket's status. See the lifecycle sections of [docs/decision.md](docs/decision.md).

## AI assistance

AI is optional and server-configured through Gemini. Requester assistance first classifies whether a draft concerns an in-scope IT service request, then may suggest ticket fields. The requester reviews and can edit the populated form before normal submission. Manager routing assistance returns recommendations for explicit human review and application through existing authorized workflows.

AI does not create tickets, assign work, mutate business state, or bypass authorization. Inputs are bounded projections that exclude identity/session data, conversations, notes, attachments, and object keys. Candidate IDs and output schemas are validated. Provider access has bounded process-local quotas; there is no paid fallback or autonomous tool use. AI availability depends on external configuration and provider service, and suggestions may be incomplete or incorrect.

## Authentication and security

The application manages authentication with JWT access tokens and rotating refresh sessions in Secure/HttpOnly cookies according to deployment configuration. Tokens remain in memory on the client and in the refresh cookie; server guards and services check current account/session authority. The backend also applies request validation, rate limits, security headers, CORS restrictions, bounded request bodies, and safe error handling. Initial administrator setup uses a separately configured secret.

Authorization is based on explicit role policies and ticket/team relationships, not possession of an identifier or organization membership alone. Keep server secrets out of client `VITE_` variables. Use synthetic data for local evaluation.

## Attachments and private storage

Attachments are validated and stored through a backend storage adapter. Local filesystem storage is the default for development. The optional Google Cloud Storage adapter uses private objects; uploads, previews, and downloads pass through authenticated backend routes that recheck current ticket and attachment authorization. The application does not provide public object URLs. GCS requires bucket and runtime identity configuration; real cloud credentials and bucket access must be configured separately. The codebase documents a successful local GCS smoke probe, but a local probe is not evidence for another deployment's identity or bucket configuration. See [GCS storage documentation](docs/gcs-storage-verification.md).

## Analytics and privacy

Operational analytics are available to Managers as aggregate statistics. Responses contain bounded counts, catalog names, scope labels, and aggregate durations rather than ticket records, requester identities, communications, or individual Agent performance. Analytics access does not grant ticket-detail or employee-directory access. Time ranges and grouping semantics are documented in [service analytics](docs/service-analytics.md) and the [analytics privacy review](docs/analytics-privacy-review.md).

## AI knowledge base (decided; in progress)

Agents and Managers will receive advisory solution suggestions grounded in company knowledge (retrieval-augmented generation). Status: only the PostgreSQL vector extension is enabled so far; no knowledge feature is implemented yet.

Decisions:

- **Same database.** Vectors are stored in the existing PostgreSQL 17 using the `pgvector` extension (Docker image `pgvector/pgvector:pg17`), not a separate vector database. Access rules and soft-deletion are then enforced with SQL joins in one transaction snapshot, and no synchronization between two stores is needed.
- **Prisma stays.** Vector columns are declared with `Unsupported(...)` and queried with raw SQL; all other data access remains Prisma.
- **Embeddings.** Gemini embedding model, reduced vector size (planned 768), English only. Chunking is deterministic server code, not AI.
- **Sources.** Uploaded company documents (policies, runbooks, API docs, project briefings), license/asset records derived from invoices, and resolved ticket cases.
- **Invoices.** Raw invoices are never stored. Only derived license and asset facts (vendor, product, seats, dates, support references) are kept; amounts, bank and tax details are removed at ingestion.
- **Tickets.** Only resolved work cycles are indexed (title, redacted description, category, tags, resolution summary), by a background sweep rather than inside ticket transactions. Reopening supersedes the earlier entry. Conversations, internal notes and attachments are never indexed.
- **Synthetic data.** Historical incidents for testing are standalone knowledge records, never fake `Ticket` rows.
- **Authority.** Only `SUPER_ADMIN` manages documents. Suggestions are available only to users who can already operate the ticket (assigned Agent, Team Lead, current collaborator, responsible Manager). Retrieval is filtered server-side by audience before any text reaches the model. Suggestions are advisory and never change ticket state.
- **Limits.** The feature has its own quota, separate from routing and drafting.

## Technology and architecture

| Area | Technology |
| --- | --- |
| Web client | React 19, TypeScript, Vite, React Router, Redux Toolkit |
| API | NestJS 11, TypeScript, REST |
| Data | PostgreSQL 17, Prisma 7 |
| Validation and forms | Zod, React Hook Form, class-validator |
| Authentication | JWT access tokens, rotating refresh sessions, HTTP-only cookies |
| Attachments | Local filesystem adapter; optional Google Cloud Storage |
| Email | Nodemailer with configurable SMTP provider |
| AI | Optional Gemini API integration |
| Package manager | pnpm |

The repository contains two independently installed pnpm applications, not a pnpm workspace. The React client calls the NestJS API over HTTP. The server owns business rules, authorization, validation, storage access, and Prisma/PostgreSQL operations; the browser never connects directly to the database. The root package contains convenience scripts only.

## Repository layout

```text
client/          React application, UI, API services, and browser checks
server/          NestJS application, Prisma schema/migrations, and server tests
docs/            Decisions, security, identity, AI, storage, analytics, and operations docs
README.md         Project overview and local setup
package.json      Root convenience scripts
```

## Local development

### Prerequisites

- Node.js 24.x (the repository's `.node-version` specifies the local version)
- pnpm 11.9.0
- PostgreSQL 17
- Git

### Install dependencies

Run from the repository root:

```sh
pnpm install:apps
```

This invokes the root script to install the server and client independently using their frozen lockfiles.

### Configure the environment

Copy `server/.env.example` to `server/.env` and `client/.env.example` to `client/.env`. Configure local values in those ignored files. The backend uses `DATABASE_URL` for PostgreSQL and requires `INITIAL_SETUP_SECRET`; configure `JWT_SECRET`, `ALLOWED_ORIGINS`, and other values as appropriate for your environment. `start:dev` loads `server/.env`. The client-side `VITE_API_URL` is public configuration and must not contain secrets.

Optional integration variables are listed by name in the examples: `GEMINI_API_KEY`, `AI_MODEL`, `MAIL_PROVIDER`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`, `APP_PUBLIC_URL`, `STORAGE_PROVIDER`, `ATTACHMENT_STORAGE_DIR`, `GCS_BUCKET_NAME`, and `GCS_PROJECT_ID`. GCS uses standard Google Application Default Credentials (`GOOGLE_APPLICATION_CREDENTIALS` is optional); do not commit credential files. Review all options and security constraints in the [server environment example](server/.env.example) and [client environment example](client/.env.example).

### Prepare the database

For an evaluation with the included manual fixtures, create a fresh local PostgreSQL database named `enterprise_service_desk_manual`. Keep it separate from any existing development or production database. Set `DATABASE_URL` in `server/.env` to that database. From the repository root:

```sh
pnpm --dir server exec prisma generate --config prisma7.config.ts
pnpm --dir server exec prisma migrate deploy --config prisma7.config.ts
```

These commands generate the Prisma client and apply committed migrations to the configured local database. They are not reset commands. The protected setup flow creates the initial administrator using `INITIAL_SETUP_SECRET`.

### Start both applications

In separate terminals from the repository root:

```sh
pnpm --dir server start:dev
pnpm --dir client dev
```

The API defaults to `http://localhost:8000` and the client to `http://localhost:3000`. Set `VITE_API_URL` in the client environment if the API uses another base URL. Configure a local SMTP sink such as Mailpit if you want to receive the initial administrator activation email; the setup flow requires completing that activation before fixture provisioning.

### Create the initial administrator and provision local fixtures

Open the application and follow the protected `/setup` flow to create the initial `SUPER_ADMIN`. You choose the identity and complete account activation from the email link; the seed utility never creates or sets a password for this account. Sign in, then confirm setup is locked. Stop the backend temporarily before provisioning.

The supported root command `pnpm manual-test:seed` provisions **10 synthetic manual-test accounts** plus organization and catalog fixtures. It requires exactly one active, activated, password-bearing `SUPER_ADMIN` and an otherwise empty manual database. It accepts only a loopback PostgreSQL URL for the exact `enterprise_service_desk_manual` database through `MANUAL_TEST_DATABASE_URL`; it does not fall back to `DATABASE_URL` or `TEST_DATABASE_URL`. In PowerShell, from the repository root, set that variable to the same dedicated manual database and run:

```powershell
$env:MANUAL_TEST_DATABASE_URL = 'postgresql://USER:PASSWORD@127.0.0.1:5432/enterprise_service_desk_manual'
pnpm manual-test:seed
```

Restart the backend, then sign in at `http://localhost:3000/login` with one of the login-enabled synthetic accounts below. The fixture emails use the reserved `example.test` domain. This command is for a **fresh local evaluation database only**; it refuses to merge into an existing scenario. It never deletes data. A complete existing fixture set is a no-op, preserving account changes and manual progress; a partial set or other preexisting non-bootstrap data is rejected. It creates no tickets. See [manual testing](docs/manual-testing.md) for the full fixture setup, database safeguards, and scenarios.

#### LOCAL DEMO ACCOUNTS — local evaluation only

The current seed provisions 10 accounts rather than a five-account set. Usernames are not part of the current identity model; log in with email. The eight active, activated accounts with passwords can sign in. All password-bearing fixtures share the synthetic local-only password shown below. The seed sets activation timestamps directly but leaves email verification unset for every seeded account; these are test fixtures, not production identities. `manual-pending` has no password and needs the documented activation flow; `manual-inactive` cannot sign in while inactive.

| Role | Username | Email | Password |
| --- | --- | --- | --- |
| `ADMIN` | — | `manual-admin@example.test` | `ManualDesk!2026` |
| `MANAGER` | — | `manual-manager-a@example.test` | `ManualDesk!2026` |
| `MANAGER` | — | `manual-manager-b@example.test` | `ManualDesk!2026` |
| `AGENT` | — | `manual-agent-a@example.test` | `ManualDesk!2026` |
| `AGENT` | — | `manual-agent-b@example.test` | `ManualDesk!2026` |
| `AGENT` | — | `manual-agent-c@example.test` | `ManualDesk!2026` |
| `EMPLOYEE` | — | `manual-employee-a@example.test` | `ManualDesk!2026` |
| `EMPLOYEE` | — | `manual-employee-b@example.test` | `ManualDesk!2026` |
| `AGENT` | — | `manual-pending@example.test` | Not set |
| `AGENT` | — | `manual-inactive@example.test` | `ManualDesk!2026` |

These published credentials apply only to the synthetic accounts in the dedicated manual database. Do not use them outside a local evaluation environment. The initial `SUPER_ADMIN` credentials are chosen by you and are not listed here.

## Build, lint, and tests

Commands below correspond to scripts in the root, client, and server package manifests:

```sh
pnpm build
pnpm --dir server lint
pnpm --dir server typecheck
pnpm --dir server test
pnpm --dir server test:e2e --runInBand
pnpm --dir server test:dependencies
pnpm --dir client lint
pnpm --dir client build
pnpm --dir client test:phone
pnpm --dir client test:browser
```

Server end-to-end tests require a separately configured isolated PostgreSQL test database (`TEST_DATABASE_URL`); read [manual testing](docs/manual-testing.md) for its safeguards and browser-test requirements before running them. Do not point tests at a development or production database. `pnpm --dir client test:browser` runs browser workflows and may require the documented local browser/API setup. `pnpm --dir server test:dependencies` is an offline compatibility check.

## Technical documentation

- [Approved architecture and business decisions](docs/decision.md)
- [Security baseline](docs/security-baseline-audit.md) and [account security](docs/account-security.md)
- [Identity model](docs/identity-model-verification.md) and [identity lifecycle](docs/identity-lifecycle-verification.md)
- [Requester AI](docs/requester-ai-verification.md) and [manager AI routing](docs/ai-routing-verification.md)
- [Private attachment storage](docs/gcs-storage-verification.md)
- [Service analytics](docs/service-analytics.md) and [analytics privacy](docs/analytics-privacy-review.md)
- [Local manual testing](docs/manual-testing.md)
- [Deployment plan and constraints](docs/demo-deployment-plan.md)

The deployment document describes a plan and constraints; it does not indicate that the application is publicly deployed.
