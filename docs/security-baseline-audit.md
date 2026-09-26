# Application security baseline audit — 2026-09-26

Recorded before implementation, from the application source and existing tests.

| Area | Observed baseline / finding |
| --- | --- |
| Authentication | Login already returns `401 Invalid credentials` for unknown, inactive and wrong-password accounts. Unknown/inactive accounts skip bcrypt, creating an avoidable timing distinction. Access tokens are bearer tokens; refresh tokens are random, stored hashed, rotated atomically and session-scoped. |
| Setup | Public status and initial SUPER_ADMIN creation are intentional. A PostgreSQL advisory lock prevents concurrent initialization; setup returns conflict after initialization. No throttling before expensive password hashing. First-admin provisioning must occur in a controlled environment. |
| Cookies | Refresh cookie is HttpOnly, SameSite=Lax, host-only, `/auth`, seven days, Secure in production. Logout clears the same name/path but does not reuse all cookie options. |
| CSRF | Login establishes and refresh/logout consume cookie sessions. SameSite=Lax and fixed CORS already mitigate cross-site use, but CORS does not itself prevent simple requests. No explicit Origin/Referer validation, including same-site untrusted origins. Setup also deserves origin protection. |
| CORS | Fixed `http://localhost:3000` with credentials, not a wildcard. No configurable allowlist; disallowed requests are not explicitly rejected before handlers. |
| Headers | Attachment downloads have nosniff, sandbox CSP, attachment disposition and private/no-store. No global Helmet or equivalent baseline. |
| Requests | Nest/Express default body-parser limit is already bounded (100 KB); no explicit application policy. DTO validation whitelists and rejects unknown properties. Multipart independently caps five files, inclusive 10 MB each, one 64 KB payload and total parts. |
| Abuse / IP | No rate limiter. Express does not enable trust proxy; arbitrary forwarded IP headers are not trusted. |
| Attachments | Filename separators/control characters sanitized; UUID storage keys independently validated; private directory with no static serving. Extension/MIME allowlist plus image/PDF signatures, UTF-8/control-byte checks and JSON parsing already exist. This is format validation, not full decoding or malware scanning. Download rechecks parent visibility, roles and soft deletion; projections exclude storage keys/digests. No demonstrated traversal or client-MIME-only weakness. |
| Errors | Nest masks unhandled errors as generic 500; expected domain errors are intentional. Default 404 responses may echo request URLs and parser errors need an explicit bounded policy. No demonstrated SQL/stack disclosure in the normal 500 body. |
| Secrets | JWT falls back to a known development secret even in production: actual configuration weakness. DATABASE_URL stays server-side. Local `.env` is ignored/untracked. No AI/object-storage credentials or client secret configuration found. No real secrets were read into audit output. |
| Frontend | Axios retries only eligible 401s once. 429 already propagates; the session coordinator treats temporary errors as non-definitive and enforces cooldown. No tight automatic 429 retry loop found. |

Scope: preserve authorization, lifecycle, pagination, session rotation, multi-device
and multi-tab rules. No schema change is needed. No AI, deployment infrastructure,
tenancy, demo reset, malware scanner or object storage is part of this phase.

Implementation review found one additional narrow attachment issue: Node's ASCII
decoder masks the high bit, so the existing PDF/WebP string signature comparisons
accepted some non-matching bytes. Replaced these comparisons with exact Buffer
equality and added regression coverage. This does not change the allowed formats
or turn signature checks into complete format validation.
