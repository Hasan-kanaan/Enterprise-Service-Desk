# Requester AI assistance and shared Gemini verification — 2026-10-17

Requester drafting/classification is implemented alongside the preserved Manager
routing feature. Both are manually requested, advisory, transient, and use
`gemini-3.5-flash-lite`. Live synthetic verification passes. HTTP 402 is resolved.
No commit, push, migration, dependency change or final full regression was performed.

## Repository and live provider

Continued the existing uncommitted Manager workspace on `development` at HEAD
`2b59952cb1eb30328bf86d668a7e016f72813a08`; HEAD is unchanged. The original Manager
files and tests were preserved. The user replaced the ignored local Gemini key
before this phase. This implementation did not edit or stage `server/.env` and
did not print the key. GCS remains in project `enterprise-service-511905`; a separate
Free-tier Gemini key/project is intentional and requires no GCS changes.

From `server/`, the exact Manager smoke was rerun successfully:

```powershell
node --env-file-if-exists=.env -r ts-node/register src/ai-smoke.ts
```

```text
PASS: gemini-3.5-flash-lite synthetic structured response validates; no database access or mutation
```

The new synthetic requester probe also passed:

```powershell
node --env-file-if-exists=.env -r ts-node/register src/ticket-assistance-smoke.ts
```

```text
PASS: gemini-3.5-flash-lite synthetic requester IN_SCOPE; strict response validates; no database access or mutation
PASS: gemini-3.5-flash-lite synthetic requester NEEDS_MORE_INFORMATION; strict response validates; no database access or mutation
PASS: gemini-3.5-flash-lite synthetic requester OUT_OF_SCOPE; strict response validates; no database access or mutation
```

Both scripts use synthetic strings/candidates, import no application/Prisma module,
and log only bounded outcome metadata. They do not read tickets or mutate data.
The old HTTP 402 is resolved historical context, not a current blocker.

## Two separate authority boundaries

| Feature | Actor and endpoint | Suggestions | Human action |
| --- | --- | --- | --- |
| Requester drafting | Active authenticated own-ticket creator; `POST /ticket-assistance` | Title, Description, Category, Priority, up to 3 Tags, Region, Department | Direct form population, ordinary review/edit, then normal `POST /tickets` |
| Manager routing | Visible ticket, MANAGER; `POST /tickets/:id/ai-suggestions` | Category, Priority, Tags, Team, Agent | Existing authorized metadata/assignment APIs |

Requester access includes EMPLOYEE, AGENT, MANAGER, ADMIN and SUPER_ADMIN acting
as requesters. The guards and before/after snapshots require active/activated
accounts and current session authority. No draft ticket ID or requester ID is
accepted. The existing create policy remains authoritative. No support authority,
directory access or privileged creation path is added.

Manager routing retains its eligible candidate construction, visibility rules,
intake classification-only behavior, expectedUpdatedAt checks, human review and
ordinary mutation authorization. Existing Manager security/browser tests are intact.

## Description-first UI and scope

The optional secondary **Help me complete this ticket** action is directly after
the normal Description field on Create Ticket, not on edit forms. Title and all
other form fields may still be blank when requesting assistance. The helper sends
one request and announces analyzing status through a polite live region. It never
auto-submits. Clicking Help authorizes accepted AI suggestions to populate the
existing Title/Description/Category/Priority/Tags/Region/Department controls directly.
There are no duplicate suggestion cards, Current/Suggested rows, Apply buttons or
per-field confidence percentages. Users review and freely edit the normal controls.

Null, invalid/unavailable choices and confidence below 0.55 leave existing values
unchanged. Title/Description require accepted server-validated bounded rewrites and
confident scope. Tag suggestions merge with current selections without deletions or
duplicates; at most three proposed AI tags are considered. Normal creation currently
has no total tag-count cap, and this revision does not invent one. Region/Department
select the accepted choice and clear the respective all-values toggle. Stale text
blocks the response; individual fields edited during the request remain protected.
Final Submit uses unchanged validation, identity, idempotency and attachment handling.

Immediately before population, one complete form snapshot is retained in component
memory. **Undo AI changes** restores it exactly, including replacing subsequent manual
edits; the helper explains this behavior. Starting a new AI request clears the previous
Undo opportunity, and a successful change captures a new snapshot. Undo is not a
revision history and is not persisted. It never changes attachments. In-flight field
edits are included in the snapshot. A no-op response creates no Undo action.

Compact polite live status announces completion; no programmatic scrolling or
completion focus movement. The pending helper uses aria-disabled plus a synchronous
request guard so keyboard focus is retained. Undo returns focus to Help without
scrolling. Changed fields remain ordinary keyboard-accessible controls.

| Scope | Behavior |
| --- | --- |
| IN_SCOPE | Populate accepted existing controls; announce completion and request review before submission |
| NEEDS_MORE_INFORMATION | Ask what device/application/account/service is affected and what happens; all suggestions null/empty |
| OUT_OF_SCOPE | Explain workplace IT scope and ask for the IT need; all suggestions null/empty, no unrelated solution |

Negative scope uses locally authored messages; provider-authored explanations and
choice rationales do not escape through that response. Scope never prohibits manual
ticket creation. Provider failure and local 429 preserve the draft and offer manual
completion. Short descriptions show useful local guidance without spending a call.

The component caches at most eight negative responses keyed by SHA-256 of whitespace-
normalized title/description. Repeated unchanged negative input reuses the result
without another HTTP/provider call. Changing either relevant field permits another
call. Cache lifetime is the current form/account component only; no raw descriptions
in a global cache, localStorage, sessionStorage, URL or database. Selected option
changes do not alter the fingerprint because those fields are not provider input.

## Input, privacy and candidates

Existing normal title validation already limits titles to 200 characters. Normal
ticket descriptions are stored as unrestricted text; that contract is unchanged.
The helper independently enforces title <=200, description <=3,000 and at least
20 Unicode letters/digits in browser and backend. Oversized descriptions disable
AI without truncating or changing the real form text. Extra DTO fields are rejected.

Exact business payload, wrapped in the shared system prompt/JSON-schema transport:

```text
draft: { title: redacted optional title, description: redacted description }
candidates: {
  categories: [{ id, name }], tags: [{ id, name }],
  regions: [{ id, name }], departments: [{ id, name }]
}
priorities: [LOW, MEDIUM, HIGH, CRITICAL]
```

Each catalog uses the same active public options available in normal creation,
ordered by ID, first 30, names capped at 100 characters and redacted. No organization-
admin API or operational user query is used. Region/Department only use these
selectable public catalogs; no home-location identity is necessary. Prompt requires
null when evidence is insufficient. Exact candidate membership is revalidated on
output and catalog/account snapshots are reread afterward; changed catalogs return
409. Normal create validates live eligibility again.

Excluded: requester identity/email/phone, role/session/auth/password data, unrelated
users, Teams/Agents/Managers/membership/specialties/routing topology, messages,
internal notes, work history, analytics, other tickets, attachments and all their
metadata, filenames, GCS object names and bytes. The caller selects attachments
normally, but the AI request contains only title/description. Typed sensitive text
uses the existing deterministic redactor; this is heuristic, not a guarantee of anonymity.

## Untrusted output and rewrite safety

One structured response begins with explicit scope, then suggestions. Exact object
keys, status/reason-code matching, finite 0–1 confidence, Priority enum, allowlisted
integer IDs, at most three unique Tags, 240-character reasons and rewrite limits
are enforced locally. Non-IN_SCOPE with any field suggestion is rejected. Unknown
routing fields are rejected. Invalid output becomes a fixed safe 503; no raw
provider body, prompt, secret or stack detail is exposed/logged.

The system prompt treats ticket/candidate text as untrusted data, evaluates scope
first, stops on unrelated requests, prohibits revealing instructions/secrets,
inventing IDs, tools, browsing, code execution and autonomous action. No execution
tools are configured. JSON validation remains authoritative even if the model is
misled. Generation alone has no domain write path.

Rewrites must preserve factual meaning and may only clarify/structure supplied
information. Prompt forbids invented errors, devices, locations, impact, urgency
or troubleshooting; it prefers insufficient-information scope over fabrication.
An additional validator rejects newly introduced numeric/error/model tokens absent
from source text. Emotional words such as urgent/ASAP do not alone justify CRITICAL.
These checks do not prove semantic factuality: the user must review the visible
rewrite and can reject it. Confidence is a model score, not measured accuracy.

## Shared provider and free-tier limits

`AiRecommendationProvider.generate` and `.generateDraft` have distinct business
contracts, sharing the same native-fetch implementation, model, API-key header,
10-second deadline, strict JSON response, no redirects/tools/retries/paid fallback.
No generalized agent framework, new SDK or dependency was added.

| Budget | Limit |
| --- | --- |
| Manager routing per actor | 10/hour; 25/day, preserved |
| Requester drafting per actor | 5/hour; 10/day |
| Shared global request counts | 12/minute; 400/day across both operations |
| Shared conservative token reservation | 225,000/minute across both operations |
| Limiter memory | 10,002 entries maximum; fails closed at capacity |
| Provider request | 48,000 UTF-8 bytes, including prompt/schema |
| Provider response | 2,048 output tokens; 32,000 streamed envelope bytes |

One singleton limiter in the ticket authorization module covers both services.
Every applicable budget is checked before any are consumed. Provider failures still
consume reservations; local rejection never calls Gemini. A Manager acting as a
requester has the requester feature budget as well as their separate routing budget,
but both consume the same global pools.

Token reservation counts every serialized request UTF-8 byte as one token and adds
the full output allowance, conservatively below the supplied 250K TPM quota. This
can restrict calls sooner than the count limits. It does not measure actual billed
tokens. Fixed windows begin at first use, restart resets counters, and multiple
instances or other consumers of the provider project are not coordinated. Provider
limits remain authoritative, especially at mismatched window boundaries. No quota
pool is independent per feature and no paid fallback is available.

## Requester UX revision

The revised interaction supersedes the original requester preview/apply model. Only
requester UI, its test coverage and documentation changed; Manager interaction and
backend authorization/provider/rate-limit code remain unchanged.

Revision checks: client lint/build, **15 client unit tests**, **37 existing server
requester contract tests**, **7 requester browser PASS groups** and **4 preserved
Manager browser PASS groups**. Diff check passes. No DB/full-regression rerun or new
live provider call; the original backend and live evidence below remains applicable.

```powershell
# client/
pnpm.cmd run lint
pnpm.cmd run build
node --test test/ticket-draft-assistance.test.mjs
node test/employee-flow.mjs --ai
node test/operations-flow.mjs --ai
# server/
pnpm.cmd test --runInBand ticket-assistance.contract
```

Coverage proves direct population of all seven controls, manual override of every
populated field, final ordinary submission only on explicit click, tag merging,
null/weak/unavailable candidates preserving fields, both negative scopes preserving
all controls, 503/429 preserving all controls, unchanged-input reuse, exact Undo after
manual edits, protected in-flight edits, snapshot timing, no attachment change/leak,
accessible status/focus, and compact 390px light/dark rendering. Pure patch tests also
cover malformed confidence, removed options, invalid rewrites, scope toggles and no-ops.

Changed in this UX revision: `TicketDraftAssistance.tsx`, new
`ticket-draft-assistance.ts`, `TicketForm.tsx`, `tickets.css`,
`requester-ai-browser.mjs`, `employee-flow.mjs`, new
`ticket-draft-assistance.test.mjs`, this report, README, decision and status docs.
No backend source, Manager component, package, lockfile, schema or migration changes.

## Original implementation focused verification

| Check | Result |
| --- | --- |
| Server lint/typecheck/build | Pass |
| Focused AI, limiter, authorization, creation and security units | 11 suites / 230 tests pass |
| PostgreSQL existing ticket authorization | 125 tests pass |
| PostgreSQL preserved Manager AI | 29 tests pass |
| PostgreSQL requester AI | 49 tests pass |
| PostgreSQL combined | 3 suites / 203 tests pass |
| Client lint/build | Pass |
| Requester browser mode | 5 PASS groups |
| Preserved Manager browser mode | 4 PASS groups |
| Prisma validate/generate | Pass; schema unchanged |
| Live synthetic probes | Manager + all 3 requester scope states pass |
| Repository diff/secret/staging checks | Pass; no staged files or local key in tracked/untracked repository files |

Commands from `server/`:

```powershell
pnpm.cmd run lint
pnpm.cmd run typecheck
pnpm.cmd run build
pnpm.cmd test --runInBand ai-contract ai-rate-limiter gemini.provider ticket-assistance.contract ticket-authorization.service tickets.service ticket-visibility.service auth.guard security.spec hardening.spec
pnpm.cmd exec prisma validate --config prisma7.config.ts
pnpm.cmd exec prisma generate --config prisma7.config.ts
# TEST_DATABASE_URL is derived privately from the local connection with its database
# replaced by eds_stabilization_test; the harness requires an isolated _test database.
node --experimental-vm-modules node_modules/jest/bin/jest.js --config test/jest-e2e.json --runInBand ticket-assistance.e2e-spec.ts ai-recommendations.e2e-spec.ts tickets-authorization.e2e-spec.ts
```

Commands from `client/`, browser runs sequentially on local port 3000:

```powershell
pnpm.cmd run lint
pnpm.cmd run build
node test/employee-flow.mjs --ai
node test/operations-flow.mjs --ai
```

Root: `git diff --check`. PostgreSQL tests used only `eds_stabilization_test`; no
normal development DB reset, seed, migration or mutation. Existing deliberate
failure cases emit safe generic server errors; PostgreSQL driver/VM experimental
warnings do not fail tests. No final full repository regression was run.

Coverage includes all five requester roles; inactive/unactivated/stale sessions;
short/long/extra-field input rejection; exact privacy projection; active candidate
sets; invented/archived candidates; injected routing fields; negative-scope no-write,
no-second-call behavior; normal manual creation/idempotency after negative scope;
post-provider account deactivation; hourly/daily requester limits; both real endpoints
sharing minute/day pools; and shared token reservations. Contract fixtures cover
VPN, access/password, installation, hardware and account permissions requests,
homework/recipes/creative writing and prompt-injection examples. These mocked cases
verify application boundaries, not a broad empirical model classification benchmark.

Original browser coverage included the now-superseded preview/apply interaction;
the revised coverage is listed above. Both versions preserve explicit normal
submission, attachment exclusion, negative-result reuse, input limits, 503/429,
stale results, confidence protection and no routing API requests. Current 390px light/dark
screenshots are in OS temp as `eds-requester-ai-390-{light,dark}.png`; reviewed for
layout. Browser APIs use fixtures; live provider verification is separate.

## Exact current file inventory

This is the complete 43-file uncommitted workspace, including the preserved Manager
phase. Modified tracked files (17):

```text
README.md
client/src/components/TicketForm.tsx
client/src/pages/CreateTicketPage.tsx
client/src/pages/OperationalTicketPage.tsx
client/src/services/operations.service.ts
client/src/services/tickets.service.ts
client/src/tickets.css
client/test/employee-flow.mjs
client/test/operations-flow.mjs
docs/decision.md
server/.env.example
server/src/security/http-security.ts
server/src/tickets/dto/assign-ticket.dto.ts
server/src/tickets/dto/update-ticket.dto.ts
server/src/tickets/tickets-authorization.module.ts
server/src/tickets/tickets.service.ts
status.md
```

New untracked files (26):

```text
client/src/components/AiSuggestions.tsx
client/src/components/TicketDraftAssistance.tsx
client/src/components/ticket-draft-assistance.ts
client/test/ai-browser.mjs
client/test/requester-ai-browser.mjs
client/test/ticket-draft-assistance.test.mjs
docs/ai-routing-verification.md
docs/requester-ai-verification.md
server/src/ai-smoke.ts
server/src/ai/ai-contract.spec.ts
server/src/ai/ai-contract.ts
server/src/ai/ai-rate-limiter.spec.ts
server/src/ai/ai-rate-limiter.ts
server/src/ai/ai-recommendations.controller.ts
server/src/ai/ai-recommendations.service.ts
server/src/ai/ai-unavailable.exception.ts
server/src/ai/gemini.provider.spec.ts
server/src/ai/gemini.provider.ts
server/src/ai/ticket-assistance.contract.spec.ts
server/src/ai/ticket-assistance.contract.ts
server/src/ai/ticket-assistance.controller.ts
server/src/ai/ticket-assistance.dto.ts
server/src/ai/ticket-assistance.service.ts
server/src/ticket-assistance-smoke.ts
server/test/ai-recommendations.e2e-spec.ts
server/test/ticket-assistance.e2e-spec.ts
```

Ignored generated build/Prisma files were refreshed; screenshots are outside the
repository. `server/.env` remains ignored and untouched by this implementation.
No schema/lockfile/package changes; no staging, commit or push; HEAD unchanged.

## Remaining limitations

Heuristic redaction and prompt-based semantic fidelity require human care. Three
successful live scope cases are not an accuracy benchmark. Candidate truncation can
omit a better match; large multilingual catalogs may exhaust the total byte budget
and fail safely. Cached negative results last only for the current form/account;
there is no cross-tab or backend duplicate cache. Quotas are process-local fixed
windows with conservative token estimates, not distributed provider accounting.
No persistent AI provenance/acceptance audit, multimodal inspection, autonomous
actions, Firefox/Safari verification or manual assistive-technology audit was added.
