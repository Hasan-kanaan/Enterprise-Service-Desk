# Manager analytics privacy/security review — 2026-10-16

**Conclusion:** Analytics exposes aggregate operational information only and
grants no new ticket-record or user-record authority.

No exposed person identifiers, ticket references/private content, person-level
activity dimensions, authorization widening or inappropriate caching were found
in the reviewed analytics implementation. No production fixes or feature/behavior
changes were needed. This review changes tests and documentation only.

## Complete serialized response contract

The inventory below is verified against **JSON.parse(response.text)** from the
real Nest HTTP endpoint backed by isolated PostgreSQL, and against the response
body received by browser XMLHttpRequest. These assertions are exact recursive
allowlists, not just TypeScript declarations or snapshots. All object keys are
listed; no extra properties are permitted by the tests.

```text
{
  range: {
    days: 7 | 30 | 90,
    from: ISO timestamp string,
    to: ISO timestamp string,
    timezone: "UTC"
  },
  current: {
    open: integer,
    awaitingTeam: integer,
    awaitingAgent: integer,
    statuses: [{ status: operational TicketStatus string, count: integer }]
  },
  period: {
    created: integer,
    resolved: integer,
    closed: integer,
    reopenedTickets: integer,
    reopenEvents: integer
  },
  resolution: {
    eligibleCycles: integer,
    medianHours: number | null,
    p90Hours: number | null
  },
  trend: [{ date: "YYYY-MM-DD", created: integer, resolved: integer, closed: integer }],
  aging: [{ bucket: age-label string, count: integer }],
  groups: {
    categories: GroupSection,
    tags: GroupSection,
    regions: GroupSection,
    departments: GroupSection,
    combinations: GroupSection
  },
  teams: {
    totalGroups: integer,
    rows: [{
      name: Team name string,
      scope: "REGION" | "GLOBAL",
      region: Region name string | null,
      open: integer,
      awaitingAgent: integer,
      eligibleAgents: integer,
      ticketsPerAgent: number | null
    }]
  },
  expertise: {
    totalGroups: integer,
    rows: [{
      name: Specialty name string,
      teams: integer,
      eligibleAgents: integer,
      open: integer,
      blocked: integer,
      awaitingAgent: integer
    }]
  }
}

GroupSection = {
  totalGroups: integer,
  rows: [{
    name: catalog/group label string,
    archived: boolean,
    created: integer,
    open: integer,
    reopened: integer
  }]
}
```

`current.statuses` has the five operational ticket statuses, not account statuses.
`aging.bucket` is one of Under 1 day, 1–3 days, 3–7 days, 7–14 days, 14+ days; it
is not an object-storage bucket. `archived` describes catalog configuration, never
an account. The five dimension sections plus Team/Specialty rows each have a
server-side cap of 50. Daily trend has at most 91 entries for the longest preset.
No record IDs are part of this contract, including catalog IDs.

## Identity, organization and ticket findings

- **Users/accounts:** No user/requester/Agent/Manager/Team Lead/employee IDs,
  display names, contact details, job titles, identifiable roles/account state,
  sessions, credentials, individual home organization, Specialty profiles or
  individual work/resolution/reopen statistics are serialized. AuthGuard reads
  the caller's account/session for authorization but never forwards that object
  through the analytics controller/service response.
- **Tickets:** No ticket IDs/references, titles, descriptions, conversations,
  internal notes, filenames, object-storage keys, attachment metadata, requester
  identity or owner identity is serialized. There are no raw ticket arrays or
  drill-down endpoints. The existing My Work link uses ordinary authorized queues.
- **Team capacity:** Exact row fields are shown above. Eligibility is counted in
  PostgreSQL from active activated Agent memberships; no member arrays, identities,
  Team Lead/Manager relationships or client-side member counting. `region` is the
  Team's organizational coverage label, not any person's home Region.
- **Specialty coverage:** Exact row fields are shown above. Distinct eligible
  Agents on matching configured Teams are counted in PostgreSQL. No employee-by-
  Specialty matrix, user IDs or individual expertise profiles reach Node/React.
- **Organization and small groups:** The approved Region/Department/Team/Specialty
  and Category/Tag names remain organizational labels. No labels are derived
  from employee identity or free-text tickets. A Team with one eligible Agent
  still exposes Team workload and a Team-level ratio, never Agent-specific work.
  Counts of one remain allowed under the approved design; no suppression system
  was introduced. Catalog labels are administrator-configured names, not proof
  that arbitrary manually entered names could never themselves contain personal
  text; no automatic name inference or new label sanitization policy was added.

Direct requests by the same Manager remain denied for `/users`,
`/organization/teams`, `/organization/teams/:id/members`,
`/organization/teams/:id/people?purpose=member`, and
`/organization/agents/:id/specialties`. Current account/Team-detail authorization
is unchanged. Existing analytics tests also retain shared-intake and responsible-
Manager detail access while denying another Manager's ticket/history, even when
the caller manages its Team organizationally.

## Authorization, parameter and SQL review

| Caller / condition | Direct API result |
| --- | --- |
| Authenticated active MANAGER | 200 |
| EMPLOYEE | 403 |
| AGENT | 403 |
| ADMIN | 403 |
| SUPER_ADMIN | 403 |
| No token or invalid token | 401 |
| Manager account made inactive after earlier success | 401 |
| Same token after live DB role changes from MANAGER to AGENT | 403 |

AuthGuard validates current account/session state and RolesGuard explicitly
checks MANAGER. There is no role hierarchy shortcut. Browser hiding is supplementary;
the direct HTTP tests prove backend enforcement.

Omitted `days` defaults to 30; only the exact strings `7`, `30`, `90` pass. Direct
HTTP tests reject arbitrary strings, SQL fragments, negative/huge numbers, decimals
(including `7.0`), empty values, leading zeros, JSON arrays, bracket-array syntax,
indexed-array syntax, duplicate parameters (same and different values), unknown
user filters, person grouping requests and member-inclusion requests with 400.
Global ValidationPipe forbids unknown fields and does not serialize invalid input
values/targets. Service validation independently enforces the allowed presets.

The raw aggregation uses Prisma.sql tagged parameters. Request strings never
become SQL fragments, identifiers, table names or sort clauses. Validated presets
produce server-created Date parameters; static literal dimensions/sorts are fixed
in source. PostgreSQL performs counting, joins, percentiles and JSON projection.
Node receives one bounded aggregate result, not raw user/ticket datasets. Current
backlog has intentionally no lower age bound; this is the approved current-work
metric, not an unrestricted historical response.

There are three intentional `SELECT *` expressions **over explicitly projected
CTEs** (`grouped`, `team_rows`, `expertise_rows`), never over base Ticket/User
models. They carry only internal grouped fields into ranking/limiting. Final
JSON uses explicit jsonb_build_object field lists. Internal IDs are used for joins,
distinct counts, group keys or stable ordering and never become JSON properties;
the resolved-cycle CTE also retains an unused internal ticketId projection, which
does not leave PostgreSQL. No wildcard or private content is returned for
convenience. These internal projections were not changed because no exposure was
found and approved behavior was to remain unchanged.

## Frontend, logs and caching

Frontend API types match the actual response. The Analytics page consumes group
rows and already computed counts, never a user directory, membership list or raw
ticket list. The visual trend and percentage formatting use only aggregate rows.
No payload logging exists in the analytics service/controller/page or API client;
global server-error logging emits method/route without query, response, SQL or
credential contents. Optional scale tests log query plans, not response rows.

The existing global API middleware sets **Cache-Control: no-store**, verified on
successful, forbidden and invalid-query responses and on the body received by the
browser. No shared/application analytics cache exists. Client useResource retains
only mounted-component state, aborts obsolete work, and ProtectedRoute keys the
outlet by account ID/role so account replacement does not reuse another account's
analytics state. No analytics persistence to Redux/localStorage/sessionStorage or
service worker cache was found. No new caching was introduced.

## Test changes and results

1. Strengthened the existing PostgreSQL/HTTP response test with exact field sets
   at every object level, explicit case-insensitive sensitive-key denial, private
   content and fixture display-name/email/token-value exclusions, and exact one-
   Agent Team/Specialty counts. Parses the actual serialized response text.
2. Added three accepted-range HTTP cases and sixteen invalid/discovery parameter
   cases, with no-store assertions. Added Manager directory/Team-member/individual-
   Specialty denial and same-token live role/account-state rechecks.
3. Added an optional real-response browser review: ANALYTICS_BROWSER_REVIEW=1
   starts Nest on an ephemeral **127.0.0.1** port using the isolated test database.
   The existing browser interception harness forwards the analytics request to
   that server with a generated test Manager token, passes its real JSON and
   Cache-Control header through, then inspects the XHR body received by React.
   All nested field sets, exact fixture counts and no-store are asserted. Remaining
   analytics UI/role-route checks use the existing controlled browser fixtures.
   No response file is written. Credentials stay in the test subprocess environment;
   only PASS labels are emitted. The server and browser close after the test.
4. Existing exact count/lifecycle/scope/capacity tests remain. ANALYTICS_SCALE=1
   again exercises >50 groups in all seven sections and 12,070 fixture tickets.

Verification used only `eds_stabilization_test` with TEST_DATABASE_URL and
DATABASE_URL set explicitly, retaining the `_test` guard:

| Command/check | Result |
| --- | --- |
| Server lint / typecheck / build | Pass |
| `pnpm.cmd --dir server test --runInBand analytics ticket-authorization ticket-visibility auth.guard` | 4 suites / 80 tests pass |
| Analytics PostgreSQL suite, standard mode | 37 pass; optional scale/browser cases explicitly skipped |
| Analytics PostgreSQL suite, ANALYTICS_SCALE=1 and ANALYTICS_BROWSER_REVIEW=1 | **39/39 pass**, including all existing accuracy tests, caps and real browser network inspection |
| Existing tickets-authorization.e2e-spec.ts in focused combined run | **125/125 pass** |
| Analytics browser mode invoked by PostgreSQL review | **5 PASS groups**: real payload plus the four existing analytics groups; no runtime/console errors |
| Client lint | Pass; only browser tests changed, no frontend runtime/types requiring a new build |
| `git diff --check` | Pass |

The initial combined run had 163/164 passing: its browser check expected the small
fixture after the optional scale test had expanded it. The browser check now runs
before scale expansion; final analytics verification passes 39/39. This was a test
ordering correction, not an application privacy failure. The existing pg concurrent
client deprecation warning and intentional server-error rollback logs in ticket
authorization tests are unchanged. Chromium requires permitted execution outside
the sandbox, as established in the implementation verification.

This is a focused implementation review and test evidence, not a production
deployment audit. No real employee directory or development database was read for
the payload checks. No full repository regression, deployment, GCS/AI work, commit
or push was performed.

## Exact files changed by this review

- `server/test/analytics.e2e-spec.ts` — serialized contract, parameter, authority,
  cache and optional real-browser tests; prior accuracy tests retained.
- `client/test/analytics-browser.mjs` — loopback-only test-server proxy and received
  network-body assertions; existing analytics browser checks retained.
- `client/test/operations-flow.mjs` — await optional live test responses and forward
  their Cache-Control header.
- `docs/decision.md` — new durable privacy decision; previous entries preserved.
- `docs/service-analytics.md` — link and explicit employee-directory/user-record
  boundary, preserving the original implementation verification checkpoint.
- `status.md` — new review entry; previous entries preserved.
- `docs/analytics-privacy-review.md` — this response inventory and review report.

No production controller/service/query/DTO, frontend page/type, authorization,
schema/index, dependency or environment file changed during this review.

Final repository state includes the prior uncommitted implementation: branch
`development`, **7 modified tracked files and 14 new files**, all unstaged.
This review adds one file to the original phase's 20-file set. Nothing committed
or pushed.
