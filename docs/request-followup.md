# Requester follow-up verification (2026-10-16)

Implemented ISS-047, ISS-049, ISS-050, ISS-051, ISS-052 and ISS-053.

## Behavior and contract

- Tags explain optional descriptive/organizational labels and explicitly disclaim
  access/work authority. Priority explains requester urgency/impact and recommends
  Medium for most requests. LOW/MEDIUM/HIGH/CRITICAL and MEDIUM default remain.
- The file picker keeps the native multiple-file input keyboard-operable over a
  styled Choose files label, hides its misleading native text, shows a live selected
  count, and preserves filenames/sizes/removal. Focus uses the shared theme ring.
  Five files, 10 MiB each, existing type screening, backend validation, original
  attachment immutability and private downloads are unchanged.
- requestDraftSlice stores only non-file form values and an actual submission
  attempt's idempotency key in application memory. signedOut clears it, changed
  signed-in identity resets it, and same-user refresh preserves it. Success clears
  it. Owner checks reject late draft writes after logout/account replacement.
  No browser storage or File persistence is introduced. Full reload may discard it.
  Restored submissions keep their key; users must reselect original files for a
  matching multipart retry. Server content hashes still reject incompatible retries.
- GET /ticket-options adds only the authenticated caller's requesterDefaults with
  nullable regionId/departmentId. The form intersects IDs with active option lists.
  Null/missing/archived homes produce no fabricated selection; drafts override home
  defaults, and all scope controls remain editable. AuthUser/session claims and
  directory access are unchanged. No schema change is required.
- Requester metadata authority allows NEW/ASSIGNED only. IN_PROGRESS,
  WAITING_FOR_EMPLOYEE and BLOCKED return a 409 with conversation guidance.
  RESOLVED/CLOSED/CANCELLED retain the terminal freeze. All partial metadata writes
  pass the same check after Ticket FOR UPDATE/current read inside Serializable.
  A current-state HTTP test reads ASSIGNED, starts work through the Agent endpoint,
  then proves stale metadata rejection and unchanged stored values.
- Independently authorized primary Agents, Team Leads and responsible Managers keep
  metadata authority, including when separately supporting their own requests.
  Operational edit hints reuse the policy. Administrative roles gain no support
  authority. Requester detail hides editing after work starts and links conversation;
  stale rejection locks the retained unsaved form until explicit reload so text can
  be copied. No automatic retry/message conversion occurs.
- Conversation permissions, WAITING_FOR_EMPLOYEE requester-message transition to
  IN_PROGRESS, cancellation/reopening, history, notifications and routing remain.

## Checks actually run

All final checks passed:

| Command (repository root unless specified) | Result |
| --- | --- |
| pnpm.cmd --dir server lint | Pass |
| pnpm.cmd --dir server typecheck | Pass |
| pnpm.cmd --dir server build | Pass |
| pnpm.cmd --dir server test --runInBand ticket-authorization.service.spec.ts ticket-lifecycle.spec.ts | 2 suites, 44 tests pass |
| pnpm.cmd --dir server test:e2e --runInBand tickets-authorization.e2e-spec.ts | 125 PostgreSQL/HTTP tests pass |
| pnpm.cmd --dir client lint | Pass |
| pnpm.cmd --dir client build | TypeScript/Vite pass |
| node client/test/employee-flow.mjs --request-followup | Pass |
| node client/test/employee-flow.mjs --ticket-configuration | Pass |
| node client/test/employee-flow.mjs | Pass |
| node client/test/operations-flow.mjs | Pass |
| node client/test/session-flow.mjs | Pass |
| git diff --check | Pass |

PostgreSQL used explicitly configured TEST_DATABASE_URL pointing to the existing
isolated eds_stabilization_test database. No development database changes, migration
commands, Prisma schema edits or generator runs were needed. The existing Batch 8A
migration is untouched. Existing expected fault-injection server logs and Node/pg
warnings appeared during the passing e2e suite.

Browser tests use isolated API fixtures. New coverage includes all draft selections,
non-restored files, submission clearing and idempotent navigation retry; active/null/
missing home defaults; picker count/removal/reselection/multiple/limits/types, native
keyboard file-dialog event, mobile/light/dark layout; every requester lifecycle
state and stale rejection. Existing requester flow covers valid multipart uploads
and waiting replies; operations covers support metadata. Session flow verifies
same-user refresh preservation, actual logout and rejection clearing across tabs,
and different-account reset via the real Redux signedIn action (not a second-account
UI login). No live browser-to-database or real assistive technology test is claimed.

Initial server typecheck/lint and one e2e assertion exposed old test assumptions
about all options values being catalog arrays; updated for requesterDefaults and
reran successfully. Sandboxed Chromium timed out before Page.enable; permitted
execution passed. One session attempt ended in temporary-profile EPERM cleanup;
rerun passed. Keyboard dialog assertions initially ran in a background tab;
Page.bringToFront and awaiting event delivery made the check deterministic.
No full repository suite, Firefox/Safari or manual screen-reader audit was run.

## Exact files changed

- client/src/components/Attachments.tsx
- client/src/components/TicketForm.tsx
- client/src/pages/CreateTicketPage.tsx
- client/src/pages/EmployeeTicketPage.tsx
- client/src/store/requestDraftSlice.ts (new)
- client/src/store/store.ts
- client/src/tickets.css
- client/src/types/tickets.ts
- client/test/employee-flow.mjs
- client/test/request-followup.mjs (new)
- client/test/session-flow.mjs
- server/src/tickets/ticket-authorization.service.ts
- server/src/tickets/ticket-authorization.service.spec.ts
- server/src/tickets/ticket-options.controller.ts
- server/test/tickets-authorization.e2e-spec.ts
- docs/decision.md
- docs/frontend-polish.md
- docs/request-followup.md (new)
- status.md

The new decision records the durable business rule without rewriting dated history.
Status clarifies prior batches are in da04bbd, matching locally recorded
origin/development, and role-testing account seeding is not active development;
manual Mailpit activation is sufficient. This batch remains uncommitted/unpushed:
16 modified tracked files and three new files. No unrelated user changes existed
at the starting checkpoint. Manager statistics/dashboard, AI, MFA, deployment,
generic audit/version history, storage/scanning, durable drafts and new notification
types remain excluded; final comprehensive repository verification remains deferred.
