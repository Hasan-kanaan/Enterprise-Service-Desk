# Enterprise Service Desk

An AI-powered full-stack Enterprise IT Service Desk built as a real-world learning project.

The application simulates an internal IT support platform for a large company. Employees can submit IT support tickets, support agents can work on those tickets, managers can oversee and assign tickets, and administrators can manage the system.

AI assistance with categorization, priority, and assignment is planned after the non-AI service-desk workflow is functional; it is not integrated yet.

The goal is not only to build a functional application, but also to gain practical full-stack development experience while learning backend development gradually.

---

## Table of Contents
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Development Ports](#development-ports)
- [Product Concept](#product-concept)
- [User Roles](#user-roles)
- [Authentication](#authentication)
- [Authorization](#authorization)
- [Ticket System](#ticket-system)
- [Ticket Status Lifecycle](#ticket-status-lifecycle)
- [Ticket Categories](#ticket-categories)
- [Ticket Priority](#ticket-priority)
- [AI Integration](#ai-integration)
- [Notifications](#notifications)
- [Email System](#email-system)
- [Departments](#departments)
- [Comments](#comments)
- [Internal Notes](#internal-notes)
- [Attachments](#attachments)
- [Audit History](#audit-history)
- [Backend Architecture](#backend-architecture)
- [Frontend Architecture](#frontend-architecture)
- [Database](#database)
- [Environment Variables](#environment-variables)
- [Development Phases](#development-phases)
- [Git Workflow](#git-workflow)
- [Rules for AI Assistants](#rules-for-ai-assistants)
- [Project Status](status.md)
- [Future Public Demo Deployment Plan](docs/demo-deployment-plan.md)

---

## Project Goals

The main goal is to build a realistic full-stack enterprise application while developing practical backend skills.

The project should provide experience with:

- React
- TypeScript
- Vite
- React Router
- CSS
- NestJS
- REST APIs
- PostgreSQL
- ORM
- Database design
- Authentication
- JWT
- Authorization
- Role-Based Access Control (RBAC)
- API validation
- Frontend/backend communication
- Internal notifications
- AI integration
- File uploads
- Error handling
- Logging
- Testing
- Git/GitHub
- Deployment

The developer has significantly more experience with frontend development than backend development.

Therefore, backend development should be approached gradually and explained clearly.

The purpose is to understand how the application works, not simply copy generated code.

---

## Technology Stack

### Frontend

- React
- TypeScript
- Vite
- React Router
- CSS
- ESLint

The frontend uses TypeScript.

The frontend will use a traditional structure:

```text
components/
pages/
hooks/
services/
types/
```

This is intentional because the developer is already comfortable with this style of React architecture.

### Backend

- NestJS
- TypeScript
- REST API
- PostgreSQL
- ORM
- JWT authentication
- Role-Based Access Control

The backend will follow NestJS conventions and architecture.

Important NestJS concepts that will be introduced throughout the project include:

- Modules
- Controllers
- Services
- DTOs
- Guards
- Pipes
- Decorators
- Middleware
- Authentication strategies
- Exception handling

These concepts should be introduced when they become necessary rather than all at once.

### Package Manager

The project uses:

```text
pnpm
```

Do not switch the project to npm or yarn unless explicitly decided.

---

## Project Structure

The repository contains separate frontend and backend applications.

```text
Enterprise-Service-Desk/
│
├── client/
│   └── React + TypeScript frontend
│
├── server/
│   └── NestJS backend
│
├── docs/
│   └── Project documentation and architectural decisions
│
└── README.md
```

The frontend and backend are separate applications within the same repository.

---

## Development Ports

The development environment uses:

```text
Frontend:
http://localhost:3000

Backend:
http://localhost:8000
```

Do not change these ports unless explicitly decided.

The architecture is:

```text
React Frontend
localhost:3000
       │
       │ HTTP REST API
       ▼
NestJS Backend
localhost:8000
       │
       ▼
PostgreSQL
```

The frontend must never communicate directly with the database.

---

## Product Concept

This application is an internal Enterprise IT Service Desk for a large company.

Imagine a company with hundreds or thousands of employees.

Employees use the application when they need assistance from the company's support team.

Examples include:

- Laptop problems
- Network problems
- Wi-Fi problems
- VPN problems
- Email problems
- Software problems
- Password/account issues
- Access requests
- Printer problems
- Hardware requests
- Internal application issues

The system manages these requests from creation through resolution and closure.

---

## User Roles

There is one `User` model.

Employees, agents, managers, administrators, and super administrators are NOT separate user entities.

A user's role determines what they are allowed to do.

Available roles:

```text
SUPER_ADMIN
ADMIN
MANAGER
AGENT
EMPLOYEE
```

### EMPLOYEE

Employees are internal company employees and ticket requesters.

They can:

- Login
- Create tickets
- View their own tickets
- Comment on their tickets
- Respond when support staff request information
- Receive internal notifications
- Close tickets after they are resolved

They cannot:

- View other employees' tickets
- Assign tickets
- Manage users
- Manage departments
- Access management functionality

### AGENT

Agents are IT/service-desk support staff.

They can:

- Login
- View tickets assigned to them
- View ticket information
- Comment on tickets
- Change ticket status
- Resolve tickets
- Receive internal notifications

Agents see primary assignments and tickets where they currently collaborate through a subtask in the current unfinished work cycle. Completed current-cycle subtasks retain collaboration until reassignment or cycle end. Historical assignments and ordinary team membership grant no current parent access. An AGENT may optionally lead one team; that responsibility grants visibility for its current primary-team tickets.

Agents should receive an internal notification when a ticket is assigned to them.

Assignment notifications use persistent in-app notifications only.

Ordinary agents cannot assign/reassign ownership. A Team Lead may assign/reassign the primary agent within their currently led primary team, but cannot change the responsible manager or primary team.

### MANAGER

Managers supervise service-desk operations and are not system administrators.

They can:

- View tickets
- Assign tickets
- Reassign tickets
- Review AI assignment suggestions
- Approve AI suggestions
- Override AI suggestions
- Change ticket priority
- Monitor ticket activity
- Monitor agents
- Receive internal notifications

The responsible manager controls team assignment and manager transfer. Any manager may initially assign a manager to an unowned NEW ticket. AI review is planned, not implemented.

Managers see shared intake (NEW tickets with NULL assignedManagerId) and tickets explicitly assigned to them as responsible manager. TeamManager is an organizational relationship and grants no ticket authority. Home organization and affected scope do not grant access.

Employee/support conversation and separate support-only internal notes are implemented with current relationship authorization and work-cycle boundaries.

### ADMIN

Admins manage organization accounts and system configuration.

They can:

- Create users
- Create employee accounts
- Create agent accounts
- Create manager accounts
- Manage users
- Manage roles
- Manage departments
- Manage system configuration

Admins cannot create `SUPER_ADMIN` or other `ADMIN` accounts. The intended account hierarchy is:

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

ADMIN users can manage users and organization configuration but do not have ticket visibility or access to ticket conversations. Ticket oversight belongs to managers and the operational users authorized for the ticket.

### SUPER_ADMIN

Super Admins are the highest-level system administrators.

They can:

- Be created only during the initial application bootstrap/setup
- Create and manage `ADMIN`, `MANAGER`, `AGENT`, and `EMPLOYEE` accounts
- Perform system-level administration

They cannot create another `SUPER_ADMIN`. They have no ticket, subtask, or future internal-note access. Their account and organization administrative responsibilities remain intact.

There is no public registration. Users cannot choose their own role. All account-creation endpoints must be protected by authentication and server-side role-based authorization.

---

## User Model

All users are represented by a single `User` entity.

Conceptually:

```text
User
├── id
├── email
├── password
├── role
├── departmentId
└── ...
```

The role is one of:

```text
SUPER_ADMIN
ADMIN
MANAGER
AGENT
EMPLOYEE
```

We intentionally do not create separate:

```text
Employee
Agent
Manager
Admin
SuperAdmin
```

entities.

This keeps authentication, authorization, and user management simpler.

If role-specific fields are required later, they can be added without creating separate authentication systems.

## Organization and Teams

Regions represent physical locations and departments represent organizational functions; departments are not tied to regions. Users may have nullable home region and department values. Specialties are managed entities that can be assigned to agents and teams through many-to-many relationships.

Teams are operational support groups with either `REGION` scope, covering exactly one region, or `GLOBAL` scope, covering all regions without a fake global region. Teams may have multiple specialties, agents may belong to multiple teams, each team has at most one manager, and each team may have zero or one optional Team Lead. Team Lead is an AGENT responsibility, not an RBAC role.

---

## Authentication

Authentication will be implemented by the application itself.

Do NOT use Clerk or another external authentication provider unless explicitly decided later.

The planned authentication system includes:

- One-time initial `SUPER_ADMIN` bootstrap/setup
- Admin-provisioned account creation
- Login
- Password hashing
- JWT access tokens
- Refresh tokens
- Protected routes
- Role-based authorization
- Logout/token invalidation strategy

Passwords must never be stored in plaintext.

Refresh tokens should not be stored in plaintext in persistent storage.

The account lifecycle is:

```text
Fresh installation
   ↓
Initial SUPER_ADMIN setup
   ↓
SUPER_ADMIN can create ADMIN, MANAGER, AGENT, and EMPLOYEE accounts
   ↓
ADMIN creates EMPLOYEE, AGENT, and MANAGER accounts
   ↓
Users log in normally
```

The initial setup is available only while no `SUPER_ADMIN` exists. It becomes unavailable after the first `SUPER_ADMIN` is created. The bootstrap flow is not normal user registration.

Authentication will be implemented gradually during Phase 1.

---

## Authorization

Authorization will use Role-Based Access Control (RBAC).

Conceptually:

```text
EMPLOYEE  → own tickets
AGENT     → directly assigned tickets/subtasks
TEAM LEAD → tickets and operational work for their team
MANAGER   -> unowned NEW intake and explicitly manager-owned tickets
ADMIN / SUPER_ADMIN -> administration only; no ticket/subtask access
```

Team membership alone does not grant an agent team-wide ticket visibility. Cross-region or global ticket scope affects the issue, not automatic authorization. Server-side visibility, creation/editing, manager ownership, team/agent assignment, status, and subtask policies are connected to the API. Manager-level authority follows assignedManagerId, never TeamManager. Intake visibility alone permits initial manager assignment, not other mutations.

NestJS Guards protect endpoints based on authentication and roles; service policies enforce ticket and subtask relationships.

Conceptually:

```text
HTTP Request
     │
     ▼
JWT Authentication Guard
     │
     ▼
Role Guard
     │
     ▼
Controller
     │
     ▼
Service
```

---

## Ticket System

Tickets are the central entity of the application.

A ticket represents an internal IT support request.

A ticket will eventually contain information such as:

- ID
- Title
- Description
- Requester
- Affected regions and departments
- Category
- Tags
- Priority
- Status
- Explicit nullable responsible manager
- Primary assigned team
- Assigned agent
- Subtasks
- AI recommendation
- Comments
- Attachments
- Created timestamp
- Updated timestamp
- Resolved timestamp
- Closed timestamp

The requester, affected scope, responsible manager, and operational team/agent assignments are separate concepts. A ticket can affect selected or all regions and departments, while retaining one primary team and at most one primary agent. Subtasks allow additional teams and agents to contribute without creating multiple primary owners.

Do not add unnecessary fields without a reason.

---

## Ticket Status Lifecycle

Tickets use the following statuses:

```text
NEW
ASSIGNED
IN_PROGRESS
WAITING_FOR_EMPLOYEE
BLOCKED
RESOLVED
CLOSED
CANCELLED
```

### NEW

The employee has created the ticket.

The ticket awaits primary-team assignment. It may already have a responsible manager; manager assignment alone leaves it NEW.

```text
Employee creates ticket
        ↓
NEW
```

### ASSIGNED

The ticket has been assigned to a primary team. An individual agent may still be unassigned.

The agent has not necessarily started working on it yet.

```text
NEW
 ↓
ASSIGNED
```

### IN_PROGRESS

The agent is actively working on the ticket.

```text
ASSIGNED
 ↓
IN_PROGRESS
```

### WAITING_FOR_EMPLOYEE

The support team cannot continue until the employee provides information or performs an action.

For example:

```text
Agent:
Can you provide the error message you are seeing?
```

The ticket becomes:

```text
WAITING_FOR_EMPLOYEE
```

Another example:

```text
Agent:
Please restart your computer and let me know whether
the problem still exists.
```

The ticket remains waiting until the employee responds.

When the employee responds, the ticket can move back to:

```text
IN_PROGRESS
```

This status specifically represents situations where the support team is waiting for the requester.

### BLOCKED

Work cannot proceed because of a dependency or blocker. `BLOCKED` is distinct from `WAITING_FOR_EMPLOYEE`; it does not mean that the requester is being asked for information.

### RESOLVED

The agent believes the issue has been fixed.

Example:

```text
Agent:
I reset your VPN credentials. Please try connecting again.
```

If the problem appears fixed:

```text
IN_PROGRESS
 ↓
RESOLVED
```

The employee can then verify the solution.

### CLOSED

The employee can close a ticket after it has been resolved.

The distinction is:

```text
RESOLVED
=
The support team believes the problem is fixed.

CLOSED
=
The requester has confirmed the ticket is finished.
```

If the employee discovers that the issue still exists, the ticket should not simply be closed.

The requester or responsible manager may explicitly reopen RESOLVED/CLOSED with a reason. Each reopening creates a new work cycle; CANCELLED cannot reopen.

---

## Ticket Workflow

The implemented workflow is manual:

```text
Employee creates NEW (manager/team/agent all NULL)
  -> Any MANAGER assigns themselves or another real MANAGER
  -> Remains NEW, visible to that responsible manager
  -> Responsible manager assigns a real primary team
  -> ASSIGNED (individual agent optional)
  -> IN_PROGRESS -> WAITING_FOR_EMPLOYEE or BLOCKED -> IN_PROGRESS
  -> RESOLVED -> CLOSED
```

The responsible manager may select only teams they organizationally manage through TeamManager or teams with GLOBAL coverage. Another manager's regional team is forbidden even when its region or specialty matches the ticket; an unmanaged regional team is also ineligible. GLOBAL is team coverage, not an Agent role, and a GLOBAL team may have its own organizational manager. Cross-organizational primary routing uses GLOBAL teams.

Only the responsible manager may explicitly transfer ticket responsibility to another manager. Transfer changes no primary team, agent, status, timestamps, or organizational TeamManager relationships. Existing assignments remain after transfer; subsequent primary-assignment writes must select a team eligible for the new responsible manager. Team Leads can assign agents only within their ticket's currently led primary team. Primary agents must be active AGENT members of the selected primary team, including GLOBAL teams, and are never inferred from subtasks.

PATCH omission preserves ownership; explicit NULL clears only where permitted. Changing teams with an incompatible retained agent is rejected unless the caller explicitly clears/replaces the agent. Ordinary assignment cannot clear manager or primary team. Special reopening and administrative manager offboarding can explicitly return a ticket to empty NEW intake. No defaults or automatic routing are created.

### Implemented Ticket API

All routes require authentication. ADMIN and SUPER_ADMIN are denied all ticket/subtask routes.

| Route | Purpose |
| --- | --- |
| GET /tickets, GET /tickets/:ticketId | Filtered ticket reads |
| GET /ticket-options | Operational roles: category, tag, region, department ID/name choices |
| POST /tickets | Employee creation with NULL ownership |
| PATCH /tickets/:ticketId | Relationship-authorized metadata edits |
| PATCH /tickets/:ticketId/manager | Initial ownership / transfer; body: assignedManagerId |
| PATCH /tickets/:ticketId/assignment | Team/agent assignment; body: optional teamId, agentId |
| PATCH /tickets/:ticketId/status | Authorized transition; optional resolutionSummary only when resolving |
| POST /tickets/:ticketId/cancel | Employee requester; NEW/ASSIGNED only |
| POST /tickets/:ticketId/reopen | Requester/responsible manager; required reason |
| GET /tickets/:ticketId/history | Currently authorized cycle history with separately filtered subtasks |
| GET/POST /tickets/:ticketId/messages | Read public conversation / create a requester-visible message |
| PATCH /tickets/:ticketId/messages/:recordId | Author-only current unfinished-cycle editing |
| GET/POST /tickets/:ticketId/internal-notes | Authorized support reads / note creation |
| PATCH /tickets/:ticketId/internal-notes/:recordId | Author-only current unfinished-cycle note editing |
| GET /tickets/subtasks | Caller-visible subtask list |
| GET /tickets/subtasks/:subtaskId | Caller-visible subtask detail |
| GET /tickets/:ticketId/subtasks | Caller-visible subset under a parent |
| POST /tickets/:ticketId/subtasks | Responsible-manager or parent-team lead creation |
| PATCH /tickets/subtasks/:subtaskId | Authorized content/status/assignment changes |

Ticket lists return scalar fields. Ticket detail includes scope/tag IDs, ownership summaries, and the latest work-cycle summary. History is a separate, authorized endpoint. Subtask reads never include parent-ticket content. The employee frontend uses these APIs and the read-only ticket-options catalog; the catalog exposes no user directory or administrative team data.

Employees have no support-subtask access. Direct subtask agents can read/work on their own subtask, but cannot reassign it. Primary parent-agent assignment grants no extra subtask access. Team Leads read/manage subtasks assigned to their led team, may assign agents within that team, and may create subtasks for that team when it is the parent primary team. Only the responsible manager delegates subtasks across teams. Subtask state changes never change parent state, and terminal parents freeze subtask mutations.

Mutations lock the parent ticket in serializable PostgreSQL transactions. Concurrent stale writes return 409 and must be explicitly retried after reloading. Inaccessible ticket/subtask details return 404; forbidden mutations return 403 and terminal ownership/work changes return 409. RESOLVED/CLOSED/CANCELLED freeze all ordinary metadata, ownership, and subtask mutations. Previous-cycle subtasks remain frozen after reopening.

---

## Account Lifecycle and Offboarding

Users are ACTIVE or INACTIVE; no user or ticket DELETE endpoint exists. `PATCH /users/:userId/status` accepts `{ "status": "INACTIVE" }` or ACTIVE. SUPER_ADMIN can manage ADMIN/MANAGER/AGENT/EMPLOYEE status; ADMIN can manage MANAGER/AGENT/EMPLOYEE status. SUPER_ADMIN deactivation is excluded.

Deactivation atomically removes only the departing user's current operational responsibilities. Manager-owned active tickets return to NEW with manager/team/agent all NULL. Active primary-agent assignments clear only the agent. Actionable TODO/IN_PROGRESS current-cycle subtask assignments clear only the agent. Team Lead and TeamManager responsibilities are removed without replacement. Terminal tickets and historical work remain unchanged. This administrative operation returns only user ID/status and grants no ticket visibility or ordinary service-desk powers.

Inactive users cannot log in, refresh sessions, or receive new operational assignments. Protected requests check database status, current role, and sessionVersion. Deactivation increments the version and revokes refresh tokens atomically. Reactivation permits fresh login but never restores previous sessions. Serializable conflicts return 409; reload and explicitly retry, with no partial offboarding.

## Reopening and Work-Cycle History

An employee may cancel only their own NEW/ASSIGNED ticket. CANCELLED is permanently frozen. RESOLVED/CLOSED/CANCELLED reject ordinary metadata, ownership, and subtask changes. RESOLVED can still be explicitly closed. Only explicit reopening starts new work from RESOLVED/CLOSED; assignments never reopen implicitly.

`POST /tickets/:ticketId/reopen` accepts `{ "reason": "The problem returned" }`. Only the requester or responsible manager may reopen; AGENT/Team Lead/ADMIN/SUPER_ADMIN do not gain that authority. There is no reopen time limit.

Normal reopen preserves active manager, valid team, and eligible agent and moves to IN_PROGRESS. An inactive historical agent is automatically cleared without replacement. An inactive/missing manager returns the ticket to NEW with manager/team/agent NULL. Other invalid legacy routing requires an explicit `returnToIntake: true` request; that option is rejected for valid routing. Previous-cycle ownership and work are preserved.

Each ticket has an ORIGINAL cycle followed by REOPENED cycles numbered 2, 3, etc. The greatest sequence is current; there is no current-cycle foreign key on Ticket. Resolution/cancellation ends a cycle and captures ending ownership. Closure annotates the same cycle. Ticket resolvedAt/closedAt describe the current attempt and clear on reopen, while historical times remain in their cycle. Reopening reasons and optional resolution summaries are requester-visible.

Subtasks belong permanently to their creation cycle. Old incomplete subtasks keep their truthful status and remain frozen; repeated work requires a new subtask. completedById records the actual completion actor, independently from assignment. Unknown legacy actors/times remain NULL. Ending ownership represents responsibility when work stopped, not an exhaustive participant or reassignment log.

Current responsibility controls ticket/history visibility. Historical participation never expands the current ticket queue. Employees receive public cycle history without support subtasks. Agents/leads receive independently authorized subtasks, and the responsible manager receives all subtasks. Intake-only managers have no subtask access. Subtask-only access never includes parent history. History returns `subtasksAccess: NONE/FILTERED/ALL` and newest-first cycles with `isCurrent`, `isEnded`, sequence, type, reasons, outcome, timestamps, ownership, and authorized work.

`GET /tickets?active=true` filters current visible operational tickets; `status=RESOLVED` supports exact status filtering. Subtask list routes support `currentWork=true` to exclude ended-cycle or completed/cancelled work. Future React labels can derive ?Current Work ? Reopening #2?, ?Reopening #1?, and ?Original Investigation? directly from cycle sequence/type.

Work-cycle history, requester-visible conversations, separate internal notes and persistent in-app notifications are implemented. Communication belongs to its actual work cycle; reopening never moves or resets old records. Automatic RESOLVED -> CLOSED behavior remains on the roadmap; generic audit logs remain deferred.

---

## Ticket Categories

The application initially focuses on internal IT support.

Potential categories include:

```text
Hardware
Software
Network
Account
Email
VPN
Printer
Access Request
Other
```

Categories may be expanded later.

The category may be suggested by AI.

Managers and authorized users should be able to override incorrect AI suggestions.

---

## Ticket Priority

Tickets have the following priority levels:

```text
LOW
MEDIUM
HIGH
CRITICAL
```

AI may suggest a priority when a ticket is created.

The manager can approve or override the suggestion.

Priority should be based on the impact and urgency of the issue.

---

## AI Integration

AI is a planned part of the application, deferred until the manual service-desk workflow is functional.

AI should be considered during the initial system architecture rather than added as an afterthought.

When a ticket is created, AI may analyze it and provide:

- Suggested category
- Suggested priority
- Suggested agent
- Confidence score
- Reason for the recommendation

The future AI workflow is:

```text
Employee creates ticket
        │
        ▼
AI analyzes ticket
        │
        ├── Suggested category
        ├── Suggested priority
        ├── Suggested agent
        ├── Confidence score
        └── Reason
        │
        ▼
Manager reviews recommendation
        │
        ├── Approve
        │
        └── Override
        │
        ▼
Ticket assigned
```

The AI assists humans.

It does not completely replace the manager during the initial implementation.

---

## AI Ticket Creation Assistant

AI may also assist employees while they create tickets.

For example:

```text
My laptop keeps disconnecting from WiFi and I can't connect
to the company network.
```

The AI could help:

- Improve the description
- Identify the likely category
- Suggest priority
- Ask for missing information
- Help the employee describe the issue clearly

The AI should assist the employee rather than silently changing important information.

---

## Future AI Automation

Once the basic AI workflow works, automatic assignment may be introduced.

For example:

```text
AI confidence >= configured threshold
        │
        ▼
Automatically assign ticket
```

Lower-confidence recommendations should continue to require manager review.

The exact threshold and automation rules will be decided later.

---

## Notifications

Persistent in-app notifications are implemented. The authenticated shell has a bell, unread badge, recent list, timestamps, individual mark-read and mark-all-read actions. Opening a notification marks it read before navigating to the existing ticket or subtask route. Historical notification links never grant access: normal destination authorization still applies.

| Event | Active recipients |
| --- | --- |
| New primary-agent assignment | Newly assigned Agent |
| New/reassigned subtask Agent | Newly assigned Agent |
| New requester public message | Responsible Manager, primary Agent, current primary-team Lead and current-cycle collaborators, deduplicated |
| New support public message | Requesting Employee |
| Transition to WAITING_FOR_EMPLOYEE | Requesting Employee |
| Transition to RESOLVED | Requesting Employee |
| Employee reopens RESOLVED/CLOSED | Post-reopen responsible Manager, primary Agent and primary-team Lead, deduplicated |
| Responsible Manager reopens | Requesting Employee |
| Explicit transfer to a different responsible Manager | New responsible Manager |

Completed current-cycle collaborators remain eligible for requester-message notifications. Previous-cycle/historical collaborators, reassigned-away collaborators, ordinary team members and inactive users are excluded. Reopening does not carry old collaborators into recipients. Assignment no-ops/clearing, initial Manager claim, message edits/replays and internal notes produce no notifications. A later real A -> B -> A assignment creates separate events. Closure, cancellation and administrative offboarding have no notification events in this phase.

`Notification` stores recipient, type, optional actor/ticket/subtask references, createdAt and nullable readAt with restrictive foreign keys. It stores no message/note bodies, ticket titles/descriptions, resolution summaries or previews. The UI receives only IDs, type, resource IDs and timestamps. Notifications are inserted inside the successful domain mutation's existing Serializable transaction; failure rolls back the mutation and its notifications together. No silent retry, event bus, generic audit log or event-sourcing framework is introduced.

| API | Behavior |
| --- | --- |
| GET /notifications | Own latest 50, newest first (createdAt, then ID) |
| GET /notifications/unread-count | Own unread count across all history |
| PATCH /notifications/:notificationId/read | Idempotently mark own record read; another recipient's ID returns 404 |
| PATCH /notifications/read-all | Idempotently mark all own unread records read, including older records |

All endpoints require current ACTIVE/sessionVersion authentication. ADMIN/SUPER_ADMIN can access only their own empty notification UI and gain no ticket authority or access to other recipients. No notification DELETE endpoint exists.

Refresh is explicit REST: initial authenticated load, opening the panel, the refresh button, after mark-read operations, and after successful local ticket/subtask/communication mutations. No polling, email, WebSockets, SSE, browser notifications or realtime delivery. Migration `20260923150000_in_app_notifications` creates an empty table; it does not fabricate notifications from existing tickets or messages.

---

## Email System

Email notifications are intentionally out of scope. The application uses persistent in-app notifications only.

---

## Departments

Tickets may affect one or more departments, or explicitly all departments. This affected scope is separate from the requester's home department.

Initial departments may include:

```text
IT
HR
Finance
Facilities
Security
```

The system should support adding additional departments later.

Departments are independent organizational entities and are not tied to a single region. Ticket category and tags describe the support issue; they are not departments.

---

## Comments

A cycle-bound ticket conversation is implemented in Employee and authorized operational ticket views.

The requesting employee, primary agent, current collaborators, primary-team lead and responsible manager can post while the current cycle is unfinished and the ticket is operational. Intake-only managers can read conversation but must claim responsibility before posting. ADMIN/SUPER_ADMIN have no access. Historical authorship grants no visibility.

Example:

```text
Employee:
My VPN is not connecting.

Agent:
What error message do you see?

Employee:
It says "Authentication failed."

Agent:
Thanks. I reset your VPN credentials.
Please try again.

Employee:
It works now.
```

Messages remain grouped with their original work cycle. Plain text is trimmed and limited to 4,000 characters. Authors can edit only their own current unfinished-cycle records while still authorized; edits show an edited indicator. Authors may also soft-delete their own current unfinished-cycle messages/notes and individual attachments while still authorized. Deleted content is hidden by tombstones and cannot be edited or restored; no revision-history endpoint exists. Terminal and previous-cycle records are permanently read-only.

Only a NEW requester message while WAITING_FOR_EMPLOYEE atomically resumes IN_PROGRESS. Edits, support messages, internal notes and duplicate retries never change status. RESOLVED/CLOSED require explicit reopening before further communication; CANCELLED never reopens. New public messages create the in-app notifications documented above in the same transaction. Real-time transport remains deferred.

POST requires `{ content, expectedCycleId, clientRequestId }`, with a UUID request key. PATCH requires `{ content, expectedCycleId }`. The server assigns author and cycle. GET returns the current cycle ID, lightweight cycle summaries, posting permissions, and ordered records with author ID/username, createdAt, editedAt and canEdit. Current support can read authorized communication from older cycles. No internal notes are embedded in public conversation or history responses.

Transactions reuse ticket/user locks, active-account checks and serializable conflict handling. Relationship-row locks also protect collaborator/Team Lead writes against concurrent loss of authority. Creation keys deduplicate retries; a private original-request fingerprint permits recovery even after editing without storing a revision stream. Conflicts require explicit reload/review, and stale drafts never silently move into another cycle. The frontend preserves recoverable drafts and separates public and internal composers.

---

## Internal Notes

TicketInternalNote is separate from TicketMessage, with the same cycle, authorship, timestamp, length, idempotency and author-editing rules. Notes are multiple records, not a mutable string on Ticket. They never change ticket status.

Primary agents, current collaborators, primary-team leads and responsible managers may read/add notes. Current authorized support may read prior-cycle notes. Intake-only managers must claim responsibility first. Employees, ADMIN/SUPER_ADMIN, ordinary team members and historical subtask-only users receive no note access. Notes are general-purpose, not tied to BLOCKED. Authorization is enforced server-side on every read/write.

---

## Attachments

Employees can attach files when creating a ticket. These original request attachments are permanently immutable: no later additions, replacements, edits or deletion. New public messages and support-only internal notes can include attachments in the same submission. Content remains required. Files cannot be appended or replaced afterward.

The parent author alone may soft-delete a message/note or one of its attachments while currently authorized and while the parent belongs to the current unfinished work cycle. Managers, Team Leads and other support users cannot delete another author's work. RESOLVED/CLOSED/CANCELLED and all previous-cycle communication stay frozen, including after reopening. ADMIN/SUPER_ADMIN have no attachment access.

Deletion retains IDs, author/uploader, creation time, cycle and deletion time. APIs return message/note content as null and attachment tombstones without the old filename/type/size. Deleting a parent also hides all its attached files. Deleted files cannot be downloaded, edited or restored. Deletion changes no ticket status, ownership, subtasks, routing, collaboration, cycles or notifications. A requester reply followed by deletion leaves the ticket IN_PROGRESS. Creation keys stay consumed; replay returns the tombstone without new files or notifications.

Up to **5 files per submission, 10 MB (10,485,760 bytes) per file**: PNG, JPEG, WebP, PDF, TXT, LOG/plain text, JSON and CSV. The server checks extension, declared MIME, signatures for binary formats, UTF-8 text and JSON syntax. Executable, HTML/script and archive extensions are rejected. Display filenames are sanitized; generated UUID keys address stored files. These checks are not malware scanning.

Files use a replaceable `AttachmentStorage` interface and a local filesystem adapter. Set `ATTACHMENT_STORAGE_DIR` to a private directory; the development default is `.attachments` under the server process working directory (`server/.attachments` when started from `server/`), ignored by Git. Never configure it inside a public/static directory. Uploads are bounded in memory, written to temporary files and renamed before the database transaction. Parent and metadata commit together; failed mutations and duplicate replays clean their unused files. Storage failure prevents parent creation. Unexpected process termination can leave private unreferenced files; crash recovery/scavenging, physical purge, quotas, malware scanning and S3/object storage remain deferred deployment hardening. No files are claimed to be scanned.

Every download authorizes current access through the parent in the backend. Original ticket and public-message attachments use current ticket visibility; note attachments use current support-only visibility. Ordinary membership, past collaboration, old participation and notifications grant no access. Authorized historical downloads remain available, but access disappears when the current parent relationship is lost. Downloads use `Content-Disposition: attachment`, `nosniff`, private/no-store caching and a restrictive CSP; no static upload route or inline preview exists. Storage keys/paths never enter API projections.

API additions:

- Existing `POST /tickets`, `POST /tickets/:ticketId/messages` and `POST /tickets/:ticketId/internal-notes` accept the existing JSON DTO or multipart with one JSON `payload` field and up to five `files` parts. No base64 bodies.
- `GET /tickets/:ticketId/attachments` lists original request metadata. Message/note projections contain their attachment metadata plus parent `canDelete` hints.
- `GET /tickets/attachments/:attachmentId/download` downloads an authorized, undeleted file.
- `DELETE /tickets/:ticketId/messages/:recordId` and the corresponding `/internal-notes/:recordId` soft-delete the author's eligible record.
- Append `/attachments/:attachmentId` to either communication DELETE route to delete one eligible attachment. DELETE bodies require `{ expectedCycleId }`; repeat deletion preserves the original timestamp while still eligible.
- PATCH remains content-only; no append, replacement, restore or ticket-attachment deletion endpoint exists.

The migration `20260925120000_attachments_soft_deletion` adds nullable communication `deletedAt` and an empty Attachment table. It preserves existing content and fabricates no attachments. Tests use temporary private storage with cleanup.

---

## Audit History

The application should eventually maintain an activity history for important actions.

Examples:

```text
Ticket created
Status changed
Priority changed
Agent assigned
Agent reassigned
Comment added
Ticket resolved
Ticket closed
```

This is important for an enterprise system for future security review. Audit authorization is a separate future design; administrative roles do not gain product-facing ticket or work-cycle history access.

---

## Backend Architecture

The backend uses NestJS modular architecture.

Planned modules include:

```text
auth
users
tickets
comments
notifications
departments
```

Additional modules may be added when justified.

A typical NestJS module may contain:

```text
module
controller
service
dto
guards
strategies
decorators
```

Not every module needs every type of file.

Files should be created when they are actually needed.

### Backend Concepts

The developer currently has limited backend experience.

Backend concepts should therefore be introduced gradually.

#### Module

A module groups related functionality.

For example:

```text
AuthModule
```

could contain all authentication-related functionality.

#### Controller

A controller receives HTTP requests.

For example:

```text
POST /auth/login
        ↓
AuthController
```

Controllers should handle HTTP-related responsibilities.

Complex business logic should not be placed directly inside controllers.

#### Service

A service contains business logic.

For example:

```text
AuthController
      │
      ▼
AuthService
      │
      ├── Find user
      ├── Verify password
      ├── Generate token
      └── Return result
```

#### DTO

DTO means Data Transfer Object.

DTOs describe and validate the expected structure of incoming data.

For example:

```text
LoginDto

email
password
```

DTOs are used with global NestJS validation, including rejection of unexpected fields.

#### Guard

A guard determines whether a request is allowed to continue.

For example:

```text
Request
   │
   ▼
JWT Guard
   │
   ▼
Role Guard
   │
   ▼
Controller
```

A guard can prevent unauthenticated or unauthorized users from accessing an endpoint.

---

## Frontend Architecture

The frontend uses a traditional React architecture.

Preferred structure:

```text
client/
└── src/
    ├── components/
    ├── pages/
    ├── hooks/
    ├── services/
    ├── types/
    ├── layouts/
    ├── routes/
    └── ...
```

The project intentionally uses this structure instead of a feature-first architecture.

The goal is to keep the frontend familiar while learning backend development.

### Implemented Employee Workspace

The responsive employee workspace includes a dashboard with real request counts, a searchable/filterable ticket list, ticket creation, current ticket detail, metadata editing, and public work-cycle history. `/tickets`, `/tickets/new`, and `/tickets/:ticketId` are employee routes. Manager and Agent/Team Lead screens use the operational routes described below. Administrative users have no ticket navigation or ticket authority.

Employees can cancel their own NEW/ASSIGNED requests, close RESOLVED requests, and reopen RESOLVED/CLOSED requests with a reason. Confirmation dialogs explain each operation. Terminal tickets hide metadata editing; CANCELLED cannot reopen. History retains the server's historical ownership and timestamps and never requests or displays support subtasks. The server remains authoritative for every operation. A 409 requires explicit reload; mutations are not automatically retried on conflicts. Invalid legacy reopen routing offers the backend's explicit return-to-intake choice.

Creation/edit forms load actual category, tag, region, and department choices from `GET /ticket-options`. No organization IDs or owners are invented. Missing categories block submission with an explanatory state. This endpoint is read-only and restricted to EMPLOYEE/AGENT/MANAGER; organization catalog administration remains separate work.

Access tokens remain in memory. Startup restores the session through the HttpOnly refresh cookie before protected routes render. Concurrent 401 responses share one refresh; refreshed identity updates Redux, and rejected sessions return to sign-in with the requested path preserved. Network failures show a retry state. Pages handle loading, empty lists, validation errors, unavailable tickets, and conflicts. Larger route modules load on demand.

Run the backend on `http://localhost:8000` and the frontend on `http://localhost:3000` using each application's `pnpm dev` / `pnpm start:dev` scripts as applicable. The client defaults to that API URL; `VITE_API_URL` can override it. Browser and API origins must match the backend's CORS/cookie configuration. Use an existing ACTIVE employee account and actual configured catalogs.

Frontend verification, from `client/`:

```powershell
pnpm lint
pnpm build
pnpm test:browser
```

The browser test uses an installed Chrome/Edge (or `BROWSER_PATH` pointing to a Chromium executable), Node's native WebSocket support, and the built Vite preview on port 3000. Stop the dev server before running it. It uses isolated API fixtures for deterministic browser interactions, leaves screenshots in the OS temporary directory, and removes its temporary browser profile. It does not use a real account or modify application data. Backend PostgreSQL e2e tests separately verify the actual API contracts and catalog permissions; see [status.md](status.md) for commands and results.

---

### Implemented Manager and Agent/Team Lead Workspace

The operational frontend consumes the existing ticket, assignment, lifecycle, subtask, and history write/read APIs. It does not introduce new mutation authority or database models.

| Route | Purpose |
| --- | --- |
| `/dashboard` | Manager/agent counts derived from authorized current work |
| `/work/intake` | MANAGER-only shared unowned NEW queue |
| `/work/tickets` | Current manager ownership, primary-agent assignments or unfinished-cycle collaboration; optional authorized terminal records |
| `/work/team` | Tickets whose primary team the current AGENT actually leads |
| `/work/tickets/:ticketId` | Authorized current state, actions, current-cycle subtasks, and history |
| `/work/subtasks` | Authorized current incomplete subtasks; optional completed/historical records |
| `/work/subtasks/:subtaskId` | Limited subtask detail and permitted actions, without parent content/history requests |

Managers can claim intake, route owned tickets, choose/clear primary agents, transfer responsibility, edit metadata, perform allowed status transitions, close resolved work, reopen, and create/manage authorized subtasks. Transfer returns to the owned-ticket list, since the former owner loses visibility. Intake alone exposes claim but no metadata, routing, or subtask management controls.

Agents see primary assignments and current collaborating tickets. Collaboration permits parent/history/communication access and work on their own subtask; it grants no ticket metadata/status/routing, resolve/close/reopen or arbitrary subtask powers. The primary agent remains explicitly assigned and needs no subtask. A ticket may have NULL primary agent and several collaborators. Team Lead remains a relationship with existing led-team powers. Ordinary primary assignment grants no extra subtask authority. TeamManager still grants no ticket authority.

Assignment dialogs list real eligible active users. The primary-team picker offers responsible managers only their organizationally managed teams and GLOBAL teams; the API independently enforces the same rule within the assignment transaction. An existing team that is no longer eligible requires explicit selection of an eligible team. Team changes retain the previous agent selection and require explicit clearing/replacement if incompatible; no silent reassignment is introduced. Subtask creation uses separate choices, preserving existing cross-team delegation and collaborator rules. Managers may explicitly leave subtasks unassigned. Team Leads cannot move work across teams, change responsible managers, or reopen tickets. Confirmations cover assignment, transfer, status, reopening, and subtask updates. Resolution summaries and reopening reasons are requester-visible. Standard 409 conflicts freeze submission and require explicit reload; no write is automatically retried on conflict.

History reuses the employee cycle renderer with independently authorized support work. Communication streams show current and frozen historical records. Standalone subtask detail exposes no parent content, but offers an Open parent ticket link when the server's parentVisible hint authorizes it. Historical subtask-only access remains limited. Subtask assignment never changes the explicit primary agent, and previous-cycle participation never expands active queues.

The existing administrative organization/user APIs are not called for operational pickers. Three small read-only projections fill the missing UI context:

| Endpoint | Restricted projection |
| --- | --- |
| `GET /ticket-workspace` | Current caller's led-team IDs/names only |
| `GET /ticket-workspace/tickets/:ticketId` | Actions/statuses from existing policies and eligible manager/team/agent choices for an authorized ticket |
| `GET /ticket-workspace/subtasks/:subtaskId` | Authorized subtask fields/display names, historical/frozen flags, actions, and eligible assignment choices; no parent content |

All three require MANAGER or AGENT authentication. Resource projections reuse existing visibility predicates and authorization methods. Ticket/subtask context reads use a consistent database snapshot. Options contain only team IDs/names and active eligible user IDs/usernames; ordinary agents get no assignee directory and Team Leads get only the authorized team. Terminal work returns no assignment choices. These are current presentation hints, not grants: existing transactional mutation checks remain authoritative after any concurrent change.

`pnpm test:browser` runs Employee, operational and administration suites. Communication coverage includes requester/support posting, own editing, internal-note separation, collaborator controls, frozen history, waiting replies and draft recovery across failures/reopening. Existing lifecycle, organization, mobile, session and error flows remain covered. Browser tests use isolated API fixtures; PostgreSQL e2e separately exercises actual authorization and atomicity. No browser-to-live-database coverage is claimed.

ADMIN/SUPER_ADMIN account and supported organization management are implemented in the dedicated administration workspace below. Persistent in-app notifications are implemented in the shared shell. My Work History is implemented. The remaining roadmap, in order, is automatic RESOLVED -> CLOSED behavior, general polish/stabilization, and AI routing/recommendations. Generic audits and SSO/SCIM remain deferred.

---

### Administration Workspace

ADMIN and SUPER_ADMIN use a dedicated administration navigation with `/admin`, `/admin/accounts`, `/admin/organization`, and `/admin/organization/teams/:teamId`. Their dashboard opens `/admin`; the old `/users` URL redirects to the protected accounts route. EMPLOYEE/AGENT/MANAGER cannot enter these routes. Administration never loads ticket queues, details, history, or support subtasks.

The account directory displays username, email, role, ACTIVE/INACTIVE status, and existing nullable region/department labels. Search and status filtering operate on the authorized directory. Creation requires a username, email, password of at least eight characters, and an explicitly chosen permitted role. SUPER_ADMIN can create ADMIN/MANAGER/AGENT/EMPLOYEE; ADMIN can create MANAGER/AGENT/EMPLOYEE. No normal workflow creates SUPER_ADMIN or offers public registration. The backend SUPER_ADMIN creation matrix was explicitly expanded to these four roles in this phase and is covered by unit/HTTP tests.

Activation/deactivation uses the existing lifecycle API and authority matrix. Confirmation explains administrative offboarding of current responsibilities, preservation of historical attribution, and that no replacements are selected. Reactivation explicitly requires fresh sign-in and does not restore previous sessions or responsibilities. The resulting account status is refreshed from the directory. There is no delete-user control, operational preview, or replacement-person picker. Account creation also participates in existing access-token renewal; only session/bootstrap endpoints bypass the ordinary 401 retry mechanism.

Organization controls use existing mutations only:

| Concept | Available UI |
| --- | --- |
| Regions / departments / specialties | List and create |
| Teams | List, create with explicit REGION/GLOBAL coverage, view details |
| Membership | Add active AGENT members; remove members after clearing any Team Lead responsibility |
| Team Lead | Assign/replace an active member who leads no other team; explicitly remove |
| TeamManager | Assign an active MANAGER when vacant; explicitly remove before replacement |
| Team specialties | Display existing links only |

GLOBAL creation omits regionId; REGION creation requires one actual region. No organization records or relationships are invented. Agents can join multiple teams and managers can manage multiple teams. TeamManager remains organizational only, with no ticket authority. Team member removal consumes the current backend behavior; it is not an offboarding/assignment-transfer workflow.

The only read changes are nullable region/department ID/name projections on GET /users and member userId plus user ID/username/role/status on GET /organization/teams. Existing administrative guards remain; no new endpoints or operational data are exposed.

The current backend has no rename/delete APIs for regions, departments, specialties or teams; no team coverage update; no specialty-link mutations; and no account identity/role/home-organization editing API. Those controls are deliberately absent. Broader membership/organization lifecycle rules, including reconciliation of retained work after membership removal, remain separate design work. This phase adds no organization mutation or migration.

Administration uses shared loading/error states and native confirmation dialogs, explicit 403/404/409 reload, disabled pending controls, validation, empty states, and responsive layouts. `pnpm test:browser` now runs Employee, operational, and administration suites sequentially. Administration acceptance covers both creation/lifecycle matrices, every organization operation exposed above, relationship restrictions, route isolation, token renewal, error recovery, and mobile layout. Browser fixtures remain isolated from actual application data; PostgreSQL tests separately verify real backend contracts and authorization.

---

## Frontend / Backend Communication

The frontend communicates with the backend using HTTP REST APIs.

Development:

```text
React
localhost:3000
      │
      │ HTTP
      ▼
NestJS
localhost:8000
      │
      ▼
PostgreSQL
```

The frontend must never directly access PostgreSQL.

The backend is responsible for:

- Business logic
- Authentication
- Authorization
- Database access
- AI integration
- Notifications
- Validation

---

## Database

PostgreSQL is the primary database.

An ORM will be used to interact with the database.

The project uses PostgreSQL with Prisma.

Conceptual entities include:

```text
User, Region, Department, Specialty
Team, TeamMember, TeamManager, UserSpecialty, TeamSpecialty
TicketCategory, TicketTag, Ticket, TicketWorkCycle, TicketRegion, TicketDepartment
TicketTagOnTicket, TicketSuggestedTag, Subtask
RefreshToken
```

These entities exist in Prisma. Ticket.assignedManagerId is an explicit nullable User relation with restrictive deletion. The manager migration leaves existing rows NULL without inference; non-NEW managerless development rows require explicit reconciliation if they need manager operations.

Nullable organization and assignment fields are intentional. NULL means unknown, not assigned, not configured, or not applicable. The application must not replace NULL with fabricated users, teams, regions, departments, or routing defaults.

---

## Environment Variables

Environment-specific configuration should use environment variables.

Potential variables include:

```text
PORT
DATABASE_URL
JWT_SECRET
JWT_REFRESH_SECRET
AI_API_KEY
```

Secrets must never be committed to Git.

`.env` files containing secrets must be included in `.gitignore`.

A `.env.example` file should eventually document required variables without containing real secrets.

---

## Development Phases

### Phase 1 — Authentication & Users

Focus on understanding the backend and implementing authentication.

Planned tasks:

1. Understand NestJS project structure
2. Understand NestJS modules
3. Set up PostgreSQL
4. Select/configure ORM
5. Create User model
6. Create Role enum
7. Create Users module
8. Create Auth module
9. Implement initial `SUPER_ADMIN` bootstrap/setup
10. Implement admin-provisioned account creation
11. Implement password hashing
12. Implement login
13. Implement JWT access tokens
14. Implement refresh tokens
15. Implement protected routes
16. Implement RBAC and server-side role hierarchy enforcement
17. Create basic frontend authentication pages
18. Connect frontend authentication to backend

Do not implement the entire phase at once.

Work incrementally.

### Phase 2 — Organization & Authorization

Focus on implementing the approved server-side authorization model:

- Team and Team Lead management rules
- Explicit responsible-manager ownership and shared NEW intake
- Direct agent and Team Lead visibility
- Employee own-ticket access
- Ticket and subtask authorization
- Controlled organization provisioning and NULL handling

### Phase 3 — Ticket System

Focus on:

- Ticket model
- Ticket creation
- Ticket listing
- Ticket details
- Categories
- Priorities
- Statuses
- Assignment
- Comments
- Ticket lifecycle
- Subtasks and managed tags

### Phase 4 — Notifications

Focus on:

- Internal notifications
- Notification database model
- Read/unread state
- Notification UI
- Implemented with explicit REST refresh; realtime delivery remains deferred

### Remaining Roadmap

1. Automatic RESOLVED -> CLOSED behavior
2. General polish/stabilization
3. AI routing/recommendations

AI recommendations include categorization, priority and agent suggestions, confidence scores, reasoning, and manager review. Secure attachments and author-controlled communication soft deletion are implemented.

### Optional Deferred Features

Realtime transport, generic audit infrastructure, SSO/SCIM, notification preferences and retention, pagination outside My Work History, analytics, SLA tracking, advanced permissions, and further AI automation remain deferred.


---

## Git Workflow

The project uses Git and GitHub.

The main development branch is:

```text
development
```

Meaningful milestones should be committed.

Use Conventional Commit messages where possible.

Examples:

```text
chore: initialize project structure

docs: record initial architecture decisions

feat: implement user registration

feat: add jwt authentication

feat: add role based authorization

feat: create ticket module

feat: add ticket assignment

feat: add internal notifications

fix: resolve authentication error

refactor: simplify auth service
```

Avoid meaningless commits such as:

```text
update
changes
stuff
final
test
```

Commits should represent meaningful changes.

---

## Rules for AI Assistants

This repository will be developed with AI coding tools such as GitHub Copilot.

AI assistants must follow these rules.

### 1. Read the documentation first

Before making significant changes, read:

```text
README.md
docs/decision.md
```

These documents describe the project's requirements and architectural decisions.

### 2. Understand existing code before modifying it

Inspect the relevant files before making changes.

Do not assume the project is empty.

Do not overwrite working code unnecessarily.

### 3. Work incrementally

Prefer this workflow:

```text
Explain
   ↓
Implement a small piece
   ↓
Run/test it
   ↓
Explain the result
   ↓
Continue
```

Do not implement an entire major feature in one step unless explicitly requested.

### 4. Teach backend concepts

The developer has limited backend experience.

When introducing an important backend concept, explain:

- What it is
- Why it is needed
- Where it belongs
- How it interacts with other parts of the application

Do not hide important concepts behind generated code.

### 5. Do not introduce unnecessary technologies

Do not add new frameworks, libraries, services, or architectural patterns without a clear reason.

Do not introduce:

- Clerk
- Another authentication provider
- Another backend framework
- Another ORM
- A new frontend framework
- A new state-management library
- A UI framework

unless explicitly approved.

### 6. Do not make major architectural decisions silently

Discuss major changes involving:

- Authentication
- Authorization
- Database design
- User roles
- Ticket lifecycle
- API design
- AI workflow
- Project structure
- Major dependencies
- Infrastructure

before implementing them if they conflict with existing decisions.

### 7. Respect existing decisions

Important architectural decisions are documented in:

```text
docs/decision.md
```

Do not silently contradict that file.

If a new requirement conflicts with an existing decision, explain the conflict before changing the architecture.

### 8. Avoid premature optimization

Do not build advanced infrastructure before the core application works.

For example, do not implement:

- Complex caching
- Microservices
- Kubernetes
- Advanced event-driven architecture
- Complicated AI agents

unless the project actually requires them.

The goal is a realistic application, not unnecessary complexity.

### 9. Keep code maintainable

Prefer:

- Clear names
- Small functions
- Single responsibilities
- Type safety
- Proper validation
- Clear error handling
- Reusable components where appropriate

### 10. Do not implement future phases prematurely

The project is intentionally divided into phases.

If the current phase is authentication, do not start implementing the complete ticket system unless explicitly requested.

---

## Documentation

The repository uses two primary documentation files.

### README.md

Contains:

- Project overview
- Requirements
- Technology stack
- Architecture
- Roles
- Workflows
- Development phases
- AI assistant rules

This is the primary high-level project reference.

### docs/decision.md

Contains important architectural decisions and the reasoning behind them.

Whenever a significant architectural decision is made, update this file.

---

## Important Reminder

This is a real-world full-stack learning project.

The objective is:

```text
Build a real application
+
Understand how it works
+
Learn backend development
+
Learn production-style architecture
```

Do not optimize for writing the most code as quickly as possible.

Optimize for building a solid application while understanding the decisions behind it.

---

## Project Status

Live implementation progress, validation results, and the next task are tracked in [status.md](status.md).

## My Work History

`/work-history` is available to MANAGER and AGENT (including agents who are Team Leads). `GET /my-work-history` is an authenticated, limited personal historical projection, not a ticket-visibility rule. EMPLOYEE keeps request history; ADMIN/SUPER_ADMIN do not receive support history. The caller comes exclusively from the authenticated identity; user selectors and unknown query fields are rejected.

Evidence and row semantics:

- One row per ended TicketWorkCycle (`endedAt` and `outcome` present), combining all matching contributions: `endingManagerId` / `endingAgentId` only when `ownershipSnapshotBasis=END_OF_WORK`, `endedById`, timestamped `closedById`, and `startedById` on REOPENED cycles. Reopen attribution appears once that cycle ends. Original-cycle creation is not support history.
- Separate rows for Subtasks currently marked COMPLETED with both `completedById` equal to the caller and `completedAt` present, including completed tasks in ongoing cycles. Assignment alone never proves completion. Multiple completed tasks are distinct pieces of work; they do not duplicate the cycle row.
- Migration-time ownership snapshots are not treated as proof of ending responsibility. Unknown actors remain unknown. The system does not preserve every intermediate within-cycle ownership assignment. Brief ownership or collaboration that left no durable evidence is absent; no missing historical participation is invented. Existing within-cycle subtask reopening can clear completion attribution; there is no completion-event archive or assignment-event stream.

Projection fields are `kind` (CYCLE/SUBTASK), row `id`, `ticketId`, `cycleId`, `sequenceNumber`, `cycleType`, `outcome`, `activityAt`, `contributions`, `subtaskTitle`, `subtaskStatus`, and `canOpenTicket`. Subtask fields are null for cycle rows. No current ticket title, description, requester identity, current owners, affected organizations, category, messages, notes, files or notifications are selected. Completed subtask titles are retained task labels, not immutable title snapshots.

`canOpenTicket` is a current, advisory check of the existing TicketVisibilityService policy for only the returned page. It offers the normal ticket route when allowed. Historical-only records remain visible without a link. Every detail/communication/download route continues to authorize independently, including manual navigation or access lost after the history read. Membership, Team Lead status and former collaboration create no history by themselves. Deactivation does not rewrite evidence; inactive accounts cannot authenticate. Reactivation restores no responsibilities and retains the existing normal visibility rules (including manager intake visibility).

Query parameters: `page` (default 1, range 1..1,000,000), `pageSize` (default 25, range 1..100), optional `contribution` (`RESPONSIBLE_MANAGER`, `PRIMARY_AGENT`, `ENDED_WORK`, `CLOSED_WORK`, `REOPENED_WORK`, `COMPLETED_SUBTASK`), and inclusive ISO `from` / `to`. Invalid values and reversed ranges return 400. Date-only API bounds mean UTC midnight; the UI submits UTC start/end-of-day bounds. Cycle activity is its endedAt, or the caller's later closedAt; task activity is completedAt. Reopen labels describe participation in the ended cycle, not a separate chronological event.

Pagination uses parameterized SQL UNION ALL, database filtering and deterministic `activityAt DESC, kind DESC, id DESC`, with LIMIT pageSize+1 / OFFSET. The response is `{ items, page, pageSize, hasMore }`; there is no full-history load or count. The page and current-access hint share a repeatable-read snapshot. Offset pages are deterministic for unchanged data; new completions/closure or cleared within-cycle completion can shift pages between requests. Deep offsets still cost database work. Pagination elsewhere is unchanged.

Migration `20260925160000_work_history_indexes` adds five actor/ending-time/id indexes to TicketWorkCycle and a completer/completion-time/id index to Subtask. It creates no history table or historical records. History reads produce no notifications or mutations. Auto-close and demo/deployment infrastructure remain deferred.
