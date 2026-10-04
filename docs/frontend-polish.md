# Frontend UI/UX polish — 2026-10-04

## Design and scope

The authenticated application uses neutral surfaces, one teal accent, 6px default
corners, restrained status colors, compact controls and consistent page/section
headings. Existing React/Vite/TypeScript, CSS, Lucide icons and native browser
controls remain in use. No dependencies or backend files changed.

The initial audit found oversized shell context cards, inconsistent Profile fields,
administrative action walls, missing Team ownership in the catalog, and conversation
and attachments nested under Work history. These are addressed as follows:

- A 244px persistent sidebar, 56px top bar and wide content area. My Requests is
  present for every role and visually separate from support/administration.
  Identity prefers displayName. The mobile drawer uses a modal dialog with focus
  containment, Escape/backdrop dismissal, focus restoration and scroll locking.
- Shared buttons, fields, panels, notices, status badges and list rows are denser.
  `workspace.css` contains shell and page layout styles; `tickets.css` remains the
  shared control stylesheet. `ActionMenu` uses native popovers and existing buttons.
- My Requests shows category, last update, priority and status in compact rows.
  Creation retains all required scope validation, with optional tags disclosed
  separately and attachments integrated into the form.
- Both ticket details separate description, conversation, original attachments and
  work history. Category/scope/ownership live in the sidebar. Requester/support
  author labels use requester identity, and internal notes have a restrained border.
  Mobile section links keep conversation and actions reachable in long threads.
- Support queues use active navigation tabs. Ownership actions sit beside ownership,
  while lifecycle actions retain their existing permission gates. Completed/cancelled
  subtasks and work history use quiet row styling.
- Accounts use a directory with role/status/activation columns and contextual
  actions. Role-change consequences are grouped into readable lists. Team catalogs
  show coverage, Manager, Team Lead and archive state. Only active regional Teams
  without Managers receive the warning treatment. Configuration remains compact.
- Profile groups identity/company job title, password change and device sessions.
  Password fields now use shared labeled inputs. Session revocation has success
  feedback and retains existing confirmation and session semantics.
- Existing light/dark schemes and reduced-motion handling remain. Required fields,
  focus rings, skip navigation, responsive dialogs and mobile input sizes are explicit.
  The unused Vite starter `App.css` was removed.

## Preserved contracts

No role matrices, ticket permissions, lifecycle rules, routing, TeamManager/Lead
rules, specialties, archival behavior, attachment policies, notification behavior,
pagination/search, idempotency, internal-note authorization or session semantics
were changed. No AI, cloud storage, migrations, APIs, commit or push were added.
The working tree was clean at the start.

Category names come from the existing small active options catalog, once per list
screen, with an ID fallback for unavailable/archived names. Operational summaries
contain owner IDs, not person projections: rows show those IDs or collaboration
context, while detail retains names. There are no per-row requests or new counts.

## Verification performed

All commands below passed from the repository root on Windows:

```powershell
pnpm.cmd --dir client build
pnpm.cmd --dir client lint
node client/test/employee-flow.mjs --ui-polish
node client/test/operations-flow.mjs --ui-polish
node client/test/administration-flow.mjs --ui-polish
node client/test/session-flow.mjs --ui-polish
node client/test/administration-flow.mjs --identity-lifecycle
node client/test/administration-flow.mjs --account-metadata
git diff --check
```

The build includes TypeScript checking. Browser modes reuse the existing isolated
API fixtures and installed Chromium, not a real database. Focused checks cover:

- Creation validation, interrupted-response retry/idempotency, message posting,
  requester-only data, waiting/resolved/closed actions and dark mode.
- Mobile drawer Tab containment, Escape focus return and backdrop dismissal;
  390px screens/dialogs and a 320px requester list.
- Manager claim, ownership popover, internal notes, subtasks and work history.
- Account hierarchy, editing, 400/404/409 recovery, duplicate-submit protection,
  role transitions, all five roles' requester navigation and managerless warnings.
- Team details/catalogs, configuration, session revocation, current-device logout
  across tabs and fresh sign-in.

The first sandboxed browser attempt timed out at CDP Page.enable; successful runs
used approved execution outside the sandbox. A mobile focus-wrap failure and a
Team-tab CSS collision found during checks were fixed and rechecked. Screenshots
were captured under the OS temp directory as `eds-polish-*.png` and visually reviewed.

No full regression suite, backend tests, browser-to-real-database integration,
Firefox/Safari run, or external accessibility audit is claimed.

## Remaining boundaries

- Owner names are not available in the existing paginated summary projection;
  rows use truthful IDs and detail provides names. Archived category names can
  similarly fall back to IDs in lists.
- Team membership counts and home Region/Department on Profile were not invented;
  the existing respective catalog/auth projections do not provide them.
- Native confirmation prompts for existing session/message deletion remain.
- Long catalogs retain their existing scale boundaries; this work does not add
  a new search/index/count service or virtualized component framework.
