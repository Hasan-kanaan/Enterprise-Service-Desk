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
- Can create and manage `ADMIN` accounts.
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

After bootstrap:

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

`WAITING_FOR_EMPLOYEE` means support is waiting for requester information or action. `BLOCKED` means work cannot proceed because of a dependency or blocker; these statuses are distinct.

Directly assigned agents, primary-team leads, and the responsible manager may resolve operational tickets. The employee requester or responsible manager may close a resolved ticket. Resolving sets `resolvedAt`; closing preserves it and sets `closedAt`.

Manager assignment/transfer does not change status. First primary-team assignment moves NEW to ASSIGNED; an individual agent is optional. Reassignment preserves ASSIGNED, IN_PROGRESS, WAITING_FOR_EMPLOYEE, and BLOCKED. RESOLVED/CLOSED reject manager transfer, team/agent reassignment, and every subtask mutation. Ownership changes never reset resolution/closure timestamps. NEW -> ASSIGNED cannot be invoked through the status endpoint.

There is no reopen operation. Subtask status remains independent of parent status, but a terminal parent freezes subtask work. General ticket metadata editing retains its existing relationship-based permissions; the terminal freeze concerns ownership and subtask work. Business-day auto-close and closure auditing remain planned.

## Assignment Workflow

Employee creation produces NEW with `assignedManagerId`, `assignedTeamId`, and `assignedAgentId` all NULL. All MANAGER users may read NEW tickets without a responsible manager and assign themselves or another real MANAGER. Intake visibility alone does not permit general edits, status operations, team assignment, or subtask management.

Once assigned, only the responsible manager has manager-level authority. They may transfer responsibility to another MANAGER or choose any real primary team; TeamManager does not grant or restrict this authority. Transfer preserves the primary team, agent, status, and timestamps. Clearing the responsible manager or primary team is unsupported. There is no return-to-intake/unrouted operation.

Team Leads may change the primary agent only within the ticket's currently led primary team. They cannot change the manager or primary team. Ordinary primary agents cannot reassign ownership.

Ticket and subtask mutations lock their parent Ticket row in a serializable transaction, recheck authorization there, and write within that transaction. Manager assignment additionally uses a conditional ownership/status update. Serialization conflicts return 409; callers must reload and explicitly retry, with no automatic conversion of stale claims into transfers.

There is no AI, category, regional, or automatic routing, and no additional triage role. AI suggestions/review are future work.

## Organization and Team Management

The five roles remain exactly `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `AGENT`, and `EMPLOYEE`. Team Lead is not a role. It is an optional operational responsibility assigned to an existing `AGENT`.

`Region`, `Department`, `Specialty`, `Team`, and `Ticket` are separate concepts. Users may have nullable home region and department values. Departments are not tied to regions, and an agent's home region does not automatically restrict team membership.

Teams use one of two scopes:

- `REGION`: exactly one region.
- `GLOBAL`: all regions, with no fake global region record.

A team has at most one manager and may have zero or one Team Lead. A manager may manage multiple teams. An agent may belong to multiple teams and may be Team Lead of at most one team at a time. `TeamManager` records organizational responsibility only; it is independent of ticket responsibility and grants no ticket or subtask authority.

Teams may have multiple specialties. Team membership, specialty membership, and home region are independent relationships.

## Authorization Design

Server-side guards and policies protect the implemented ticket APIs. Read restrictions are part of Prisma queries, not client-side filters.

| Role | Ticket visibility |
| --- | --- |
| EMPLOYEE | Own requested tickets |
| AGENT | Direct primary-agent assignments |
| AGENT acting as Team Lead | Direct assignments plus tickets assigned to their currently led team |
| MANAGER | NEW with NULL assignedManagerId, plus tickets with assignedManagerId equal to caller ID |
| ADMIN / SUPER_ADMIN | None |

Ordinary membership, home region/department, specialty, affected scope, REGION/GLOBAL scope, and TeamManager never independently grant visibility. Subtask assignment does not grant parent-ticket visibility.

ADMIN and SUPER_ADMIN retain their existing account and organization administrative capabilities. System administration is separate from service-desk operations. Operational managers and leads do not gain organization-administration powers.

## Ticket Ownership and Scope

A ticket has independently nullable responsible-manager, primary-team, and primary-agent references. The responsible manager is an explicit User relationship, never derived from TeamManager. An agent requires a team and must be an AGENT member of it; a team without an agent is valid.

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

Subtask-only responses contain the subtask's fields and parent ID, not parent content, requester information, conversations, or notes. Completing/reopening a subtask does not change the parent. RESOLVED/CLOSED parents reject all subtask creation, editing, status changes, and assignment changes. Subtask statuses have no additional transition graph yet.

## Conversations and Internal Notes ? Planned

Employee/support conversations and support-only internal notes are separate future features. Neither is implemented.

Internal notes will be multiple historical records with at least id, ticketId, authorId, content, and createdAt; never one mutable Ticket.note string. AGENT/Team Lead/MANAGER access must use current ticket authorization, and EMPLOYEE/ADMIN/SUPER_ADMIN must never receive note contents in API responses. Notes are general-purpose and not coupled to BLOCKED status. Edit/delete history, terminal-ticket note policy, and whether intake-only managers may add notes still need design. No Prisma note model exists yet.

AI, notifications, email, audit history, attachments, automatic closure, and frontend ticket workflows remain deferred.

## NULL and Data Integrity

NULL means unknown, unassigned, or not applicable. No fake/default entity or first-created record may replace it. Friendly labels belong only in the UI.

PATCH semantics: omitted preserves; explicit NULL requests clearing a nullable field; real ID assigns that entity. Authorization validates the exact final state persisted. Clearing manager or primary team is rejected as an unsupported operation, never treated as omission.

Changing team with an incompatible retained agent is rejected unless the request explicitly clears the agent or supplies an eligible replacement (Option A). No silent clearing. Subtask team clearing requires an explicitly cleared agent when one exists. Non-nullable metadata fields reject NULL.

## Frontend Structure

The frontend will use a classic structure:

- components/
- pages/
- hooks/
- services/
- types/

Reason:
This is simpler and easier to understand while learning React TypeScript.