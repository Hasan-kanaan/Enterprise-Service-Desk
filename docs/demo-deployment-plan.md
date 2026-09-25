# Future Public Demo Deployment Plan

Status: approved direction for a late project phase, not approval to implement demo infrastructure. This note records constraints to preserve while normal product development continues. It does not change application behavior, schemas, authorization, storage, authentication, or dependencies.

## Public demo purpose and core principle

Continue designing the production-shaped application as if it could serve a very large enterprise. Deploy the public portfolio version using intentionally small infrastructure and hard resource limits.

The demo lets recruiters and visitors see and interact with the real system. It is not intended to host a real company or support unlimited public usage. All demo data must be synthetic.

Do not weaken real application authorization or business rules to make the demo easier. Keep demo-specific controls as deployment/environment concerns where possible.

## Deployment direction

The likely eventual deployment shape is:

- React/Vite frontend on a managed static/frontend host.
- NestJS backend on a separate Node-compatible host.
- Managed PostgreSQL.
- Private object/cloud storage for attachments.
- AI provider behind a server-side provider abstraction.
- HTTPS everywhere.
- Secrets only on backend/server infrastructure.

Exact providers are intentionally not selected yet. Local filesystem storage remains valid for development and tests. Production/demo attachments should eventually use object storage through the existing storage abstraction. Do not store attachment binaries in PostgreSQL.

## Domain

A custom domain may be purchased later but is optional. A single purchased domain is sufficient, for example:

- `example.com` serves the frontend.
- `api.example.com` serves the backend.

Do not design around needing separate purchased domains. Provider-generated free URLs must also remain possible.

## Demo users

The eventual demo should contain seeded synthetic personas for `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `AGENT`, and `EMPLOYEE`. Several roles may have multiple users to demonstrate workflows.

Seeded demo identities may later need demo-specific protection from cleanup/reset operations. Do not change current real user lifecycle rules now: application users remain `ACTIVE`/`INACTIVE` and are not physically deleted through normal product APIs.

## Demo-created data

Visitors may eventually create users permitted by their current application role, tickets, messages, notes, attachments, and normal workflow data. Existing application authorization and business rules continue to apply.

Demo/reset infrastructure may later physically clean this visitor-created data. Demo cleanup is separate from normal application deletion and offboarding rules. Do not implement reset or cleanup now.

## Concurrent demo visitors

Multiple users/devices may normally use the same real application account. Do not introduce single-device authentication restrictions.

The eventual public demo may need isolation between unrelated visitors so two recruiters do not interfere with each other's demo data. Temporary demo workspaces, tenants, or sandboxes are one possible future solution: each visitor could receive a seeded temporary workspace that expires and is cleaned later.

This is only a possible final demo architecture and requires careful design and security review. It is not approved for implementation. Do not introduce multi-tenancy into the current product now.

## Demo resource limits

The public demo must eventually have strict limits independent of the enterprise architecture. Potential limits include:

- Maximum demo users.
- Maximum tickets.
- Maximum attachments and total storage usage.
- AI request quotas.
- API rate limits.
- Login rate limits.
- Demo lifetime/expiration.
- Periodic cleanup.

Exact values will be decided during deployment. The purpose is to make abuse unable to create meaningful cost.

## Security requirements

Treat the eventual public demo as hostile internet traffic. Plan for:

- Server-side secrets only.
- Restricted cloud credentials and least-privilege access.
- Private object storage and backend authorization before attachment access.
- Rate limiting.
- Upload limits and type validation.
- Authentication throttling.
- AI quota protection.
- CORS configuration.
- Secure cookies.
- HTTPS.
- A production JWT secret.
- Safe security headers.
- No real customer, company, or personal data.
- Monitoring and logging appropriate for a demo.
- The ability to wipe and reseed a compromised demo environment.

These are future deployment requirements, not a claim that all protections are currently implemented. Frontend hosting DDoS/WAF features alone do not make the demo secure; application-level protections remain required.

## AI demo

The public demo should eventually use real AI where free/demo quota permits. Ticket-creation AI should:

- Be user-triggered before submission.
- Accept rough user text and supported image attachments as input.
- Propose a title.
- Improve the factual issue description.
- Propose a category.
- Not troubleshoot or solve the issue.
- Let the employee review and edit suggestions before ticket creation.

Future routing AI remains a separate workflow. Demo AI usage must eventually have strict server-side quotas so a public user cannot consume unlimited API credits.

## Enterprise scale

The public demo database does not need hundreds of thousands of actual users. Instead, design and test the code with enterprise-scale patterns:

- Pagination.
- Server-side filtering and search.
- Appropriate database indexes.
- Bounded queries.
- Concurrency safety.
- Object storage.
- Asynchronous expensive background work where appropriate.
- No APIs that assume loading an entire huge organization at once.

Large synthetic/load testing can run separately from the hosted demo.

## Timing and implementation boundary

The demo/deployment system is intentionally a late project phase. Continue implementing normal product features first while preserving these constraints.

Until explicitly requested, do not implement:

- Tenancy.
- Demo reset or cleanup jobs.
- A cloud storage adapter.
- Hosting configuration.
- Domain configuration.
- Public-demo security controls.

This documentation does not authorize changes to application behavior, schemas, authorization, storage, authentication, or dependencies.
