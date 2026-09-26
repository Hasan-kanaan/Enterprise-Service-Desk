# Project Decisions

## Product

We are building an Enterprise IT Service Desk for internal company support. AI assistance is planned after the non-AI workflow is functional.

## Account Provisioning and Role Hierarchy

We use admin-provisioned accounts only. There is no public registration, and users cannot choose their own roles.

All people in the system are represented by one `User` model. Roles are permissions assigned to that model, not separate entities.

The five roles are:

- `SUPER_ADMIN`
- `ADMIN`
- `MANAGER`
- `AGENT`
- `EMPLOYEE`

### Role Definitions

#### SUPER_ADMIN

- Highest-level system administrator.
- Created only during the initial application bootstrap/setup.
- Can create and manage `ADMIN`, `MANAGER`, `AGENT`, and `EMPLOYEE` accounts.
- Can perform system-level administration.
- Cannot create another `SUPER_ADMIN`.
- Has no service-desk ticket, subtask, or future internal-note authority.

#### ADMIN

- Organization/system administrator.
- Created by a `SUPER_ADMIN`.
- Can create and manage `EMPLOYEE`, `AGENT`, and `MANAGER` accounts.
- Handles user administration and organization-level system configuration.
- Cannot create `SUPER_ADMIN` or `ADMIN` accounts.
- Has no service-desk ticket, subtask, or future internal-note authority.

#### MANAGER

- Service-desk manager, not a system administrator.
- Oversees service-desk operations, agents, assignments, escalations, and workflows.
- Sees shared unowned NEW intake and tickets explicitly assigned to them as responsible manager.
- AI recommendation review remains planned.

#### AGENT

- IT/service-desk support staff.
- Works on assigned tickets, communicates with employees, moves tickets through the support workflow, and resolves tickets.

#### EMPLOYEE

- Internal company employee and ticket requester.
- Creates and follows their own tickets, responds to support requests, and closes resolved tickets.

### Provisioning Lifecycle

Fresh installations use a one-time bootstrap flow:

```text
No SUPER_ADMIN exists
	↓
Initial setup
	↓
Create first SUPER_ADMIN
	↓
Setup completed
	↓
Normal login and application use
```

After bootstrap, SUPER_ADMIN may provision ADMIN/MANAGER/AGENT/EMPLOYEE; ADMIN may provision MANAGER/AGENT/EMPLOYEE. The delegation hierarchy is:

```text
SUPER_ADMIN
      │
      └── creates ADMIN accounts

ADMIN
      │
      ├── creates EMPLOYEE accounts
      ├── creates AGENT accounts
      └── creates MANAGER accounts
```

The initial setup endpoint must become unavailable after the first `SUPER_ADMIN` exists. Account-creation endpoints must require authentication and server-side RBAC. The client is never trusted to select a privileged role.

Initial setup uses a PostgreSQL advisory transaction lock and password hashing. Setup is unavailable while a SUPER_ADMIN exists; there is no separate permanent setup-completed record.

### Decision Rationale

This application represents an internal enterprise service desk rather than a public SaaS application. Accounts represent members of an organization and should therefore be provisioned by authorized administrators rather than freely self-created.

This model provides a clear privilege hierarchy and prevents public users from selecting privileged roles.

## User Model

All people in the system are represented by one `User` model.

Roles:
- SUPER_ADMIN
- EMPLOYEE
- AGENT
- MANAGER
- ADMIN

Reason:
This keeps authentication, permissions, and user management simpler than creating separate Employee, Agent, and Manager tables.

## Ticket Statuses

Tickets use the following lifecycle:

- NEW
- ASSIGNED
- IN_PROGRESS
- WAITING_FOR_EMPLOYEE
- BLOCKED
- RESOLVED
- CLOSED
- CANCELLED

`WAITING_FOR_EMPLOYEE` means support is waiting for requester information or action. `BLOCKED` means work cannot proceed because of a dependency or blocker; these statuses are distinct.

Directly assigned agents, primary-team leads, and the responsible manager may resolve operational tickets. The employee requester or responsible manager may close a resolved ticket. Resolving sets `resolvedAt`; closing preserves it and sets `closedAt`.

Manager assignment/transfer does not change status. First primary-team assignment moves NEW to ASSIGNED; an individual agent is optional. Reassignment preserves ASSIGNED, IN_PROGRESS, WAITING_FOR_EMPLOYEE, and BLOCKED. RESOLVED/CLOSED/CANCELLED reject metadata edits, manager transfer, team/agent reassignment, and every subtask mutation. Ownership changes never reset resolution/closure timestamps. NEW -> ASSIGNED cannot be invoked through the status endpoint.

Cancellation is an explicit employee-requester operation from NEW or ASSIGNED only. CANCELLED is permanent and cannot reopen. Nothing is deleted. RESOLVED -> CLOSED remains an explicit lifecycle action by the requester/responsible manager; closure does not unlock ordinary edits.

Reopening is an explicit operation, not a TicketStatus. The requester or current responsible MANAGER may reopen RESOLVED/CLOSED with a nonempty requester-visible reason. Agents, Team Leads, ADMIN, and SUPER_ADMIN cannot reopen merely through their roles/responsibilities. There is no time limit. Normal reopening preserves eligible ownership and sets IN_PROGRESS. Ticket resolvedAt/closedAt clear; previous cycle timestamps remain.

An inactive or absent historical manager causes NEW with manager/team/agent all NULL, returning to shared intake. With an active manager and valid team, an inactive historical agent is automatically cleared while retaining manager/team and IN_PROGRESS. No replacement is selected. Other invalid legacy routing requires explicit returnToIntake: true; valid routing cannot use that flag as a discretionary reset.


## Assignment Workflow

Employee creation produces NEW with `assignedManagerId`, `assignedTeamId`, and `assignedAgentId` all NULL. All ACTIVE MANAGER users may read NEW tickets without a responsible manager and assign themselves or another real ACTIVE MANAGER. Intake visibility alone does not permit general edits, status operations, team assignment, or subtask management.

Once assigned, only the responsible manager has manager-level authority. Their eligible primary teams are teams organizationally managed by them through TeamManager and teams with GLOBAL coverage. Another manager's regional team remains forbidden even when its region or specialty matches the ticket; regional teams without organizational management are also ineligible. GLOBAL describes team coverage, not a special Agent role or absence of organizational management. This approved rule corrects the earlier implementation and documentation that allowed any real primary team.

Responsible-manager transfer remains an explicit operation. It preserves the primary team, agent, status, timestamps and all organizational TeamManager relationships. Existing assignments remain after transfer; subsequent primary-assignment writes, including agent-only changes, must use a team eligible for the new responsible manager. Team Lead within-team powers remain independent of this Manager routing restriction. Clearing the responsible manager or primary team is unsupported. Ordinary assignment cannot clear manager/team. The only intake returns are the documented special reopen and administrative manager-offboarding operations.

Team Leads may change the primary agent only within the ticket's currently led primary team. They cannot change the manager or primary team. Ordinary primary agents cannot reassign ownership.

Ticket and subtask mutations lock their parent Ticket row in a serializable transaction, recheck authorization there, and write within that transaction. Manager assignment additionally uses a conditional ownership/status update. Serialization conflicts return 409; callers must reload and explicitly retry, with no automatic conversion of stale claims into transfers.

There is no AI, category, regional, or automatic routing, and no additional triage role. AI suggestions/review are future work.

## Organization and Team Management

The five roles remain exactly `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `AGENT`, and `EMPLOYEE`. Team Lead is not a role. It is an optional operational responsibility assigned to an existing `AGENT`.

`Region`, `Department`, `Specialty`, `Team`, and `Ticket` are separate concepts. Users may have nullable home region and department values. Departments are not tied to regions, and an agent's home region does not automatically restrict team membership.

Teams use one of two scopes:

- `REGION`: exactly one region.
- `GLOBAL`: all regions, with no fake global region record.

A team has at most one manager and may have zero or one Team Lead. A manager may manage multiple teams. An agent may belong to multiple teams and may be Team Lead of at most one team at a time. `TeamManager` records organizational responsibility; it is independent of ticket responsibility and grants no ticket visibility or mutation authority by itself. For an already responsible Manager, it determines regional primary-team eligibility.

Teams may have multiple specialties. Team membership, specialty membership, and home region are independent relationships.

## Authorization Design

Server-side guards and policies protect the implemented ticket APIs. Read restrictions are part of Prisma queries, not client-side filters.

| Role | Ticket visibility |
| --- | --- |
| EMPLOYEE | Own requested tickets |
| AGENT | Direct primary-agent assignments plus current unfinished-cycle subtask collaboration |
| AGENT acting as Team Lead | Those relationships plus tickets assigned to their currently led team |
| MANAGER | NEW with NULL assignedManagerId, plus tickets with assignedManagerId equal to caller ID |
| ADMIN / SUPER_ADMIN | None |

Ordinary membership, home region/department, specialty, affected scope, REGION/GLOBAL scope, and TeamManager never independently grant visibility. An AGENT assigned to any subtask in the current unfinished cycle is a ticket collaborator, even after that subtask completes. Reassignment of their last current-cycle subtask or ending the cycle removes this derived access. Previous-cycle assignment never grants current parent access. A collaborator can read the parent/history and participate in communication, but gains no metadata, routing, overall status, resolve/close/reopen, manager-transfer, or arbitrary subtask powers. Existing independently held powers remain unchanged.

ADMIN and SUPER_ADMIN retain their existing account and organization administrative capabilities. System administration is separate from service-desk operations. Operational managers and leads do not gain organization-administration powers.

## Ticket Ownership and Scope

A ticket has independently nullable responsible-manager, primary-team, and primary-agent references. The responsible manager is an explicit User relationship, never derived from TeamManager. An agent requires a team and must be an ACTIVE AGENT member of it; a team without an agent is valid.

Primary-agent responsibility is never derived from subtasks. A primary agent needs no subtask, and collaboration does not set or replace assignedAgentId. A routed ticket may have no primary agent while other agents collaborate through subtasks.

The assignedManager relationship uses `onDelete: Restrict`. Manager deletion cannot silently clear ticket responsibility. Existing tickets receive NULL on migration without inference or backfill. Existing non-NEW managerless development rows require explicit fixture/data reconciliation outside the ordinary claim endpoint; no production inference mechanism is added.

Affected regions/departments describe impact, separately from the requester's home organization and ticket ownership. They do not grant access or select default routing. No `defaultOperationalRegion` or routing configuration is implemented.

## Subtasks

Subtasks do not nest. They may have nullable team/agent references and use TODO, IN_PROGRESS, COMPLETED, CANCELLED.

| Actor | Read/work | Assignment and creation |
| --- | --- | --- |
| EMPLOYEE | None | None |
| Direct subtask AGENT | Their specific subtask | None |
| Primary parent AGENT | No extra access | None |
| Subtask team's Team Lead | Subtasks assigned to their currently led team | Change/clear agents within that team; no team moves/clearing |
| Responsible MANAGER | All subtasks under their ticket | Create, assign, clear subtask ownership, and delegate across real teams |
| Other MANAGER / TeamManager | No extra access | None |
| ADMIN / SUPER_ADMIN | None | None |

Team Leads may create subtasks only when the parent primary team is their currently led team, and must explicitly assign the new subtask to that same team. No default team is inferred. Responsible managers may create genuinely unassigned subtasks.

Subtask-only responses contain the subtask's fields and parent ID, not parent content, requester information, conversations, or notes. Completing/reopening a subtask does not change the parent. RESOLVED/CLOSED/CANCELLED parents reject all subtask creation, editing, status changes, and assignment changes. Subtasks from an earlier cycle remain permanently frozen after the ticket reopens, including incomplete subtasks; their truthful status is preserved. Subtask statuses have no additional transition graph yet.

## Conversations and Internal Notes

TicketMessage and TicketInternalNote are separate cycle-bound models and API streams. Both store ticketId, createdInCycleId, authorId, content, createdAt, nullable editedAt/deletedAt, and a UUID clientRequestId. A composite FK enforces same-ticket cycle membership. Restrictive historical FKs retain attribution after deactivation. There is no backfill content or fabricated author. Content is trimmed plain text, 1–4000 characters; rendering escapes it.

Conversation reads use current ticket visibility. Requesters can read/post public messages only. Primary agents, current collaborators, leads of the primary team, and responsible managers can read/post messages and read/add notes. Intake-only managers can read public conversation but must claim responsibility before posting or accessing notes. ADMIN/SUPER_ADMIN have neither stream. Historical authorship, ordinary membership and TeamManager grant no access. Current authorized support can read older-cycle communication, including notes; subtask-only historical readers cannot.

Authors alone may edit their own records in the current unfinished cycle while still authorized. Edits change content/editedAt only; author, createdAt and cycle never move. All RESOLVED/CLOSED/CANCELLED communication is read-only. Reopening starts another cycle; old records remain frozen. The previous no-deletion decision is superseded: authors may soft-delete their own currently authorized current unfinished-cycle records. Deleted records retain attribution/time/cycle metadata but expose null content and cannot be edited or restored. Revision lists and generic audit remain unimplemented. Corrections to frozen records require a new current-cycle record.

Only a NEW message from the requesting EMPLOYEE while WAITING_FOR_EMPLOYEE changes status to IN_PROGRESS. Insertion and transition are atomic. Support messages, notes, edits, soft deletion and idempotent replay never change status. Deletion never reverses the waiting reply transition or creates/retracts notifications. Other lifecycle transitions remain explicit.

GET/POST /tickets/:ticketId/messages and /internal-notes are separate guarded endpoints; PATCH adds /:recordId. Writes require expectedCycleId; creation also requires clientRequestId. The server chooses author/current cycle. Records are ordered by ascending ID within their stream; cycles descend by sequence. UTC createdAt is assigned after locking and editedAt records the latest edit. A private creationHash fingerprints the original normalized creation request for duplicate detection even after author edits; it is not content history and is never returned. Request keys are unique per author within each stream. Recovery rechecks current authorization and rejects key reuse with different content. A replay can return an existing readable record after its cycle ends without performing a write.

Writes reuse serializable parent-ticket/user locks and active-session validation. AGENT writes also lock their ticket subtask assignments and the primary team, preventing a snapshot taken before lock acquisition from authorizing after reassignment or lead removal. Conflicts require explicit reload/review. Reads authorize and load cycles/records in one RepeatableRead snapshot. Note data never enters public ticket/history, employee communication, administration or standalone subtask responses.

The shared frontend groups messages and notes by cycle, labels notes support-only, exposes author-only current-cycle editing, and shows edited timestamps. Sibling drafts survive communication refreshes; recoverable submission failures retain text and creation keys. Stale-cycle drafts require explicit review before creating a record in the new cycle. The employee waiting prompt directs the requester to the conversation. No real-time transport is introduced.

Employee and operational Manager/Agent/Team Lead ticket workflows and persistent in-app notifications are implemented. My Work History is implemented. The remaining roadmap, in order, is automatic RESOLVED -> CLOSED behavior, general polish/stabilization, and AI routing/recommendations. Generic audit infrastructure and optional enterprise features such as SSO/SCIM remain deferred.

## NULL and Data Integrity

NULL means unknown, unassigned, or not applicable. No fake/default entity or first-created record may replace it. Friendly labels belong only in the UI.

PATCH semantics: omitted preserves; explicit NULL requests clearing a nullable field; real ID assigns that entity. Authorization validates the exact final state persisted. Clearing manager or primary team is rejected as an unsupported operation, never treated as omission.

Changing team with an incompatible retained agent is rejected unless the request explicitly clears the agent or supplies an eligible replacement (Option A). No silent clearing. Subtask team clearing requires an explicitly cleared agent when one exists. Non-nullable metadata fields reject NULL.

## Active Accounts and Administrative Offboarding

Users have ACTIVE/INACTIVE status. No application endpoint physically deletes users or tickets. SUPER_ADMIN may activate/deactivate ADMIN, MANAGER, AGENT, and EMPLOYEE. ADMIN may activate/deactivate MANAGER, AGENT, and EMPLOYEE. Operational roles have no lifecycle authority. SUPER_ADMIN deactivation is excluded; bootstrap remains unavailable while any SUPER_ADMIN exists.

Deactivation is atomic offboarding, not a blocker-based transfer workflow. For active tickets (NEW, ASSIGNED, IN_PROGRESS, WAITING_FOR_EMPLOYEE, BLOCKED) owned by the target manager, reset status to NEW and manager/team/agent to NULL. For active primary-agent assignments, clear only that agent. Clear the agent only on target-assigned TODO/IN_PROGRESS subtasks in the current operational cycle. Remove the target's Team Lead and TeamManager responsibilities. Do not select replacements. Ordinary membership, requester identity, terminal ownership, completed/cancelled subtasks, and previous-cycle work remain unchanged.

Offboarding does not create a work cycle: it removes current responsibility within the same unfinished attempt. The administrative response contains only user ID/status. ADMIN/SUPER_ADMIN still cannot read ticket contents, browse history, choose replacement support staff, or perform ordinary ticket operations.

Login and refresh require ACTIVE. Access-token validation loads the current user and role from PostgreSQL. Deactivation increments sessionVersion and revokes outstanding refresh tokens in the same transaction. Reactivation never restores old tokens. Legacy JWTs without a version are accepted only while the user's version is zero. Refresh consumption and replacement issuance are atomic. New ticket/subtask assignments, team membership, Team Lead, and TeamManager responsibility require an active eligible target. Guarded operational writes recheck actor status/version inside their transaction.

## Work Cycles and History

Ticket remains current operational state. TicketWorkCycle stores one ORIGINAL attempt and each explicit REOPENED attempt, uniquely ordered by (ticketId, sequenceNumber). The greatest sequence is current; there is no Ticket.currentCycleId. Creation and reopening atomically create the corresponding cycle.

Resolution/cancellation ends operational work and captures ownership IDs once. A resolved cycle's endedAt represents its resolution timestamp. Closing adds closedAt/closedById and changes outcome to CLOSED without creating another cycle or rewriting ending ownership. Reopening never modifies previous-cycle work. Resolution summaries and reopening reasons are requester-visible; they are not internal notes.

History uses ending ownership for ended cycles and current Ticket ownership for the current unfinished cycle. These snapshots mean responsibility at the end, not every person who ever participated. Subtasks retain their own attribution; nullable completedById records the actual actor on entering COMPLETED. Reopening a current-cycle subtask clears current completion time/actor. Legacy completion actors stay NULL. No participant ledger or assignment event stream is introduced.

Subtask.createdInCycleId is required, immutable, and constrained to a cycle of the same ticket. Clients cannot select or move the cycle. Earlier-cycle TODO/IN_PROGRESS subtasks are historical and never silently cancelled or made actionable. Messages and internal notes now use the same cycle boundary.

GET /tickets/:ticketId returns current state, scope/tag IDs, ownership summaries, and currentCycle. GET /tickets/:ticketId/history returns cycles newest first with identity, sequence, type, reason, timestamps, outcome, ownership basis, actors, and independently authorized subtasks. isCurrent is based on sequence; isEnded is based on outcome, so unknown legacy timestamps are valid. React can label sequence 1 as Original Investigation and sequences 2+ as Reopening #1, #2, etc.

Full history requires current ticket visibility; historical participation grants no additional ticket authority. EMPLOYEE receives public cycle fields and no support subtasks. Agents/leads receive only subtasks permitted by the existing separate subtask predicate. Current responsible managers receive all their ticket's subtasks. Intake-only managers receive public cycle history but no subtasks. Responses mark subtasksAccess as NONE/FILTERED/ALL. Subtask-only reads never include parent content or cycle history. ADMIN/SUPER_ADMIN remain excluded. History reads use a consistent database snapshot.

GET /tickets?active=true restricts the existing visibility predicate to operational statuses; status=RESOLVED (or another real status) adds an exact filter. GET /tickets/subtasks?currentWork=true and its per-ticket equivalent return only authorized incomplete subtasks from unfinished cycles under operational parents. Unfiltered subtask reads preserve existing limited historical access.

## Concurrency and Migration

Ticket/subtask/reopen/cancel writes reuse parent Ticket FOR UPDATE and Serializable transactions. Active-user/assignment checks lock user rows inside the write transaction. Administrative offboarding locks the actor/target users and affected tickets; organization responsibility creation and refresh issuance also use Serializable transactions and user locks. Serialization failures/deadlocks produce 409 with no partial writes and no automatic business-operation retry. Callers reload and explicitly retry the same requested operation. If assignment commits first, a successful offboarding retry clears it; if deactivation commits first, new assignment is rejected. No successful offboarding leaves the inactive target holding current actionable responsibility.

Migration 20260918120000_user_lifecycle_work_cycles adds account lifecycle, CANCELLED, cycles, and subtask cycle/completer references. Existing users become ACTIVE with sessionVersion 0. Each existing ticket receives exactly one ORIGINAL cycle starting at its known createdAt. Known resolvedAt/closedAt are copied without guessing missing times or actors. Existing terminal ownership is labeled RECORDED_AT_MIGRATION, with actual capture time; it is not falsely asserted to be ownership at resolution. All existing subtasks attach to the initial cycle without changing their work data. Same-ticket and required-cycle constraints apply after backfill. New historical references restrict deletion; unrelated existing SET NULL relationships are unchanged.

Deploy with application writes paused while applying the migration and switching backend versions. Old writers cannot create valid subtasks after the new required cycle field is installed. Migration tests replay all previous SQL in a private schema inside the explicitly configured test database, verify backfill and constraints, and roll the schema back.

## Frontend Structure

The frontend uses a classic structure:

- components/
- pages/
- hooks/
- services/
- types/

Reason:
This is simpler and easier to understand while learning React TypeScript.

## Employee Frontend Foundation

Retain the existing React/TypeScript/Vite, Redux, Axios, React Hook Form, Tailwind, and CSS stack. No new dependencies or database changes are required. Shared typed API services, abortable resource loading, status/cycle presentation helpers, forms, confirmation dialogs, and public history components support the employee routes. The initial frontend used local ticket filtering and counts. The 2026-09-26 enterprise-list phase below supersedes that choice with server pagination/search and separate scoped summary counts.

Employee ticket routes are gated by role for navigation and usability; backend authorization remains the security boundary. ADMIN/SUPER_ADMIN receive no ticket navigation or ticket authority. Manager/Agent/Team Lead ticket pages use the operational workspace described below. Current ticket data and work-cycle history load separately from their existing endpoints. History renders server-provided ownership snapshots, reasons, resolutions, and nullable timestamps without deriving old owners from current assignments. The employee UI neither requests nor models support subtasks or internal notes.

Use explicit cancel, close, and reopen actions with confirmations. Reopening requires a reason; invalid legacy routing can be retried only after explicitly choosing the backend's returnToIntake recovery. A standard 409 locks stale submission and offers reload before retry. RESOLVED/CLOSED/CANCELLED hide ordinary metadata editing. The UI never changes ownership or reopens through an edit endpoint.

The existing backend lacked a catalog usable by employee ticket forms. Add only GET /ticket-options under the operational module: authenticated EMPLOYEE/AGENT/MANAGER can read category/tag/region/department ID/name choices. It exposes no users, memberships, administrative team details, or writes. Existing organization administration permissions remain unchanged. Empty catalogs remain empty; the client never substitutes fabricated records or picks the first entry. A missing category catalog blocks submission.

Keep access tokens in memory, restore through the HttpOnly cookie before protected routing, and synchronize refresh responses into Redux. Share a refresh across concurrent requests, preserve the requested path through sign-in, prevent pending responses from restoring a locally signed-out session, and surface connection failures with retry. Do not persist credentials or tokens in browser storage. Logout waits for a pending refresh before revoking the resulting cookie session.

Browser acceptance checks use native CDP with an installed Chromium browser and isolated API fixtures. They exercise real rendered React pages and HTTP request shapes without adding a test dependency or mutating development data. PostgreSQL-backed backend tests continue to verify actual authorization and lifecycle behavior. This division does not claim browser-to-live-database end-to-end coverage.


## Operational Frontend and Scoped Read Projections

Keep the accepted employee workspace and the existing classic frontend layout. Operational pages reuse ticket forms, rows, badges, dialogs, resource loading, session recovery, and cycle history. The history renderer accepts an optional work renderer; the employee caller supplies none. Support subtask types are separate from the employee response contract.

Manager queues separate unowned NEW intake from current ownership. Agent queues include direct assignments and current collaborators, with a separate led-team queue. The backend supplies isCurrentCollaborator without exposing subtask contents in the ticket list. All lists begin with backend-authorized data; local filters only narrow it. Operational metrics count those actual rows and authorized current incomplete subtasks. Historical participants are never used as queue membership. TeamManager is not consulted.

The operational frontend uses existing write endpoints unchanged. Available ticket/subtask actions are read-only hints computed by the same TicketAuthorizationService methods used by writes. Do not reproduce the status transition graph in frontend code. All writes retain their original transactional rechecks; stale hints never grant access. Standard 409 responses lock the dialog/form until explicit reload. Transfer to another manager navigates back to the owned queue. Assignment dialogs preserve incompatible old agents until the operator explicitly clears/replaces them. No default owners, teams, or agents are invented.

The existing organization APIs are administrative and the raw operational reads lacked Team Lead context, eligible choices, and safe standalone subtask lifecycle information. Add only TicketWorkspaceController with GET /ticket-workspace, /ticket-workspace/tickets/:ticketId, and /ticket-workspace/subtasks/:subtaskId. Require MANAGER/AGENT guards, reuse TicketVisibilityService predicates, and compute permissions from existing policies. Resource reads use RepeatableRead for consistent relationships/options. Existing schemas, mutation services, locks, and role rules are unchanged.

The context endpoint returns only the caller's led teams. The initial ticket pickers returned active MANAGER IDs/usernames only for owned transferable tickets, and real teams with active AGENT member IDs/usernames only for permitted assignment/creation. The enterprise-list phase below replaces embedded people with bounded purpose-specific lookups; team choices and eligibility remain unchanged. The ticket workspace's `teams` field contains only the responsible Manager's organizationally managed teams and GLOBAL teams; separate `subtaskTeams` choices preserve existing cross-team subtask delegation. Team Leads receive only their led primary team; ordinary agents and intake-only managers receive no assignment directory. Frozen tickets receive no assignment choices. Email addresses, passwords, and administrative details beyond the required team/eligible-agent options are not exposed.

Primary assignment enforces the same team predicate server-side within the serializable ticket transaction and locks the destination TeamManager relationship against concurrent removal. Team membership, active status and AGENT-role checks apply equally to regional and GLOBAL primary agents. Subtask assignment, collaborator visibility, conversation and internal-note authorization are unchanged.

The standalone subtask projection retains its independent predicate and contains no parent content. It adds parentVisible, checked within the same snapshot, so current collaborators and other authorized readers can open the normal parent view. Historical subtask-only readers retain their limited projection. Current completed/cancelled subtasks retain existing within-cycle behavior; all prior-cycle subtasks are frozen regardless of status.

Current-cycle subtasks appear separately within ticket detail; authorized earlier work is grouped under its cycle in the shared history view. Agents/leads receive only the existing filtered history projection. Current incomplete subtask queues use the existing currentWork filter; an explicit broader view allows authorized completed/historical records without suggesting they are active assignments. Standalone detail rechecks current read/action availability before exposing edit controls.

Browser suites verify employee, manager, primary agent, collaborator, Team Lead and administration flows with isolated API fixtures. PostgreSQL e2e separately verifies real authorization, atomicity, constraints and controlled races. AI routing/recommendations remain on the roadmap; generic audit infrastructure remains deferred.


## Administration Frontend and Existing Organization Capabilities

The administration workspace is separate from employee/operational routes and reuses the established shell and component styling. ADMIN/SUPER_ADMIN dashboards route to /admin, with accounts and organization navigation only. Operational roles are excluded by frontend route guards and existing backend guards. No administration component requests ticket or support-subtask APIs.

Account management renders the authorized directory, including status and nullable home-organization labels. The existing backend originally limited SUPER_ADMIN creation to ADMIN. The user explicitly approved expanding that one authorization matrix to ADMIN/MANAGER/AGENT/EMPLOYEE. Frontend and backend now agree; ADMIN remains limited to MANAGER/AGENT/EMPLOYEE, and SUPER_ADMIN creation remains bootstrap-only. Unit and HTTP matrix tests verify both positive and negative cases. Account creation reuses protected-request 401 renewal rather than being excluded merely because its URL starts with /auth.

Lifecycle confirmation describes existing administrative offboarding without loading any affected operational records or selecting replacements. Reactivation restores eligibility for fresh login only, not prior sessions/responsibilities. No user deletion UI exists. Status responses remain the existing minimal id/status projection, and the directory is reloaded after success.

Organization implementation is bounded by existing APIs: list/create regions, departments, specialties and teams; add/remove membership; assign/replace/remove Team Lead; assign/remove TeamManager. Team scope is explicit and REGION requires a real region, while GLOBAL submits no regionId. Member pickers contain active AGENT accounts not already in that team. Lead pickers contain active member agents who lead no other team. Manager pickers contain active MANAGER accounts; an existing TeamManager must be explicitly removed before another is assigned. No fake/default records or relationships are used.

GET /users adds only nullable region/department id/name relationships. The initial GET /organization/teams projection included members with userId and user id/username/role/status; the enterprise-list phase below moves this to a dedicated paginated membership read. These are small additions to already administrative reads, not new endpoints, permissions, or a service-desk preview. Existing raw directory sessionVersion is not rendered. Passwords and operational records are not included in the new projections.

Do not expose unsupported organization mutations. Rename/delete of master records and teams, changing existing team coverage, changing specialty links, and account identity/role/home-organization editing lack current APIs. They remain deferred. Membership removal uses its existing backend rule: a Team Lead must first be removed as lead. It does not transfer retained operational assignments. Broader responsibility/membership reconciliation and concurrency rules are not invented in this frontend phase.

Administration dialogs show validation/errors, block repeat submission while pending, and require explicit reload after 403/404/409 before another mutation. Browser coverage uses isolated fixtures for both administrative roles and all exposed organization actions, and verifies no administrative ticket requests. Existing Employee and operational suites remain regression coverage. No new dependencies, schema, migrations, or organization mutation APIs were added.

## Persistent In-App Notifications

Email notifications are intentionally out of scope. The application uses persistent in-app notifications only.

Use one PostgreSQL Notification table and authenticated REST endpoints. Store recipientUserId, enum type, nullable actorUserId/ticketId/subtaskId, createdAt and nullable readAt. References use ON DELETE RESTRICT. Recipient/time and recipient/read indexes support the recent list and count. Migration `20260923150000_in_app_notifications` creates an empty table without historical backfill. No event log, audit system, queue, worker or new dependency is required.

Concrete mutation branches call notification helpers within their existing Serializable transaction. Insertion follows actual assignment/status/subtask/reopen/transfer updates or the first public-message insertion. Failed notification insertion rolls back the domain mutation too. Explicit 409 conflicts remain; no automatic retries. Recipient users are locked/rechecked for ACTIVE status; support-recipient collection locks the primary Team before reading its Lead. Existing parent locks serialize ticket/subtask responsibility changes.

New primary-agent and subtask assignments notify the new assignee. Compare old/resulting agent IDs: unchanged or cleared assignments create nothing; real A -> B -> A changes create distinct events. Explicit transfer to a different responsible Manager notifies only that new Manager. Initial claims and unchanged Manager assignments create nothing. Routing and organizational management are unchanged.

New requester public messages notify active responsible Manager, primary Agent, current primary-team Lead and current-cycle collaborators once each. Completed current-cycle subtasks still establish collaboration. Ordinary membership, ended-cycle assignments, reassigned-away collaborators, historical participation and inactive users do not qualify. Authorized support messages notify the active requester. Edits, internal notes and idempotent recovery return before notification creation. The WAITING requester-message transition remains atomic and unchanged.

Actual transitions to WAITING_FOR_EMPLOYEE and RESOLVED notify the active requester. Employee reopening notifies the post-reopen active Manager, primary Agent and primary-team Lead, deduplicated, with no previous-cycle collaborators. Intake recovery with cleared responsibility has no support recipients; cleared inactive agents receive none. Manager reopening notifies the active requester. No closure, cancellation, offboarding, internal-note, administrative or AI notification events exist.

GET /notifications returns the authenticated recipient's latest 50 records, ordered by createdAt/ID descending. GET /notifications/unread-count counts all their unread history. PATCH /notifications/:notificationId/read and PATCH /notifications/read-all are recipient-scoped/idempotent and preserve first readAt; another recipient's ID returns 404. Existing ACTIVE/sessionVersion authentication applies to all roles. Mark-read writes recheck the actor transactionally. ADMIN/SUPER_ADMIN have no recipient override or ticket authority. No DELETE API exists.

API projections expose only ID, type, ticketId, subtaskId, createdAt and readAt. Storage/projections contain no message/note content, ticket titles/descriptions, resolution summaries or previews. Old notifications persist after access is lost but never grant visibility. Clicking marks read before navigating to existing Employee/operational ticket or subtask routes with normal 403/404 handling.

The shared bell uses the existing accessible modal, minimal text, date/time, unread badge and read controls. REST refresh occurs on authenticated mount, panel open, explicit refresh/read actions and successful local ticket/subtask/communication mutations. The local UI refresh signal is not server push. Polling, WebSockets, SSE, browser notifications, notification history pagination, deletion/preferences and retention jobs are deferred.

PostgreSQL tests cover recipients, privacy, no-ops/repeated changes, current versus historical collaboration, concurrent message replay, reopening/transfer, active/session rejection, six notification-write rollback cases, and empty-table/restrictive-FK migration checks. Chromium covers Employee/Manager/Agent bells, read controls, ticket/subtask navigation, lost-access destinations, refresh after mutation and mobile layout alongside existing role flows.

## Secure Attachments and Author-Controlled Soft Deletion

Use a shared Attachment model with three real, restrictive foreign keys: ticketId, messageId and internalNoteId. A PostgreSQL CHECK requires exactly one parent; uploaderId also references User. Original ticket attachments cannot have deletedAt. Other columns are generated unique UUID storageKey, sanitized filename, canonical contentType, byteSize, createdAt and nullable deletedAt. Byte size is constrained to 0..10,485,760. Parent authorship/uploader identity is set server-side. No historical attachments are inferred. The additive thirteenth migration leaves existing message/note content unchanged and deletedAt NULL.

Original ticket files can only be submitted during Employee ticket creation and remain permanently immutable. Message/note files can only be submitted with a new parent; PATCH never adds or replaces them. Only the parent author may soft-delete an individual file or its parent, with current authorization and current unfinished-cycle checks. Intake-only managers cannot delete communication. No role override exists. Historical and terminal work remains frozen after reopening. Parent deletion suppresses content and all attached files, retaining database records and private binary data. Tombstones omit old attachment filenames/type/size. No restore or physical purge API exists.

Reuse existing serializable ticket/user/subtask/team locks for deletion and creation, including active/sessionVersion checks. Deletion affects no lifecycle, ownership, collaboration, routing, subtasks or notification rows/read state. Repeat eligible deletion preserves its first timestamp. Deleted attachment downloads are rejected even while binaries remain present. All creation/edit/replay/read projections apply tombstone redaction. Existing no-file creation fingerprints stay compatible; multipart fingerprints also include ordered sanitized metadata and SHA-256 file digests. Original keys remain consumed after editing or deletion. Duplicate replay rechecks current authorization and cleans unused staged binaries without creating records or notifications.

The small AttachmentStorage interface exposes put/read/remove. LocalAttachmentStorage uses a private ATTACHMENT_STORAGE_DIR (default .attachments under the server working directory), opaque UUID filenames, temporary writes and rename. Files are ready before the parent/metadata transaction commits; errors and duplicate recovery clean unused files. Cleanup failures are logged. A crash between filesystem and database operations can leave private unreferenced data; no public orphan metadata is committed. Distributed transactions, automatic orphan scavenging and physical garbage collection are deliberately deferred.

Downloads and original-ticket metadata reads reuse current parent authorization in RepeatableRead snapshots. Public files follow current ticket visibility, including shared NEW intake; internal-note files require supportWhere, which excludes the requester and intake-only managers. Historical content is readable only through current authorization. Administrative roles and guessed IDs confer no access. Employee requests for note attachment IDs return the same generic 404 as missing files, without revealing note existence. Responses use attachment disposition, nosniff, no-store and sandbox CSP. Storage keys and paths never leave the backend.

Uploads use Nest's existing multipart support with a JSON payload field and files parts, preserving JSON-only clients. Maximum five files, 10 MB each; extension/MIME checks, PNG/JPEG/WebP/PDF signatures, valid UTF-8 text and valid JSON are enforced. Allowed formats are PNG, JPEG, WebP, PDF, TXT, LOG, JSON and CSV. These lightweight format checks are not a malware scanner or full document parser. Deployment hardening still needs malware scanning, capacity/rate controls, suitable filesystem permissions/backups, crash recovery and physical purge policies. S3-compatible object storage is an adapter extension point only, not implemented.

The responsive UI selects/removes files before submission, preserves drafts on recoverable errors, downloads through authenticated API calls, confirms eligible author deletion, and renders message/note/attachment tombstones. Ticket attachments have no delete controls. Employees never receive note content or note attachments. Email notifications remain intentionally out of scope; persistent in-app notifications are the only notification channel.

## 2026-09-25 - Limited personal work history

Add GET /my-work-history and /work-history for authenticated MANAGER/AGENT only. This is a projection of retained personal evidence, never an additional TicketVisibilityService predicate. The existing guard rejects inactive users and checks current roles/session versions. The only identity input is the authenticated caller. Administration roles receive no support history.

Ended cycles combine END_OF_WORK ending-manager/ending-agent snapshots, endedBy, timestamped closedBy and REOPENED startedBy attribution into one row per cycle. Only cycles with endedAt/outcome qualify; reopen participation appears after that cycle ends. COMPLETED subtasks with completedById/completedAt provide separate task rows, even in ongoing cycles. Current assignments, memberships and lead relationships cannot qualify a row. RECORDED_AT_MIGRATION ownership is deliberately excluded because it cannot prove end-of-work responsibility.

Return IDs, cycle number/type/outcome, contribution labels, activity timestamp, the caller's completed subtask title/status, and a current canOpenTicket hint. Omit ticket title, requester data, category, current owners, scope, descriptions, communications, attachments and notifications. Check only returned ticket IDs against the unchanged current visibility predicate in the same repeatable-read transaction. Existing routes remain the authoritative checks; historical-only rows have no link.

Use a parameterized PostgreSQL UNION ALL rather than merging unbounded Prisma results in application memory. LIMIT/OFFSET fetches at most pageSize+1 (26 default, 101 maximum), ordered by activityAt/kind/id descending; pageSize, contribution and inclusive date filters are validated. No total count. Six ordinary composite evidence indexes support actor-based lookup without a new history table/backfill. The cost of very deep offsets and page shifts during concurrent changes is accepted for this phase; it is not a cross-request snapshot or general pagination rollout.

Truthfulness boundary: intermediate within-cycle assignments were never recorded, so missing participation cannot be reconstructed. Migration snapshots are not ending snapshots. Subtask titles are retained labels, not historical title versions; normal within-cycle reopening can clear completion attribution. No generic assignment/completion event stream is added. Deactivation keeps historical facts, authentication still rejects inactive users, and reactivation does not restore operational responsibilities. Existing intake visibility, lifecycle, routing, collaboration, communication deletion, attachment and notification behavior are unchanged. This history phase included no auto-close or demo/deployment work.

## Automatic closure after resolution (2026-09-25)

Approved policy: RESOLVED for 72 elapsed hours becomes eligible for CLOSED. No business-calendar logic applies. Current persisted status and resolvedAt are authoritative; reopen invalidates the old deadline and re-resolution starts a new period. CANCELLED remains unrelated and frozen. Existing authorized manual closure remains unchanged.

Separate `AutoCloseService.runSweep(now)` from `AutoCloseScheduler`. The latter uses one process-wide ten-minute interval with Nest initialization/destruction hooks, suppresses local overlap, logs failures and waits for in-flight work during application close. No scheduling package is necessary, and no per-ticket timers exist. The first sweep runs ten minutes after startup. A future deployment scheduler may call the same domain method.

Select bounded batches of 100 parent IDs using status=RESOLVED, resolvedAt<=now-duration, resolvedAt ascending and FOR UPDATE SKIP LOCKED inside Serializable transactions. Stop after ten batches per invocation, leaving backlog for later sweeps. Recheck eligibility under the parent lock before annotating the latest cycle and updating the ticket. Serialization conflicts defer to the next sweep; interactive conflict-to-409 conventions remain untouched. An unexpected failure rolls back its entire batch and is logged; committed earlier batches remain valid. This ensures multiple workers, manual closure, reopening and other lifecycle changes cannot partially or doubly close a ticket. The new `(status, resolvedAt)` index serves equality, range and ordered limited selection; no speculative indexes were added. The database test verifies index availability with EXPLAIN (sequential scans disabled for that assertion; PostgreSQL may choose them for tiny tables).

Configuration is `AUTO_CLOSE_AFTER_HOURS=72` by default, read once from the server environment at startup and shared by eligibility and the API-derived autoCloseAt date. Positive finite values up to 87600 hours are accepted; invalid values fail startup. Instances must use the same value. There is no admin UI or continuously ticking countdown. Employee presentation explains that the date is eligibility and closure occurs at a subsequent sweep.

Migration `20260925180000_ticket_auto_close` adds nullable cycle closeSource MANUAL/AUTO_TIMEOUT and the eligibility index. No source backfill is truthful for all legacy rows, so all historical source values remain NULL and known actor/timestamp facts are retained. Automatic closure has no human actor (closedById NULL), retains the RESOLVED outcome and all resolution/ending ownership data, and adds closedAt/source to the same cycle. New manual closure records MANUAL with the actual actor and preserves the established manual CLOSED outcome. History renders automatic closure from closedAt/source, independent of outcome. Personal work history does not invent a CLOSED_WORK human contribution for system actions.

No CLOSED notification exists, so no new notification or email is emitted. Existing RESOLVED notification behavior remains authoritative. No communication, attachment, soft-deletion, authorization, routing, collaborator or offboarding infrastructure changes. The demo deployment plan's constraints are unchanged.

## Enterprise list stabilization (2026-09-26)

Audit first: [list-scale-audit.md](list-scale-audit.md) records endpoint/screen
classification before implementation. High-volume ticket/subtask queues, accounts
and team membership now use database keyset pagination, not in-memory slicing or
deep offsets. Ticket/subtask ordering is immutable createdAt/id descending;
accounts/members use ID descending. Strictly validated versioned base64url
boundaries need no surviving cursor record. Default 25, maximum 100, one extra
row to detect continuation; no routine total counts. Existing dashboard summaries
use separate visibility-scoped counts. My Work History is deliberately unchanged.

Visibility predicates remain conjuncts of every list/search query. Queue filters
only narrow access; administrative roles gain no operational access. Search is
bounded, trimmed, literal case-insensitive substring matching on existing exposed
fields, plus exact ticket reference lookup. Prisma binds values and LIKE wildcards
are escaped. Broad full-text infrastructure is not justified by this phase.

Team catalogs no longer expand memberships, and assignment contexts no longer
expand people. Purpose-specific lookup requires current subject/organization
authority and returns at most 20 active eligible identities after typed search.
Primary managed-regional/GLOBAL routing, subtask-specific rules, membership and
Team Lead restrictions reuse current policies; mutation checks remain authoritative.
Account lifecycle/creation matrices and projections are unchanged.

The frontend uses a small shared paginated hook, 300 ms debounce, cancellation,
stale-response rejection, continuation retry, and URL filters on main lists.
Back/forward navigation discards previous cursors. It does not cache entire company
collections or introduce a data-fetching framework.

One focused migration replaces five Ticket filter indexes with ordering
composites, adds a general ticket order index and role/status/ID directory index,
and reuses existing membership/subtask/cycle keys. No fabricated data. Small
configuration catalogs and explicitly deferred subject streams remain unpaginated.
Synthetic fixtures, actual ORM query-plan capture, and full regression suites
verify correctness; local timings are observations, not production capacity claims.

## Same-browser session coordination (2026-09-26)

The previous single-flight promise protected only one JavaScript instance. Two
tabs could send the same shared rotating cookie and cause a successful rotation
in one tab and rejection in the other. Keep the existing backend implementation:
opaque tokens, hashed records, ACTIVE/sessionVersion checks, and atomic
consumption/replacement remain authoritative. No runtime backend change, schema
migration or dependency is needed.

Centralize coordination in `client/src/services/session-coordinator.ts`. All
cookie-changing requests acquire the same origin-scoped Web Lock. Keep Axios's
local single flight and single retry. Under the lock, check the shared revision:
a waiter uses a newer transient session if available, requests it from a live
peer with a bounded 100 ms handoff, or performs its own serialized refresh. Only
non-secret UUID/state/cooldown metadata is persisted. Storage events and checking
the current marker before requests/on focus/pageshow cover delayed broadcasts
and suspended tabs. Messages must match the current marker; recipients never
rebroadcast received session/out messages. Peer requests with no answer are
ignored, preventing an election/echo loop when a publisher closes.

BroadcastChannel carries only access-token/user snapshots, never refresh tokens.
Access tokens remain memory-only. Same-origin scripts already share the app's
trust boundary; the transient channel adds no cross-origin/profile/device token
access. The backend still verifies every API request. On account/role changes,
protected views remount so previous-user page state does not remain mounted.

Logout waits for any active rotation, publishes local sign-out under the lock,
and invokes backend logout once for concurrent sibling callers. Publishing before
the HTTP request also clears siblings when the initiating tab closes or its
network fails; as before, a failed backend logout cannot prove server revocation.
Refresh 401/403 and a repeated protected-request 401 invalidate siblings. Late
401 responses carry their request revision and cannot invalidate a newer session.
Login publishes the new session and login pages retain protected deep-link
navigation. No account-wide logout is added; devices/browsers remain independent.

Network/5xx failures publish only a two-second cooldown, preserve auth and surface
existing retry behavior. HTTP timeouts are 15 seconds; pending lock waits abort
after 20 seconds, never steal a live lock. A pending refresh marker left by an
owner that disappears represents an unknowable server outcome. Fail safely and
offer fresh sign-in instead of replaying that cookie or weakening backend
rotation. Resources close on document teardown/HMR; queued lock waits abort,
and bfcache restoration rechecks shared state.

Fallback: Web Locks plus storage events work without BroadcastChannel, with one
serialized refresh per needing tab instead of transient token sharing. Missing
Web Locks or blocked storage shows recovery instructions and issues no unsafe
cookie refresh. This intentionally requires current browsers with enabled site
storage on HTTPS/localhost; a hand-built localStorage lease cannot provide the
same mutual exclusion. Scope is one app origin/storage partition/profile, not
all origins pointing at a shared API. See [Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API)
and [BroadcastChannel](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel).

Acceptance uses real Chromium tabs, native Web Locks/BroadcastChannel, actual
Axios/Redux, rotating HttpOnly cookies and a separate browser context. API fixtures
are isolated; an additional real PostgreSQL/HTTP regression verifies exactly one
concurrent rotation succeeds and logout leaves another login usable. It accepts
the existing serialization-conflict 409 or replay 401 for the concurrent loser,
then separately requires replay rejection. No browser-to-live-database coverage
or Firefox/Safari runtime execution is claimed.
