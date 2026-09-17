# Project Decisions

## Product

We are building an AI-Powered Enterprise IT Service Desk for internal company support.

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

#### ADMIN

- Organization/system administrator.
- Created by a `SUPER_ADMIN`.
- Can create and manage `EMPLOYEE`, `AGENT`, and `MANAGER` accounts.
- Handles user administration and organization-level system configuration.
- Cannot create `SUPER_ADMIN` or `ADMIN` accounts.

#### MANAGER

- Service-desk manager, not a system administrator.
- Oversees service-desk operations, agents, assignments, escalations, and workflows.
- Reviews and approves or changes AI ticket assignment recommendations.

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

The initial setup must eventually be protected against concurrent requests, must never create a second `SUPER_ADMIN`, and must use the same password-hashing and security standards as normal account creation. These are architectural requirements, not implemented features yet.

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

Agents and Team Leads may resolve tickets. Employees can close resolved tickets, managers may close tickets when the final authorization rules allow it, and a future automation may close a resolved ticket after three business days without employee activity. Closure auditing must distinguish employee-confirmed, manager, and automatic closure.

## Assignment Workflow

AI will be part of the ticket workflow from the beginning.

When a ticket is created, AI may suggest:
- category
- priority
- best agent
- confidence score
- reason

Managers approve or change the suggestion before assignment.

## Organization and Team Management

The five roles remain exactly `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `AGENT`, and `EMPLOYEE`. Team Lead is not a role. It is an optional operational responsibility assigned to an existing `AGENT`.

`Region`, `Department`, `Specialty`, `Team`, and `Ticket` are separate concepts. Users may have nullable home region and department values. Departments are not tied to regions, and an agent's home region does not automatically restrict team membership.

Teams use one of two scopes:

- `REGION`: exactly one region.
- `GLOBAL`: all regions, with no fake global region record.

A team has at most one manager and may have zero or one Team Lead. A manager may manage multiple teams. An agent may belong to multiple teams and may be Team Lead of at most one team at a time. Manager authority is scoped to each managed team; membership in a shared team does not grant a manager authority over the agent in another team.

Teams may have multiple specialties. Team membership, specialty membership, and home region are independent relationships.

## Authorization Design

The approved visibility model is relationship-based and is enforced by reusable server-side visibility and authorization policies. Ticket controllers and endpoint integration are not implemented yet.

- Employees see their own tickets.
- Agents see tickets assigned directly to them and subtasks assigned to them.
- Team Leads see tickets belonging to their team and may coordinate work within that team.
- Managers see tickets belonging to teams they manage.

Team membership alone does not give an agent visibility into every team ticket. Team Leads may create, assign, and reassign subtasks within their team. Managers may assign and reassign tickets and subtasks for teams they manage. No role automatically receives company-wide visibility.

Team Leads and managers do not gain organization-management powers from their operational responsibility. They cannot manage regions, departments, teams, specialties, categories, or tags unless separately authorized.

ADMIN users can manage users and organization configuration but do not have ticket visibility or access to ticket conversations. SUPER_ADMIN retains system-level access as already defined.

## Ticket Ownership and Scope

A ticket has one primary assigned team and at most one primary assigned agent. The assigned agent must have a primary team; a ticket may have an assigned team with no assigned agent. Multiple areas of work are represented by subtasks rather than multiple primary owners.

Requester organization and affected scope are separate. A ticket may affect one or more regions or departments, or explicitly affect all regions or all departments. A global ticket is not automatically visible to every regional manager or agent. Access is determined primarily by the assigned team and the relevant manager or Team Lead relationship.

If a future workflow needs a coordination location for a cross-region ticket, it must use an explicitly configured `defaultOperationalRegion`, which remains NULL until configured. It must never be inferred from the first database record or affected region.

## Subtasks and Messaging

Subtasks are supporting work under one parent ticket. They may have an assigned team and agent, use `TODO`, `IN_PROGRESS`, `COMPLETED`, or `CANCELLED`, and do not nest. Agents may work on subtasks assigned to them but cannot create or assign subtasks. Team Leads and managers may create, assign, and reassign them. Completing or blocking a subtask must not automatically close or block the parent ticket.

Tickets will eventually support employee-visible messages, support-agent messages, and internal notes hidden from employees. Employees and assigned support personnel may participate in their authorized conversations. Managers may view and participate in conversations for tickets within their authorized team scope when intervention or oversight is needed. ADMIN users cannot access ticket conversations. Messaging is planned and is not implemented yet.

## NULL and Data Integrity

NULL means unknown, not assigned, not configured, or not applicable. Existing NULL organization and assignment values must remain NULL until an explicit business rule assigns a real entity. The system must not create fabricated users, teams, regions, departments, or default routing values to replace NULLs. Friendly labels such as `Not assigned` are presentation-only values.

## Frontend Structure

The frontend will use a classic structure:

- components/
- pages/
- hooks/
- services/
- types/

Reason:
This is simpler and easier to understand while learning React TypeScript.