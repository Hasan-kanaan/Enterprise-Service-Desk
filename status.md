# Project Status

This file tracks changing project progress. The [README.md](README.md) remains the stable reference for the project's purpose, architecture, rules, and intended behavior.

## Current Phase

**Phase 1: Authentication & Users**

## Completed

- Project structure and technology stack reviewed
- NestJS `UsersModule` and `AuthModule` created
- In-memory user storage added for the learning stage
- Previous four-role authentication prototype implemented: `EMPLOYEE`, `AGENT`, `MANAGER`, `ADMIN`
- Previous public registration and login prototype implemented
- DTO validation added for the previous authentication prototype
- Passwords hashed with `bcryptjs`
- JWT access-token generation implemented
- `AuthGuard` added for Bearer-token validation
- `RolesGuard` and `@Roles()` decorator added for RBAC
- Protected example route added: `GET /users/profile`
- Auth unit tests pass: 2 suites and 4 tests
- NestJS build passes
- Previous prototype live validation passed:
  - Valid JWT grants access to the protected profile route
  - Missing JWT returns `401 Unauthorized`
  - Invalid JWT returns `401 Unauthorized`
- PostgreSQL development database added with Docker Compose
- Prisma 7 installed and configured for the server
- Prisma datasource connected to the local PostgreSQL database
- Database connection verified; database is intentionally empty because no application models or migrations have been created yet
- Prisma `User` model created with role enum, unique email, password hash storage, and timestamps
- Initial Prisma migration created and applied successfully
- `PrismaService` and global `PrismaModule` added for PostgreSQL access
- `UsersService` migrated from in-memory storage to Prisma queries
- Authentication updated to await database-backed user operations
- Prisma adapter dependencies declared for the server package
- Unique username added to registration, authentication responses, and the persisted `User` model
- Username migration created and applied successfully
- Previous prototype live PostgreSQL validation passed:
  - Registration creates a user with a username
  - Login succeeds with the registered email and password
  - Duplicate email returns `409 Conflict`
  - Duplicate username returns `409 Conflict`
  - Missing JWT returns `401 Unauthorized`
  - Valid JWT grants access to the protected profile route
  - User remains available after the server restarts
- Account provisioning and role hierarchy finalized architecturally: `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `AGENT`, `EMPLOYEE`
- Five-role Prisma and application enum implemented
- `SUPER_ADMIN` role migration created and applied successfully
- Public `POST /auth/register` endpoint removed
- Login preserved for existing database users with JWT access-token generation
- Authentication tests updated to cover login and all five roles
- `GET /auth/setup/status` added for bootstrap availability checks
- `POST /auth/setup` added to create the first `SUPER_ADMIN`
- Bootstrap passwords are hashed with the existing bcrypt mechanism
- Bootstrap permanently locks after the first `SUPER_ADMIN` exists
- PostgreSQL advisory transaction locking added to protect bootstrap against concurrent requests
- Live bootstrap validation passed: setup status, first `SUPER_ADMIN` creation, permanent lock, duplicate setup rejection, and login
- `POST /auth/accounts` added for authenticated account provisioning
- `SUPER_ADMIN` is restricted to creating `ADMIN` accounts
- `ADMIN` is restricted to creating `EMPLOYEE`, `AGENT`, and `MANAGER` accounts
- Account passwords are hashed before persistence and requested roles are validated server-side
- Authentication tests updated for account provisioning and RBAC hierarchy
- Live Phase B validation passed for all permitted creation paths and forbidden `SUPER_ADMIN` escalation
- Persistent `RefreshToken` model added with hashed token storage, expiry, revocation, and user relation
- Login now returns an access token and opaque refresh token
- `POST /auth/refresh` added with refresh-token rotation
- `POST /auth/logout` added with refresh-token invalidation
- Replayed, revoked, and expired refresh tokens are rejected
- Authentication tests updated for refresh rotation, replay rejection, and logout invalidation
- Live Phase C validation passed for token issuance, protected access, rotation, replay rejection, and logout
- Frontend dependencies and Tailwind foundation configured
- Frontend routing and responsive application shell added
- Initial login, setup, dashboard, account directory, profile, placeholder, and 404 page surfaces added
- Redux Toolkit auth state and Axios API client added
- Login and initial setup forms connected to backend endpoints with React Hook Form and Zod validation
- Access JWT is kept in memory only; refresh sessions use HttpOnly cookies
- Axios refresh retry and expired-session redirect behavior added
- Backend CORS and HttpOnly refresh-cookie transport aligned with frontend integration
- Account-management API service and live directory connected to the frontend
- Role-aware create-account dialog connected to `POST /auth/accounts`
- Unauthenticated `GET /users` enumeration vulnerability fixed with server-side RBAC
- Live security validation passed: unauthenticated account listing returns `401`, authorized listing succeeds
- Role-aware application-shell navigation added for all five roles
- Logout action connected to backend refresh-session revocation
- Profile surface now displays the authenticated Redux user
- Setup page reflects live bootstrap availability and locked-complete state
- Login and setup API errors now show backend-provided messages where available
- Account directory distinguishes loading, empty, and retryable failure states
- README guidance and project status have been separated into this file

## Current Work

The previous public-registration prototype has been removed from the authentication surface. Login remains available for existing database users, and the application now recognizes the finalized five-role model.

The one-time `SUPER_ADMIN` bootstrap is implemented and locked after first use. Authenticated account provisioning, the server-side role hierarchy, refresh tokens, and logout/token invalidation are implemented.

The frontend authentication foundation, account-management directory, role-aware navigation, profile identity, logout, and polished loading/error states are connected to the backend. Access state is memory-only, refresh sessions use the backend HttpOnly cookie, and account creation options follow the current role hierarchy.

## Next Steps

1. Continue with the next approved service-desk frontend surface

## Useful Validation Commands

From the `server` directory:

```powershell
docker compose ps
pnpm prisma validate
pnpm prisma migrate status
pnpm test -- --runInBand
pnpm build
```

The backend runs on `http://localhost:8000`. The frontend runs on `http://localhost:3000`.

## Security Notes

- Never commit real JWT secrets or other credentials.
- Configure `JWT_SECRET` through environment variables before deployment.
- Do not treat the development JWT fallback secret as production-safe.
- Do not store plaintext passwords or refresh tokens in persistent storage.
- In-memory storage is temporary and is not suitable for production.
