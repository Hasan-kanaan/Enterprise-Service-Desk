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
| A (resolved in stream phase) | Ticket messages/internal notes, ticket history and its cycle subtasks | Database keyset pages; bounded cycle labels and a shared subtask projection budget. See below. |
| B | Ticket/message/note attachments | At most five files at parent creation; no append-upload API. Metadata stays with its bounded parent. No separate pagination. |

No separate unrestricted employee lookup is needed. No change to mutation authorization,
historical/current access rules, or lifecycle behavior. Existing single-column Ticket
indexes support filtering but not ordered continuation; inspect composite replacements.
Search will be literal case-insensitive substring matching on already displayed fields,
with exact numeric ticket references and strict input/cursor validation. Immutable
createdAt/id tuple order for ticket/subtask queues, id order for directory/members.

## Implementation and measured limits

All class A application collections above now have bounded database responses;
the formerly deferred subject streams are now bounded as described below. No authorization
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

## Ticket-scoped stream stabilization (2026-09-26)

The exact unbounded reads were `TicketCommunicationService.read`'s message/note
`findMany`, its independent all-cycle label query, and
`TicketVisibilityService.history`'s all-cycle and all-authorized-subtask queries.
Ticket detail, workspace and mutation context already select only the latest
cycle (`take: 1`); none embeds a lifetime conversation. Attachment metadata is
limited by the existing five-file parent-creation limit, with no upload-append
route. Downloads, redaction, storage and parent authorization are unchanged.

* `GET /tickets/:ticketId/messages` and `/internal-notes`: default 25, maximum
  100; validated opaque `cursor`; database order `(createdAt DESC, id DESC)`.
  A strict older-than boundary and one lookahead row determine continuation,
  without COUNT. `records` in each page are returned chronologically; `cycles`
  contains only labels referenced by that page plus the current cycle (at most
  limit + 1). `hasMore` and `nextCursor` describe the record stream, not cycles.
* `GET /tickets/:ticketId/history`: same sizes and envelope metadata, newest
  sequence first. `(ticketId, sequenceNumber)` is unique, so sequence alone is
  already a total order within the authorized ticket; the existing ID-form
  opaque cursor encodes this sequence. Current cycle is selected separately,
  never inferred from the first row of an older page.
* History embeds at most **25 authorized subtasks in total**, across its loaded
  cycles, ordered by `(createdAt DESC, id DESC)`. Every cycle receives the shared
  `subtasksNextCursor` when more records exist. `subtasksHasMore` is deliberately
  conservative: an individual cycle can have zero further records. The UI says
  more authorized subtasks *may* be available. All records newer than the shared
  boundary have already been included, so continuing within any cycle is safe.
* `GET /tickets/:ticketId/history/:cycleId/subtasks` independently continues that
  cycle, default 25 / maximum 100, with completedBy and the existing immutable
  historical projection. Both current parent access and subtask predicates are
  enforced before the database limit. No automatic per-cycle HTTP requests.

Authorization still uses the existing parent visibility/support predicates in
a per-request repeatable-read transaction. Pages do not share a snapshot. An
insert between requests can appear on refresh without disturbing an older-page
boundary. Deleted records retain their position and redacted tombstones.

The UI starts with recent communication, groups only loaded records, explains
partial old cycles, and offers Load older controls with loading/error/end states.
Drafts and selected files survive paging. Successful writes merge their returned
record locally; requester status refreshes without unmounting communication.
Seed/revision checks exclude stale older responses after refresh or mutation.
History and current-cycle subtasks have independent continuation controls.

Migration `20260926180000_communication_keyset_indexes` replaces the two
`(ticketId, id)` message/note indexes with `(ticketId, createdAt, id)`.
No cycle/subtask index was added: existing cycle-sequence uniqueness and
subtask cycle/ticket indexes support these predicates.

The isolated `eds_stabilization_test` fixture contains one ticket, six users,
61 cycles, 1,201 messages, 601 notes, 671 subtasks and two attachment metadata
records. The current cycle alone contains 121 messages, 61 notes and 71 tasks,
so a cycle demonstrably exceeds a page. Timestamps deliberately tie; edited and
deleted records span the stream. The mutation test adds one requester message.
Fixture-owned records are cleaned up; no development data is seeded.

Representative EXPLAIN ANALYZE results on the local test database (ID-projection
queries exercising the actual boundary/order, not end-to-end endpoint timings):

| Query | Execution | Observation |
| --- | --- | --- |
| Messages, newest 26 | 0.038 ms | Backward index-only scan of new ticket/createdAt/id index; 26 rows. |
| Notes, newest 26 | 0.035 ms | Same index pattern; 26 rows. |
| Cycles, sequence < 36, limit 26 | 0.022 ms | Backward existing ticket/sequence unique index scan; 26 rows. |
| Current cycle tasks, limit 26 | 0.052 ms | Existing cycle/ticket bitmap scan over 71 live rows, top-N sort (27 kB), 26 returned. |

Authorization, payload/attachment projection and network work are additional
costs. Subtask sorts can grow with cycle size even though responses stay bounded;
this fixture does not justify an additional index or certify production latency.
No millisecond assertions were added.

Remaining boundaries: configuration catalogs (teams, regions, departments,
specialties, tags/categories and ticket scope/tag links) remain intentionally
unpaginated. Attachment arrays retain their existing application-level five-file
bound. Explicitly loading every page can grow browser memory; initial/individual
responses never grow with lifetime communication or work history. No remaining
unbounded lifetime communication/cycle/subtask response is intentionally retained.
