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
- [Internal Notes (Planned)](#internal-notes-planned)
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
- Email notifications
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
- Receive relevant email notifications
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

Agents see tickets assigned directly to them. Team membership alone does not grant access to every ticket belonging to the team. An AGENT may optionally be designated as Team Lead for one team; Team Lead is a responsibility, not a new role, and grants team-level operational visibility for that team.

Agents should receive an internal notification when a ticket is assigned to them.

Agents do NOT need email notifications when a ticket is assigned.

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

Employee/support conversation participation is planned, subject to ticket authorization; conversations are not implemented.

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
- Create and manage `ADMIN` accounts
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
SUPER_ADMIN creates ADMIN accounts
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

The responsible manager may select any real team, independent of TeamManager. Only that manager may transfer responsibility to another manager. Transfer changes no team, agent, status, or timestamps. Team Leads can assign agents only within their ticket's currently led primary team.

PATCH omission preserves ownership; explicit NULL clears only where permitted. Changing teams with an incompatible retained agent is rejected unless the caller explicitly clears/replaces the agent. Ordinary assignment cannot clear manager or primary team. Special reopening and administrative manager offboarding can explicitly return a ticket to empty NEW intake. No defaults or automatic routing are created.

### Implemented Ticket API

All routes require authentication. ADMIN and SUPER_ADMIN are denied all ticket/subtask routes.

| Route | Purpose |
| --- | --- |
| GET /tickets, GET /tickets/:ticketId | Filtered ticket reads |
| POST /tickets | Employee creation with NULL ownership |
| PATCH /tickets/:ticketId | Relationship-authorized metadata edits |
| PATCH /tickets/:ticketId/manager | Initial ownership / transfer; body: assignedManagerId |
| PATCH /tickets/:ticketId/assignment | Team/agent assignment; body: optional teamId, agentId |
| PATCH /tickets/:ticketId/status | Authorized transition; optional resolutionSummary only when resolving |
| POST /tickets/:ticketId/cancel | Employee requester; NEW/ASSIGNED only |
| POST /tickets/:ticketId/reopen | Requester/responsible manager; required reason |
| GET /tickets/:ticketId/history | Currently authorized cycle history with separately filtered subtasks |
| GET /tickets/subtasks | Caller-visible subtask list |
| GET /tickets/subtasks/:subtaskId | Caller-visible subtask detail |
| GET /tickets/:ticketId/subtasks | Caller-visible subset under a parent |
| POST /tickets/:ticketId/subtasks | Responsible-manager or parent-team lead creation |
| PATCH /tickets/subtasks/:subtaskId | Authorized content/status/assignment changes |

Ticket lists return scalar fields. Ticket detail includes scope/tag IDs, ownership summaries, and the latest work-cycle summary. History is a separate, authorized endpoint. Subtask reads never include parent-ticket content. There is no frontend ticket integration or category/tag catalog API yet.

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

Work-cycle history is implemented product history. A generic audit log, conversations, private notes, notifications, automatic closure, and frontend ticket pages remain deferred. Future conversations can reference the cycle ID.

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

The application will contain an internal notification system.

Examples include:

```text
Ticket assigned
Ticket reassigned
Employee commented
Agent commented
Ticket resolved
Ticket closed
AI recommendation requires manager review
```

Agents should receive an internal notification when a ticket is assigned.

Email should NOT be used for agent assignment notifications.

---

## Email System

Email will be used for important ticket lifecycle events.

Planned examples include:

```text
Ticket created
Ticket resolved
Ticket closed
Potentially other important lifecycle notifications
```

Internal notifications and email have different purposes.

```text
Internal Notification
=
Application activity / real-time awareness

Email
=
Important lifecycle communication
```

The exact email events will be finalized during implementation.

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

A ticket conversation/comment system is planned and not implemented.

Employees and agents can communicate through ticket comments. Responsible managers may participate subject to the future conversation policy. ADMIN and SUPER_ADMIN have no ticket conversation access.

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

Comments are part of the ticket history.

Comments may also trigger notifications.

---

## Internal Notes (Planned)

Internal notes are separate from employee-visible conversations. They will be multiple historical records with id, ticketId, authorId, content, and createdAt, not a mutable note string on Ticket. Editing/revision history and terminal-ticket behavior still need design.

Notes are general-purpose, not tied to BLOCKED. Authorized agents, Team Leads, and managers will have support-only access. Employee, ADMIN, and SUPER_ADMIN responses must never contain note contents. Authorization is server-side. No note model or API is implemented; intake-only manager write permissions remain a future design question.

---

## Attachments

Tickets may eventually support file attachments.

Examples:

- Screenshots
- Error logs
- Images
- Documents

File uploads should not be implemented until the core ticket functionality is stable.

Storage, validation, file size limits, and security will be designed when this feature is introduced.

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
- Email integration
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
EMAIL_HOST
EMAIL_PORT
EMAIL_USER
EMAIL_PASSWORD
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
- Ticket conversation and internal notes

### Phase 4 — Notifications

Focus on:

- Internal notifications
- Notification database model
- Read/unread state
- Notification UI
- Real-time updates if appropriate

### Phase 5 — Email

Focus on:

- Email provider
- Ticket creation emails
- Resolution emails
- Closure emails
- Important lifecycle notifications

### Phase 6 — AI

Focus on:

- AI ticket assistant
- Ticket categorization
- Priority suggestions
- Agent recommendations
- Confidence score
- Recommendation reasoning
- Manager approval workflow

### Phase 7 — AI Automation

Focus on:

- Automatic assignment
- Confidence thresholds
- AI decision logging
- Manager overrides
- Monitoring AI recommendations

### Phase 8 — Enterprise Features

Potential features:

- Attachments
- Audit logs
- Search
- Filtering
- Pagination
- Analytics
- Dashboards
- SLA tracking
- Advanced permissions
- Testing
- Performance improvements

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
