# AI routing security and focused verification — 2026-10-17

Implementation and focused application verification are complete. **Live Gemini
operation is verified:** the synthetic-only Manager probe now passes after the user
replaced the ignored key with one from a Free-tier Gemini project. Initial HTTP 402
is resolved. No billing setting, model, provider or fallback was changed. The current
[requester phase report](requester-ai-verification.md) records shared budgets,
additional requester verification and the complete uncommitted workspace inventory.

## Repository and configuration

- Branch: `development`; clean starting HEAD and local `origin/development`:
  `2b59952cb1eb30328bf86d668a7e016f72813a08`. HEAD remains unchanged. No fetch was
  needed; the remote reference here means the locally recorded pushed branch.
- Provider: Google Gemini API. Exact model: `gemini-3.5-flash-lite`.
- Server variables: `GEMINI_API_KEY`, `AI_MODEL` (defaults to the exact model).
  A different nonempty model fails closed; no provider selector is necessary.
- Local key detected by a boolean-only check. `server/.env` is ignored and was
  neither edited nor staged. No `VITE_` AI variable. `.env.example` has placeholders.
- No new dependency, lockfile change, Prisma model or migration. Production audit
  was not necessary because dependencies did not change.

## Authority and execution

`POST /tickets/:ticketId/ai-suggestions` is the Manager routing endpoint. It accepts
no client prompt or candidate lists. AuthGuard and RolesGuard enforce current
account/session state and Manager role. The service repeats active/activated role
and sessionVersion checks within short database snapshots before and after Gemini.
It uses existing ticket visibility rather than company-wide Manager access.

| Actor / relationship | Generation | Application |
| --- | --- | --- |
| Active authorized responsible MANAGER | Yes, explicit POST | Normal authorized metadata/assignment APIs |
| Active MANAGER viewing shared NEW intake | Classification only; empty routing candidates | Must separately take responsibility first |
| MANAGER with own-request visibility only | Classification only; empty routing candidates | Existing requester permissions only |
| MANAGER with no ticket visibility | 404 | Existing denial |
| EMPLOYEE | 403 | No Manager routing entry point |
| AGENT, including Team Lead | 403 | No Manager routing entry point |
| ADMIN / SUPER_ADMIN | 403, even for own requests | No Manager routing entry point |
| Inactive, unactivated, invalid/stale session | 401 | Existing denial |

No generation on creation, navigation, page load, focus revalidation, intake
opening, polling or background work. The button disables while generation or
application is pending. Terminal tickets do not show the panel; an authorized
Manager's direct generation request may still classify a terminal ticket, with
empty routing candidates and no ability to bypass terminal mutation freezes.

The AI service has no domain mutation dependency and only reads PostgreSQL.
Short actor row locks protect authorization snapshots; no transaction is held
during the network call. No AI-created user/actor, assignment, Manager claim,
status transition, message, note, subtask, notification or external tool action.
The one permitted external operation is the explicit classification HTTPS request.

## Exact provider payload

The request body contains `systemInstruction`, one user `contents` text part
holding this explicit JSON projection, and `generationConfig` with JSON schema,
`responseMimeType: application/json`, temperature 0 and `maxOutputTokens: 2048`:

```text
ticket: {
  title, description, category: currentCategoryName,
  priority: currentPriority, tags: currentActiveTagNames[]
}
candidates: {
  categories: [{ id, name }],
  tags: [{ id, name }],
  teams: [{ id, name, specialties: [name] }],
  agents: [{ id, name: displayName, teamIds: [eligibleTeamId], specialties: [name] }]
}
```

No complete Prisma entity is serialized. The ticket ID, timestamps, fingerprint,
requester/Manager identity and actor session fields are not in the provider body.
Region/Department names are omitted because the existing primary routing predicate
does not depend on affected scope. Team membership IDs are included solely to
constrain compatible Team/Agent combinations.

Excluded: requester email/phone; password/auth/session/activation records; unrelated
directory users; conversation and internal-note text; attachments, filenames,
object keys and bytes; work history; analytics; other tickets. The API key appears
only in the server-to-provider `x-goog-api-key` header, never the URL or prompt.
Redirects are rejected. No tools, search, code execution, functions or agents.

## Redaction and prompt injection

Before clipping, deterministic regexes redact obvious emails, phone-like digit
sequences, JWTs, common Google/OpenAI/GitHub/AWS key patterns, labeled password/
secret/API-key/token values, Bearer values and long token-like strings. The same
redaction also protects candidate names and returned rationales. These heuristics
can over-redact innocent numbers/names and miss unusual or obfuscated sensitive
text; **they do not guarantee anonymity**.

The system prompt declares all ticket/candidate text untrusted, permits only
classification, requires supplied candidates, null for insufficient evidence and
JSON only, prohibits revealing instructions/requesting secrets/inventing IDs/tools,
and requests only short user-facing rationale, never hidden chain-of-thought.
Tests include “ignore previous instructions”, “return the API key” and “assign user
999999”. Even a model that follows injected text cannot mutate the application;
invented IDs fail the response boundary. React renders rationale as plain text.

## Candidate and output validation

- Category/Tag candidates: active records only, ascending ID, first 30 each.
- Team candidates: reuse `responsibleManagerTeamWhere`; active organizationally
  managed teams or active GLOBAL teams only, and only for responsible Managers on
  active tickets. Order: REGION then GLOBAL, then ID; at most 20.
- Agents: visit those teams in order; active, activated AGENT members only,
  ascending user ID, deduplicated across teams, at most 40 total. Each candidate's
  membership list is limited to those eligible teams. An early team may fill the
  Agent budget; this is deterministic bounded selection, not a relevance ranking.
- Specialty names: active only, first five by specialty ID per already-eligible
  candidate. UserSpecialty and TeamSpecialty grant no authority or membership.
- Every output object has exact keys. IDs must be safe integers in the exact
  supplied set. Unknown Category/Tag/Team/Agent IDs fail the entire result. An
  Agent requires a suggested Team to which that candidate belongs.
- Priority is LOW/MEDIUM/HIGH/CRITICAL or null. Other single suggestions accept
  null; Tags have nonnull unique IDs, maximum three. Confidence must be finite and
  within 0–1, then is rounded to four decimals. Invalid ranges are rejected rather
  than disguised by clamping. Reasons must be strings of at most 240 characters.
- UI calls it **AI confidence**, never probability or accuracy. Values below 0.55
  are marked weak and cannot be applied using the panel. An Agent's Apply also
  requires the associated Team confidence to meet that threshold.

The Gemini JSON-schema interface and model support were checked against
[Google's structured-output documentation](https://ai.google.dev/gemini-api/docs/generate-content/structured-output?hl=en).
Local validation remains authoritative even with provider schema enforcement.

## Bounds and availability

| Boundary | Limit |
| --- | --- |
| Manager | 10 generations/hour; 25/day |
| Requester feature | 5 generations/hour; 10/day per requester |
| Shared global | 12 generations/minute; 400/day across both features |
| Shared conservative token reservation | 225,000/minute; serialized request bytes + 2,048 output tokens per call |
| Limiter memory | 10,002 entries; fails closed at capacity |
| Title / description | 200 / 6,000 characters after redaction |
| Current active Tags | 30 names, each capped at 100 characters |
| Candidate display name / Specialty name | 150 / 100 characters |
| Total serialized provider request | 48,000 UTF-8 bytes, including prompt/schema |
| Provider output | 2,048 output tokens; 32,000 streamed envelope bytes |
| Rationale | 240 characters per suggestion |
| Provider deadline | 10 seconds, including body streaming |

All applicable budgets are checked before any are consumed. Counts include failed
provider attempts, not unauthorized requests. A rejected local request never
calls Gemini. Fixed windows begin on first consumption; restarts reset counters.
No Redis or distributed coordination. These limits reduce free-tier consumption
relative to the supplied 15 RPM / 250K TPM / 500 RPD quotas. Token reservation uses
one token per UTF-8 request byte plus the full output allowance; it is deliberately
conservative and may reject calls before the request-count limit. No actual usage
meter or billing-tier detection is implemented. Provider quota remains authoritative.

Timeout, missing key, network error, HTTP quota/error, rejection, malformed schema,
unknown ID or oversized input/output returns a bounded generic availability
message. Safe AI unavailability preserves HTTP 503 through the global filter via
a fixed exception type; arbitrary 5xx errors retain existing generic 500 handling.
Local exhaustion returns 429 and Retry-After. No retries or paid fallback. Other
ticket workflows continue. Provider bodies, prompts, PII, keys and stack details
are not logged by this integration. The smoke probe prints status/category only.

## Provenance, application and staleness

The transient response includes ticket ID, ticketUpdatedAt, generatedAt, provider,
model, promptVersion (`routing-v1`) and validated suggestions/confidence/reasons
with resolved redacted names. The browser holds it in component memory only.
Existing `Ticket.aiSuggested*`, `aiReviewed*` and `TicketSuggestedTag` were inspected
and remain untouched. No duplicate structure or persistent raw prompt/response.
No acceptance audit record is invented. Existing human mutation attribution remains.

A transient SHA-256 fingerprint covers bounded input/candidates, ticket updatedAt,
status and ownership. Re-reading after generation rejects obvious concurrent
ticket, candidate, membership or account changes before returning results.
Application submits `expectedUpdatedAt` to the existing PATCH metadata/assignment
endpoint; the check runs under the existing ticket lock. Normal live catalog,
TeamManager, active account and membership checks remain authoritative. There is
no AI-specific apply endpoint or authority-bearing suggestion token.

The UI offers independent Category, Priority, Tag-addition, Team and Agent actions.
Tag application preserves existing tags. Team application preserves the existing
Agent and rejects incompatibility; it never silently clears an Agent. Applying an
Agent explicitly applies the displayed Team/Agent pair. Intake never automatically
claims ownership. Each successful change clears results, requiring regeneration
for further changes. Reload/conflict guidance and regeneration handle stale results.

## Original Manager phase verification evidence

Focused checks only; no final full repository regression. These original-phase
counts are retained for comparison. The requester phase reran the preserved Manager
checks; its report contains current totals (230 units, 203 PostgreSQL tests, nine
browser PASS groups) and successful live probes.

| Check | Result |
| --- | --- |
| Server lint, typecheck, Nest build | Pass |
| Focused AI/routing/auth/security unit command below | 10 suites / 187 tests pass |
| AI units alone (subset of above) | 3 suites / 51 tests pass |
| Existing PostgreSQL ticket authorization | 1 suite / 125 tests pass |
| Final PostgreSQL AI suite | 1 suite / 29 tests pass |
| Final combined PostgreSQL AI/routing run | 2 suites / 154 tests pass |
| Client lint and TypeScript/Vite build | Pass |
| Focused browser `node test/operations-flow.mjs --ai` | 4 PASS groups; no runtime errors |
| Prisma validate / generate | Pass; unchanged schema |
| `git diff --check` | Pass |
| Exact local-key scan across tracked and nonignored source files | No matches; key never printed |

Unit command (from `server`):

```powershell
pnpm.cmd test --runInBand ai-contract ai-rate-limiter gemini.provider ticket-authorization.service tickets.service ticket-visibility.service auth.guard security.spec hardening.spec
```

PostgreSQL commands use `TEST_DATABASE_URL` explicitly targeting existing
`eds_stabilization_test` on localhost, and NODE_ENV=test. The normal development
connection is never used by Jest. The database was initially offline; the installed
Docker Desktop and existing `enterprise-service-desk-db` container were started.
Tests were then rerun successfully, with scoped fixture cleanup. No migration,
reset, db push, development seed, cloud DB access or unrelated data repair.

Browser tests use installed Chromium/CDP, a loopback Vite preview and synthetic
API fixtures. They verify no generation on page/intake load, disabled pending
button, review, ordinary metadata/assignment paths with version preconditions,
availability/429 states, low-confidence suppression, conflict reload, intake
restrictions, 390px light/dark layouts and all four non-Manager exclusions.
Two mobile screenshots are in OS temp (`eds-ai-light-mobile.png` and
`eds-ai-dark-mobile.png`); the light state was visually inspected. This is not a
live browser-to-Gemini end-to-end test.

Initial failures were resolved: disabled PowerShell script shims (use pnpm.cmd),
offline local PostgreSQL, restricted browser/CDP access, a fixture missing valid
all-scope flags, bounded catalog assumptions, a Prisma Promise.all type inference
lint issue, safe 503 handling and panel state clearing after conflict reload.
The existing routing suite intentionally produces sanitized 500 logs in negative
tests; final assertions pass. PostgreSQL emits its existing pg concurrency warning.

## Real Gemini synthetic smoke

`node --env-file-if-exists=.env -r ts-node/register src/ai-smoke.ts` uses only
“VPN connection fails from company laptop while working remotely.” plus synthetic
candidate IDs/names. The script imports no Prisma/application module and cannot
mutate tickets. The original key/project returned HTTP 402. After the user supplied
a replacement Free-tier Gemini-project key in ignored `server/.env`, the exact
same authorized probe was rerun successfully:

```text
PASS: gemini-3.5-flash-lite synthetic structured response validates; no database access or mutation
```

No response body or credential was logged. No aggressive retry or fallback. The
separate requester probe also validates all three scope states. Gemini and private
GCS may intentionally use different projects; GCS configuration remains unchanged.

## Original Manager phase file inventory (preserved)

This lists the original 28-file phase; the current complete inventory is in
[requester verification](requester-ai-verification.md#exact-current-file-inventory).

Modified tracked files (14):

```text
README.md
client/src/pages/OperationalTicketPage.tsx
client/src/services/operations.service.ts
client/src/services/tickets.service.ts
client/src/tickets.css
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

New, untracked files (14):

```text
client/src/components/AiSuggestions.tsx
client/test/ai-browser.mjs
docs/ai-routing-verification.md
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
server/test/ai-recommendations.e2e-spec.ts
```

Ignored local configuration touched: **none**. Normal ignored build/Prisma outputs
were refreshed and synthetic screenshots created in OS temp. Git remains on
`development`, unchanged HEAD, with these 28 files unstaged and no staged files.
No secret exposure, commit or push occurred.

Remaining limits: heuristic redaction; candidate truncation/ordering
can omit a better match; longest candidate sets can exceed the total byte budget
and safely disable that attempt; no model accuracy evaluation; transient provenance
only; one selected change per generation; process-local quotas; no multi-instance
coordination or measured provider-token accounting; no Firefox/Safari or manual assistive-technology
verification. Normal routing permits still-valid candidates after unrelated changes;
it does not use AI confidence/reasons as authority. No autonomous action is present.
