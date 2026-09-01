# Enterprise Service Desk

An AI-powered full-stack Enterprise IT Service Desk built as a real-world learning project.

The application simulates an internal IT support platform for a large company. Employees can submit IT support tickets, support agents can work on those tickets, managers can oversee and assign tickets, and administrators can manage the system.

AI is integrated into the workflow to assist with ticket categorization, priority selection, and agent assignment.

The goal is not only to build a functional application, but also to gain practical full-stack development experience while learning backend development gradually.

---

## Table of Contents

- [Project Goals](#project-goals)
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
- [Attachments](#attachments)
- [Audit History](#audit-history)
- [Backend Architecture](#backend-architecture)
- [Frontend Architecture](#frontend-architecture)
- [Database](#database)
- [Environment Variables](#environment-variables)
- [Development Phases](#development-phases)
- [Git Workflow](#git-workflow)
- [Rules for AI Assistants](#rules-for-ai-assistants)
- [Current Project State](#current-project-state)
- [Immediate Next Step](#immediate-next-step)

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

Employees, agents, managers, and administrators are NOT separate user entities.

A user's role determines what they are allowed to do.

Available roles:

```text
EMPLOYEE
AGENT
MANAGER
ADMIN
```

### EMPLOYEE

Employees are normal company users.

They can:

- Register an account
- Login
- Create tickets
- View their own tickets
- Comment on their tickets
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

Agents are members of the support team.

They can:

- Login
- View tickets assigned to them
- View ticket information
- Comment on tickets
- Change ticket status
- Resolve tickets
- Receive internal notifications

Agents should receive an internal notification when a ticket is assigned to them.

Agents do NOT need email notifications when a ticket is assigned.

Agents cannot normally assign or reassign tickets unless that permission is explicitly added later.

### MANAGER

Managers supervise the support operation.

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

Managers remain responsible for ticket assignment during the initial AI implementation.

### ADMIN

Administrators manage the system.

They can:

- Create users
- Create employee accounts
- Create agent accounts
- Create manager accounts
- Manage users
- Manage roles
- Manage departments
- Manage system configuration

The intended administrative model is:

```text
ADMIN
  │
  ├── creates EMPLOYEE accounts
  ├── creates AGENT accounts
  └── creates MANAGER accounts
```

Employees will also be allowed to register themselves.

The exact interaction between self-registration and administrator-created accounts will be finalized during authentication design.

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
EMPLOYEE
AGENT
MANAGER
ADMIN
```

We intentionally do not create separate:

```text
Employee
Agent
Manager
Admin
```

entities.

This keeps authentication, authorization, and user management simpler.

If role-specific fields are required later, they can be added without creating separate authentication systems.

---

## Authentication

Authentication will be implemented by the application itself.

Do NOT use Clerk or another external authentication provider unless explicitly decided later.

The planned authentication system includes:

- Employee registration
- Login
- Password hashing
- JWT access tokens
- Refresh tokens
- Protected routes
- Role-based authorization
- Logout/token invalidation strategy

Passwords must never be stored in plaintext.

Refresh tokens should not be stored in plaintext in persistent storage.

Authentication will be implemented gradually during Phase 1.

---

## Authorization

Authorization will use Role-Based Access Control (RBAC).

Conceptually:

```text
EMPLOYEE
    │
    └── Create and manage own tickets

AGENT
    │
    └── Work on assigned tickets

MANAGER
    │
    └── Assign and manage tickets

ADMIN
    │
    └── Manage users and system configuration
```

NestJS Guards will eventually be used to protect endpoints based on authentication and roles.

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
- Department
- Category
- Priority
- Status
- Assigned agent
- AI recommendation
- Comments
- Attachments
- Created timestamp
- Updated timestamp
- Resolved timestamp
- Closed timestamp

The final database schema will be designed before implementation.

Do not add unnecessary fields without a reason.

---

## Ticket Status Lifecycle

Tickets use the following statuses:

```text
NEW
ASSIGNED
IN_PROGRESS
WAITING_FOR_EMPLOYEE
RESOLVED
CLOSED
```

### NEW

The employee has created the ticket.

The ticket has not yet been assigned to an agent.

```text
Employee creates ticket
        ↓
NEW
```

### ASSIGNED

The ticket has been assigned to an agent.

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

The exact reopening workflow will be designed when the ticket system is implemented.

---

## Ticket Workflow

The general lifecycle is:

```text
Employee
   │
   │ Creates ticket
   ▼
NEW
   │
   │ AI analyzes ticket
   ▼
AI Recommendation
   │
   │ Manager reviews
   ▼
ASSIGNED
   │
   │ Agent starts work
   ▼
IN_PROGRESS
   │
   ├────────────────┐
   │                │
   │ Need info      │ Issue fixed
   ▼                ▼
WAITING_FOR_       RESOLVED
EMPLOYEE              │
   │                  │ Employee confirms
   │ Employee         │
   │ responds         │
   ▼                  ▼
IN_PROGRESS         CLOSED
```

The exact allowed status transitions will be enforced by the backend.

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

AI is a core part of the application.

AI should be considered during the initial system architecture rather than added as an afterthought.

When a ticket is created, AI may analyze it and provide:

- Suggested category
- Suggested priority
- Suggested agent
- Confidence score
- Reason for the recommendation

The initial workflow is:

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

Tickets belong to departments.

Initial departments may include:

```text
IT
HR
Finance
Facilities
Security
```

The system should support adding additional departments later.

Departments may eventually have their own categories and support teams.

---

## Comments

Tickets have a conversation/comment system.

Employees and agents can communicate through ticket comments.

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

This is important for an enterprise system because managers and administrators should be able to understand what happened to a ticket.

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

DTOs will eventually be used with NestJS validation.

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

PostgreSQL is the planned primary database.

An ORM will be used to interact with the database.

The exact ORM and schema will be selected during backend setup.

Conceptual entities include:

```text
User
Department
Ticket
TicketComment
Notification
ActivityLog
Attachment
```

These are conceptual entities and are NOT the final schema.

The database schema should be designed carefully before implementation.

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
9. Implement registration
10. Implement password hashing
11. Implement login
12. Implement JWT access tokens
13. Implement refresh tokens
14. Implement protected routes
15. Implement RBAC
16. Create basic frontend authentication pages
17. Connect frontend authentication to backend

Do not implement the entire phase at once.

Work incrementally.

### Phase 2 — Users & Departments

Focus on:

- User management
- Departments
- Admin functionality
- Manager functionality
- User/department relationships

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
docs/DECISIONS.md
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
docs/DECISIONS.md
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

### docs/DECISIONS.md

Contains important architectural decisions and the reasoning behind them.

Whenever a significant architectural decision is made, update this file.

---

## Current Project State

The project is currently in Phase 1: Authentication & Users.

Current state:

```text
Frontend:
React + Vite + TypeScript

Backend:
NestJS + TypeScript

Package Manager:
pnpm

Frontend:
localhost:3000

Backend:
localhost:8000

Git:
development branch

Authentication:
✅ JWT-based authentication implemented
   - User registration with email & password
   - Secure password hashing (bcryptjs)
   - Login with JWT token generation
   - Protected routes with Bearer token validation
   - Role-based access control (RBAC)
   - Unit tests passing

Database:
⏳ PostgreSQL not yet connected
   (In-memory storage for Phase 1 learning)

Users:
✅ User model defined with roles
   - EMPLOYEE, AGENT, MANAGER, ADMIN roles
   - Registration and login endpoints
   - User data in memory (temporary)

Tickets:
Not started (Phase 3)

Notifications:
Not started (Phase 4)

Email:
Not started (Phase 5)

AI:
Not started (Phase 6)
```

The frontend and backend applications are ready for development.
Authentication foundation is complete and tested.
Next step: PostgreSQL database integration.

---

## Immediate Next Step

The immediate goal is:

```text
PHASE 1 — AUTHENTICATION & USERS

✅ Authentication foundation is COMPLETE
   (Registration, Login, JWT Tokens, Protected Routes, RBAC)

→ Next: PostgreSQL Database Integration
```

The authentication system is working end-to-end:

```text
Register a user           → POST /auth/register
                            Returns: accessToken (JWT)

Call a protected route    → GET /users/profile
  with Bearer token         (requires Authorization header)
                            Returns: User profile data

Without token or
invalid token            → Returns: 401 Unauthorized
```

The next phase is to connect PostgreSQL to the backend so user data persists across server restarts.

The flow will be:

```text
1. Set up PostgreSQL locally (or Docker)
2. Configure an ORM (TypeORM or Prisma)
3. Create User entity with database schema
4. Replace in-memory UsersService with database queries
5. Test that registration and login still work with real DB persistence
6. Move on to Phase 2: User Management & Departments
```

Each step will be completed and tested before moving to the next.

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

## Current Work Status

This section tracks the live progress of the project so we always know what is complete, what is in progress, and what comes next.

### Completed

- ✅ Project repository structure reviewed and understood
- ✅ Frontend and backend apps confirmed as separate applications
- ✅ Project architecture aligned with the README and decision documents
- ✅ NestJS starter app understood
- ✅ `UsersModule` created with in-memory user storage
- ✅ `AuthModule` created with registration and login endpoints
- ✅ User role enum (`EMPLOYEE`, `AGENT`, `MANAGER`, `ADMIN`)
- ✅ Registration DTOs and login DTOs with validation
- ✅ Password hashing with bcryptjs
- ✅ JWT token generation with `@nestjs/jwt`
- ✅ `AuthGuard` implemented to verify Bearer tokens
- ✅ `RolesGuard` implemented for role-based authorization
- ✅ Protected route example (`GET /users/profile`) with RBAC
- ✅ Jest unit tests for auth service (register, login, error cases)
- ✅ NestJS build and test suite passing
- ✅ Live end-to-end validation:
  - Register endpoint returns valid JWT token
  - Protected route accepts Bearer token and returns user profile
  - Missing token returns 401 Unauthorized
  - Invalid token returns 401 Unauthorized

### In Progress

- Phase 1: Authentication & Users

### Next Up

1. **Database Integration**: Connect to PostgreSQL and set up ORM (TypeORM or Prisma)
2. **User Persistence**: Replace in-memory storage with real database persistence
3. **Refresh Tokens**: Implement refresh token flow for long-lived sessions
4. **Token Invalidation**: Add logout/token blacklist mechanism
5. **Frontend Auth Pages**: Create login and registration UI in React
6. **Frontend API Integration**: Connect frontend auth forms to backend endpoints
7. **Session Management**: Add session state management on the frontend
8. **Advanced RBAC**: Expand role-based endpoint protection across the system

### Current Phase

Phase 1: Authentication & Users

**What we've built:**
- A complete, working authentication system with JWT tokens and RBAC
- User registration with email and password validation
- Secure password hashing with bcrypt
- Protected routes that verify JWT tokens and enforce role-based access
- In-memory user storage (for learning; will connect to PostgreSQL next)

**What's ready for testing:**
- Register a user: `POST /auth/register`
- Login: `POST /auth/login`
- Protected profile endpoint: `GET /users/profile` (requires Bearer token)

**Security features in place:**
- Passwords hashed with bcryptjs (never stored in plaintext)
- JWT tokens signed with a secret
- Bearer token validation on protected routes
- Role-based authorization with guards
- Input validation on all auth endpoints

**Next major milestone:**
Connect to a real PostgreSQL database so user data persists across server restarts.
