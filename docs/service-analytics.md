# Service / Operations Analytics — design and verification

UI follow-up 2026-10-17: the activity toolbar now shows a compact human-readable
UTC date range without a routine Refresh button. Open-status composition uses a
lightweight donut plus an always-visible count/percentage table and explicit zero
state. WAITING_FOR_EMPLOYEE is labeled “Waiting for employee” on analytics only.
Initial/range loads and restrained focus revalidation retain error Retry. Backend
queries, range contract, caps and privacy tests are unchanged. See
[ISS-054–065](ux-security-054-065.md) for current verification.

Implemented 2026-10-16. This approved phase supersedes earlier analytics deferrals;
it does not start GCS operational setup, AI integration or employee scoring.

The subsequent [focused privacy/security review](analytics-privacy-review.md)
enumerates every serialized field and verifies the actual HTTP/browser payload.
Analytics grants no company-wide employee-directory or person-level activity
access. Team capacity and Specialty coverage are calculated server-side, with no
member identities or individual Specialty profiles. Existing user/account,
Team-detail and ticket authority is unchanged. The review changes tests and
documentation only; the implementation checkpoint below retains its original
verification results.

## Routes, response and authority

Manager navigation opens `/analytics`; the range is stored as `?days=7`, `30` or
`90`, defaulting to 30. A dedicated Nest AnalyticsModule serves
`GET /analytics?days=7|30|90`. Other range values, repeated values and unknown
parameters are rejected with 400. Invalid frontend range values display/load 30
days; selecting a range writes the supported value to the URL.

AuthGuard validates the live account/session; RolesGuard permits only MANAGER.
EMPLOYEE, AGENT, ADMIN and SUPER_ADMIN receive 403; unauthenticated callers receive
401. React uses the existing ProtectedRoute and shows Analytics navigation only
to Managers. Administrative rank and Team Lead responsibility are not exceptions.

The explicit AnalyticsResponse DTO consists of `range`, `current`, `period`,
`resolution`, `trend`, `aging`, `groups`, `teams` and `expertise`. PostgreSQL
constructs only these aggregate projections. No raw Ticket models or ticket/user
IDs, titles, descriptions, messages, internal notes, attachment metadata, email,
phone, credentials, personal names or individual Agent performance enter the
response. Catalog names (including Team names) are allowed aggregate labels.

Company-wide totals intentionally include tickets a Manager cannot read. No
analytics detail endpoint or ticket-discovery filter is provided. The page's
**My Work** link opens the unchanged `/work/tickets` queue. Existing ticket and
history APIs retain their backend visibility predicates: own requests, shared
NEW intake with no responsible Manager, or explicit responsible-Manager ownership.
TeamManager, affected scopes, Specialties and REGION/GLOBAL coverage do not grant
detail visibility. Tests prove that a Manager organizationally managing a Team
can see its grouped workload but receives 404 for another Manager's ticket.

## Metric definitions

All period activity uses a rolling interval of exactly 7/30/90 elapsed days,
inclusive of `from`, exclusive of `to`, evaluated once per request in UTC. SQL
uses one statement/snapshot. Daily trend bins include partial boundary days, so
there are at most 8/31/91 points. There is no automatic polling or historical
unbounded range option.

| Metric | Definition |
| --- | --- |
| Open now / compact status counts | Persisted NEW, ASSIGNED, IN_PROGRESS, WAITING_FOR_EMPLOYEE and BLOCKED tickets created before the snapshot, including older backlog. Terminal statuses are excluded. |
| Created | Ticket.createdAt in the selected interval. |
| Resolution events | Work cycles with RESOLVED/CLOSED outcome and recorded endedAt in the interval. Repeated resolutions of one ticket count separately. |
| Closure events | Recorded work-cycle closedAt in the interval, including truthful historical closures whose resolution timing is missing. |
| Volume trend | Created tickets and resolution/closure events grouped by recorded UTC date; absent days are zero-filled. A small CSS created-volume chart has an expandable exact table for all three series. |
| Category / Tag | Created ticket counts, share of all creations in the interval, current open count and distinct tickets reopened in the interval. Retained archived references have their current name and archived label. |
| Region / Department | The same measures by affected scope, never requester home organization. |
| Backlog age | Elapsed time from original Ticket.createdAt to snapshot. Buckets are [0,1), [1,3), [3,7), [7,14), [14,infinity) days. Reopening does not reset original ticket age. This is not an SLA measure. |
| Resolution duration | Median and continuous p90 hours from cycle.startedAt to endedAt for resolved/closed cycles ending in range. Includes waiting time. NULL ends and ends before starts are excluded; zero is possible only from a real zero-duration cycle. Empty cohorts return null, displayed as Not enough data. |
| Reopened tickets / events | Distinct ticket IDs / number of REOPENED cycles whose startedAt falls in range. IDs are used only inside SQL. Counts include reopened tickets created before the selected period. |
| Frequent combinations | Category + Tag counts using the same created/open/reopened measures. Structured correlations only; no free-text analysis, supplier attribution or root-cause conclusion. |

Migration-time ownership snapshots are not used to attribute performance. Where
the migration retained real start/end timestamps they are eligible for duration;
missing timestamps are never reconstructed. Ticket.resolvedAt/closedAt clear on
reopening, so cycle timestamps preserve historical events. Metrics do not claim
to recreate history predating the available persisted evidence. Catalog/scopes
are current retained relationships, not historical dimension snapshots.

All-region tickets contribute **once to All regions**, not once per configured
Region. All-department tickets behave identically. Explicit multiple scopes and
Tags contribute once per relationship; a ticket can appear in several groups,
so group totals/shares may exceed company totals/100%. All flags take precedence
over any retained explicit links. Missing non-all scope links form an Unspecified
group; they are not assigned to a fabricated home scope. A missing denominator
displays Not enough data. There is no reopen percentage: mixing this period's
reopen events with this period's resolutions would misstate a cohort rate.

## Workload and expertise

Team rows show current primary-ticket workload, routed work lacking a primary
Agent, and active activated AGENT members of active Teams. Pending/inactive
accounts and other roles do not count. A Team with zero eligible members has a
null tickets-per-Agent ratio. Active unassigned work appears separately as
awaiting a Team. Subtasks are excluded to avoid mixing task sizes/counting a
parent repeatedly. An Agent can belong to multiple Teams; Team capacities are
not additive company headcount. No individual identities or scores appear.

Expertise rows cover active configured Specialties. Matching Team counts use
actual TeamSpecialty links to active Teams. Eligible specialist coverage counts
distinct active activated Agent members with a UserSpecialty matching that Team's
Specialty. Retained inactive/pending links confer no capacity. Open/blocked/
Agent-unassigned counts represent work routed to those Teams, with overlapping
Specialties explicitly explained. The UI highlights work with zero configured
specialist coverage and Specialties without Teams. These are conservative signals,
not staffing prescriptions: a Team's Specialty does not prove a ticket requires
it, there is no Category/Tag-to-Specialty mapping, and skills are never inferred.
No Supplier or Training entities were introduced.

## Query scale and indexes

The query uses bound Prisma.sql parameters, materialized period/current-work
inputs, database GROUP BY, percentile_cont and capped JSON projections. Node
receives **one aggregate row**, not a ticket array. Each of the five dimension
sections, Team section and Specialty section returns at most 50 rows plus its
full group count. Dimension order is created descending, open descending,
reopened descending, stable internal catalog key; Team/Specialty order is open
descending then internal ID. IDs never enter the response. UI explains truncation.
Sorting/grouping still examines matching database rows; the cap bounds output,
not all database computation. Current backlog intentionally has no lower age bound.

Inspected schema support includes Ticket(createdAt,id), status indexes including
(status,resolvedAt), categoryId, (assignedTeamId,createdAt,id), scope/Tag join
composite primary keys and reverse foreign-key indexes, TeamMember and Specialty
join keys. Existing cycle indexes lead with people IDs for personal history;
they are not global endedAt/closedAt/startedAt indexes. Ticket.closedAt also has
no dedicated index and is not used for these historical event queries.

No indexes or migrations were added. EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) on
isolated PostgreSQL 17 measured the exact query against an additional **12,070
tickets / 12,072 cycles**, 12,130 Tag relationships, multi-scope links and more
than 50 groups in each section. Baseline test data remains, so the final plan
scanned 12,176 total tickets and 12,467 cycles. The fixture adds 6,067 period
creations, 4,065 current open tickets, 4,003 resolution events and 4,002 closure
events; assertions compare baseline current counts and exact period counts.

Final observed planning time: **2.644 ms**; execution: **52.682 ms**; returned rows:
**1**; shared-hit blocks: **1,248**; shared reads and temporary read/write blocks:
**0**. These are observations, not timing assertions or a production latency SLA.

- Current workload used a bitmap scan backed by Ticket_status_resolvedAt_idx.
- Creation selected about half the tickets; PostgreSQL preferred a sequential
  scan despite the existing createdAt index (0.875 ms observed).
- Resolved/closed cycle scans selected about one-third of cycle rows; their
  observed scans were 0.875/0.661 ms. The selective reopen scan was 0.507 ms.
- Tag joins scanned the 12,130 links and grouped in PostgreSQL; current Team and
  Specialty aggregates used one grouped pass instead of per-Team backlog scans.
- The first plan exposed repeated Team scans. These were replaced with grouped
  workload/capacity joins, then the same approach was applied to Specialties.
  Fresh statistics on all fixture tables removed inflated plan estimates/JIT
  overhead observed with stale relationship statistics (327.929 ms prior run).

These observations do not justify additional write-cost indexes at the measured
scale. Much larger/sparser historical production datasets may justify leading
cycle timestamp indexes after measurement. Repeated aggregate requests still cost
database work; the normal authenticated API rate limits apply. No cache, summary
table, export or cross-request consistent snapshot is provided.

## Verification

Database commands explicitly targeted existing isolated `eds_stabilization_test`
on localhost:5432 using TEST_DATABASE_URL and DATABASE_URL; the existing `_test`
guard is unchanged. Fixture creation and cleanup use unique name/email prefixes,
including partial setup cleanup. No development reset, seed or db push occurred.

| Check | Result |
| --- | --- |
| `pnpm.cmd --dir server lint` | Pass |
| `pnpm.cmd --dir server typecheck` | Pass |
| `pnpm.cmd --dir server build` | Pass |
| `pnpm.cmd --dir server test --runInBand analytics ticket-authorization ticket-visibility tickets.controller` | 4 suites / 78 tests pass (10 analytics bounds tests) |
| `pnpm.cmd --dir server test:e2e --runInBand analytics.e2e-spec.ts tickets-authorization.e2e-spec.ts` with ANALYTICS_SCALE=1 | 2 suites / 140 tests pass; 125 existing authorization tests |
| Final `pnpm.cmd --dir server test:e2e --runInBand analytics.e2e-spec.ts --silent=false` with ANALYTICS_SCALE=1 | 15 analytics tests pass, including final SQL/scale changes; full EXPLAIN output in ignored local analytics-scale-verified.log |
| Additional final `pnpm.cmd --dir server test:e2e --runInBand analytics.e2e-spec.ts` | 16 standard tests pass, scale explicitly skipped (already verified above); adds 30/90-day accuracy and retained all-scope-link checks without application changes. Total analytics coverage is now 17 tests. |
| `pnpm.cmd --dir server exec prisma validate --config prisma7.config.ts` | Pass |
| `pnpm.cmd --dir server exec prisma generate --config prisma7.config.ts` | Pass; no schema/migration changes, so deploy/status/diff not required |
| `pnpm.cmd --dir client lint` / `build` | Pass |
| From client: `node test/operations-flow.mjs --analytics` | 4 PASS groups |
| From client: `node test/operations-flow.mjs` | 19 PASS groups; existing operations regression |
| `git diff --check` | Pass |

Database coverage includes every role, unauthenticated access, query validation,
private projection exclusion, managed-Team detail/history denial, allowed intake/
responsible-Manager details, all five operational status counts, exact range and
aging boundaries, archived Category/Tag combinations, explicit/all scopes,
duration median/p90, unknown/invalid historical timing, repeated reopening,
Team eligibility, zero eligible capacity, actual Specialty links, and all seven
response caps. The optional scale test is reported as skipped unless
ANALYTICS_SCALE=1, rather than silently passing without running.

Browser fixtures verify Manager navigation, excluded-role direct routes and no
analytics requests, URL ranges, loading/stale cancellation, overview and every
section, daily table, empty/missing data, retry, 768/390px layouts, light/dark
surfaces and no runtime/console errors. Existing operational browser coverage
retains allowed and denied ticket navigation plus Manager/Agent/Team Lead work.

Initial fixes during verification: Nest module needed its local JwtModule/guards
consistent with existing modules; one test mock was adjusted for strict lint.
Sandbox Chromium timed out at Page.enable before application load; permitted
execution passed. The delayed-response fixture initially tried to fulfill an
already aborted interception; the harness now ignores that specific analytics
cancellation, retaining all other error checks. Existing authorization tests
intentionally exercise server-error rollback paths and still pass. The existing
pg concurrent-client deprecation warning remains tooling output.

No full repository regression, manual assistive-technology review, Firefox/Safari
or real deployment verification was performed. Browser APIs are fixtures;
PostgreSQL/HTTP authorization/accuracy are verified independently against Nest.

## Exact files changed and repository state

Modified:

- `README.md`
- `docs/decision.md`
- `status.md`
- `server/src/app.module.ts`
- `client/src/layouts/AppLayout.tsx`
- `client/src/routes/AppRoutes.tsx`
- `client/test/operations-flow.mjs`

Added:

- `docs/service-analytics.md`
- `server/src/analytics/analytics.controller.ts`
- `server/src/analytics/analytics.dto.ts`
- `server/src/analytics/analytics.module.ts`
- `server/src/analytics/analytics.query.ts`
- `server/src/analytics/analytics.service.ts`
- `server/src/analytics/analytics.service.spec.ts`
- `server/test/analytics.e2e-spec.ts`
- `client/src/analytics.css`
- `client/src/pages/AnalyticsPage.tsx`
- `client/src/services/analytics.service.ts`
- `client/src/types/analytics.ts`
- `client/test/analytics-browser.mjs`

Branch: `development`. Starting tree was clean. Final phase: 7 tracked files
modified and 13 new files, all unstaged; no commit or push. No manifests,
lockfiles, environment secrets, ticket authorization/lifecycle files or migrations
changed. Earlier dated status entries are preserved.
