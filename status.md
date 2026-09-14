# Project Status

This file tracks changing project progress. The [README.md](README.md) remains the stable reference for the project's purpose, architecture, rules, and intended behavior.

## Current Phase

**Phase 1: Authentication & Users**

## Completed

- Project structure and technology stack reviewed
- NestJS `UsersModule` and `AuthModule` created
- In-memory user storage added for the learning stage
- User roles defined: `EMPLOYEE`, `AGENT`, `MANAGER`, `ADMIN`
- Registration and login endpoints implemented
- DTO validation added for registration and login
- Passwords hashed with `bcryptjs`
- JWT access-token generation implemented
- `AuthGuard` added for Bearer-token validation
- `RolesGuard` and `@Roles()` decorator added for RBAC
- Protected example route added: `GET /users/profile`
- Auth unit tests pass: 2 suites and 4 tests
- NestJS build passes
- Live validation passed:
  - Valid JWT grants access to the protected profile route
  - Missing JWT returns `401 Unauthorized`
  - Invalid JWT returns `401 Unauthorized`
- README guidance and project status have been separated into this file

## Current Work

Authentication is implemented and validated. The current backend limitation is that users are stored only in memory, so all users are lost when the server restarts.

The most recently reported startup errors were caused by an earlier source state. The current files use direct DTO imports in `auth.controller.ts` and `UserRole` enum values, which resolves those reported TypeScript errors. Run the validation commands below before pushing.

## Next Steps

1. Set up PostgreSQL with Docker
2. Choose and configure the ORM (prisma)
3. Create the persistent `User` entity and schema
4. Replace in-memory `UsersService` operations with database queries
5. Re-test registration, login, protected routes, and duplicate-user handling
6. Add refresh tokens and a logout/token-invalidation strategy
7. Build the frontend login and registration pages
8. Connect the frontend authentication flow to the API

## Useful Validation Commands

From the `server` directory:

```powershell
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
