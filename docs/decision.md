# Project Decisions

## Product

We are building an AI-Powered Enterprise IT Service Desk for internal company support.

## User Model

All people in the system are represented by one `User` model.

Roles:
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
- RESOLVED
- CLOSED

Employees can close tickets only after they are resolved.

## Assignment Workflow

AI will be part of the ticket workflow from the beginning.

When a ticket is created, AI may suggest:
- category
- priority
- best agent
- confidence score
- reason

Managers approve or change the suggestion before assignment.

## Frontend Structure

The frontend will use a classic structure:

- components/
- pages/
- hooks/
- services/
- types/

Reason:
This is simpler and easier to understand while learning React TypeScript.