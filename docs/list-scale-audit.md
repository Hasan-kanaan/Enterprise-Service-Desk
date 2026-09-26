# List/read scale audit (before implementation, 2026-09-26)

The working tree already contains the auto-close/stability baseline. Preserve it.

| Class | Endpoint / consumer | Finding and decision |
| --- | --- | --- |
| A | GET /tickets; Employee requests/dashboard; Manager intake/owned; Agent primary/collaboration; Team Lead queue | Unbounded findMany followed by React filters and counts. Apply existing visibility AND queue/search/filter predicates before keyset limit. Use separate scoped counts for dashboard summaries. |
| A | GET /tickets/subtasks and /tickets/:ticketId/subtasks | Unbounded authorized subtask reads. Paginate both; retain current-work predicate and subtask-only projection. |
| A | GET /users; Accounts | Entire company directory. Paginate/search/filter with unchanged admin guards and projection. |
| A | GET /organization/teams embedded members; Organization detail | Team catalog itself is configuration; embedded members are unbounded. Remove expansion; add scoped member pagination/search. |
| A | GET /ticket-workspace/tickets/:id and /subtasks/:id | Expands every eligible team member and every active Manager. Replace user expansions with purpose-specific bounded lookup, checked against existing policy and team routing. Team catalog remains. |
| A | Organization member/lead/manager selectors | Loads /users globally and filters in React. Replace with admin-only purpose/team lookup applying existing eligibility. |
| B | /ticket-options; /organization/regions, departments, specialties; team catalog; /ticket-workspace ledTeams | Configuration catalogs, retain without pagination. TeamManager cardinality is constrained to one, Team Lead to one. |
| C | /notifications, /notifications/unread-count | Recent list already bounded, count query separate. Unchanged. |
| C | /work-history | Existing server pagination. Unchanged. |
| C | Individual ticket/subtask/workspace/profile/setup/download reads | Single subject, preserve visibility. |
| A (deferred by scope) | Ticket messages/internal notes, ticket history and its cycle subtasks, attachments | Subject-scoped streams/history explicitly excluded from this phase. Preserve; document remaining scale boundary. |

No separate unrestricted employee lookup is needed. No change to mutation authorization,
historical/current access rules, or lifecycle behavior. Existing single-column Ticket
indexes support filtering but not ordered continuation; inspect composite replacements.
Search will be literal case-insensitive substring matching on already displayed fields,
with exact numeric ticket references and strict input/cursor validation. Immutable
createdAt/id tuple order for ticket/subtask queues, id order for directory/members.

## Implementation and measured limits

All class A application collections above now have bounded database responses;
the explicitly deferred subject streams remain as recorded. No authorization
policy or mutation rule changed. See the README's endpoint/filter table.

Migration `20260926120000_list_keyset_indexes` replaces five existing Ticket
filter indexes with `(filter..., createdAt, id)` composites and adds the general
ticket order and User role/status/id indexes. Existing TeamMember composite keys,
Subtask assignment keys and work-cycle keys already support relationship lookup.
No extra text-search index or speculative per-filter index was added.

On the isolated PostgreSQL 17 database, an optional 2,071-user / 12,001-ticket /
2,000-subtask fixture captured actual Prisma SQL and bound parameters, refreshed
table statistics, then ran EXPLAIN (ANALYZE, BUFFERS). Representative first-page
database execution times (warm local database, no timing assertions):

| Query | Observed execution | Plan observation |
| --- | --- | --- |
| Employee own requests | 0.059 ms | Backward general ticket-order index scan; this fixture's requester owns most tickets. |
| Agent primary queue | 0.223 ms | Assignment ordering index with relationship checks; 26 returned rows. |
| Manager NEW intake | 0.527 ms | Ordered index scan with visibility/status filtering. |
| Manager owned queue | 0.035 ms | Backward Manager/createdAt/id index scan. |
| Directory, role/status | 0.025 ms | Backward user primary-key scan; AGENT is common in this fixture. |
| Directory, role/status + substring | 0.032 ms | Backward user primary-key scan and literal substring filtering. |
| Agent collaboration | 12.222 ms | Ordered ticket scan with subtask/current-cycle joins and filters; substantially more work than a direct ownership queue. |

PostgreSQL chooses indexes based on distribution, not merely availability. An
earlier run before refreshing statistics used top-N sorts for primary/collaboration
queues and a sequential user scan. Plans and timings will differ with production
selectivity, text searches, cache state and data size. These measurements justify
retaining the existing relationship indexes and document the collaboration and
substring-search boundaries; they do not certify 500,000-user performance.

The default fixture has 128 users, 343 tickets and 57 subtasks and is removed after
the suite. Optional large-fixture setup/cleanup is also prefix-scoped, including
partial setup failures, and never seeds the development database. Main browser
fixtures exercise 61-row collections, bounded people lookups, cursor resets,
stale responses, URL reload/back/forward and responsive layouts.
