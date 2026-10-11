# Manual-testing UI fixes — 2026-10-11

Scope: ISS-001, 005, 006, 007, 008, 009, 010, 011 and 015. Implemented in two
passes: shared visual/navigation/refresh changes, then administration drawers and
the phone field. Earlier uncommitted bootstrap and account-directory investigation
work was preserved. No commit or push.

## Issue results

| Issue | Change |
| --- | --- |
| ISS-001 | Shared BrandMark and document title now say **Kino Service Desk**. Public login/setup and desktop/mobile navigation reuse that branding. No technical identifiers renamed. |
| ISS-005 | Notifications have an intentional empty state with a bell illustration, concise copy, themed colors and spacing. No fabricated records or route changes. Existing bell/list/read behavior remains. |
| ISS-006 | Profile has a keyboard-accessible Back button. App profile links record an internal source route; back uses router history only for recognized in-app entry with an existing router history entry. Direct entry falls back to the role's dashboard. |
| ISS-007 | Same-resource reload retains existing page content while a small status announces refresh. RefreshSurface makes stale content inert; refresh buttons are disabled. Initial loads remain genuine loading states, and loader/route changes do not reuse another resource's data. |
| ISS-008 | Shared native-select styling reserves 40px for the indicator, standardizes minimum height/padding and supports disabled/focus/dark states. Long labels truncate instead of colliding with the chevron. Native selection and keyboard behavior remain. |
| ISS-009 | Account create/edit, organization/team create, organization rename/coverage, and category/tag create/rename use a side drawer. Small archive/status/role/removal confirmations stay modal. |
| ISS-010 | One cohesive phone field combines country selection, an always-visible calling code and a national-number input. International paste reconstructs country/format, valid values normalize, invalid edits block submission, and clearing remains supported. |
| ISS-011 | Sonner follows the system theme; actual error toasts use a danger palette and the existing error icon. Success stays success. Backend messages and inline validation behavior remain unchanged. |
| ISS-015 | Topbar identity is a profile link with the shared initial avatar treatment as Profile, an accessible label/title, visible focus and responsive identity text. Required displayName supplies the label and first initial; blank corrupt data uses a neutral icon. |

## Refresh safety and preserved contracts

The refresh audit covers Accounts, Organization/team detail, ticket configuration,
My Requests, support queues, requester/support ticket detail, subtasks,
notifications and conversation/internal-note sections. Existing retry-only paths
retain their error behavior. The shared data hook retains data only for the same
loader while pending; a failed authorized refresh still surfaces its error rather
than silently presenting the old snapshot as current. Abort/response ownership
checks remain intact. Paginated lists retain their existing requests, cursors,
filters and stale-response protection: **usePagedList and account-directory logic
were not changed**. Accounts changes are presentation-only.

Keeping ticket pages mounted exposed their earlier dependence on unmount/remount
to reload child communication permissions. Parent reload now passes an explicit
refresh revision to conversations, notes and original attachments. Ownership and
permission changes therefore revalidate those endpoints without removing the
whole page or discarding conversation drafts. Silent post-message ticket refresh
does not reset the other conversation. The full support suite checks acquiring
and losing access and private/public draft preservation.

No backend, API, schema, migration, account-role matrix, requester/support authority,
bootstrap lifecycle, activation/reset or phone-ownership changes. The identity migration removes username entirely; sidebar bottom now opens Settings.
ISS-012/013 remain an unresolved manual Network-evidence investigation, and ISS-014
remains deferred. No `/admin` route hiding or unrelated redesign.

## Phone dependency and storage

Added exactly **libphonenumber-js 1.13.15**, pinned in the client manifest/lockfile,
with no transitive runtime dependencies or UI framework. Its full metadata
provides country-aware parsing/validation, calling codes and national formatting.
A small internal implementation would have to maintain international numbering
plans, trunk prefixes and shared-code distinctions such as US/Canada. See the
[upstream documentation](https://github.com/catamphetamine/libphonenumber-js#readme).

Parsing runs locally; no number is sent to an external lookup service. Metadata
needs normal dependency maintenance as numbering plans change. `pnpm audit --prod
--audit-level high` reported **no known vulnerabilities**. Full metadata adds
roughly 52 KB gzip to the lazy account-page bundle; it is not a global UI framework.

The API still receives one optional `phoneNumber`, matching the existing
`+` followed by 8–15 digits contract. Create omits blank phone values; edit sends
null when clearing. No separate country field, Prisma change, verification,
SMS/WhatsApp or MFA. Frontend country validation does not prove ownership or
deliverability. Existing stored values are reconstructed; untouched legacy values
are not silently rewritten during unrelated metadata edits.

## Accessibility and responsive behavior

- Native `dialog.showModal()` supplies modal semantics/inert background; explicit
  Tab/Shift+Tab wrapping keeps focus inside. Escape/backdrop/close dismiss only
  while safe; mutation busy state prevents dismissal.
- Opening controls regain focus. Actions menus focus their visible trigger before
  opening a form, so closing does not target a hidden menu item.
- Drawers use a fixed header, a contained scrolling form body and a reachable
  sticky footer. Document/body scrolling is locked while dialogs are open.
  Narrow viewports use the available width and full viewport height.
- Phone has labels, a grouped control, described help, aria-invalid and inline
  validation feedback. No new validation toast spam.
- Notifications have a status empty state. Profile links/buttons retain native
  keyboard activation and visible focus. Refresh status is announced separately
  from inert stale content.

Chromium checks cover desktop (1440px), tablet (900px), mobile (390px and 320px),
light/dark themes and constrained 1024×720 / 640×450 layouts with 1.25× / 2× pixel
scale. These approximate 125%/200% browser zoom reflow; they are **not a claim of
native browser zoom or Firefox/Safari testing**. Screenshots under the OS temp
directory, `eds-manual-*.png`, were visually inspected. Native zoom remains a
short manual check below.

## Files changed in this batch

These are additional to the earlier dirty working tree:

- `client/index.html`, `client/package.json`, `client/pnpm-lock.yaml`
- `client/src/App.tsx`, `client/src/workspace.css`
- `client/src/layouts/AppLayout.tsx`, `client/src/hooks/useResource.ts`
- Shared components: `ActionMenu.tsx`, `AdminDialog.tsx`, `Modal.tsx`,
  `BrandMark.tsx`, `NotificationBell.tsx`, `Attachments.tsx`,
  `TicketCommunication.tsx`; new `RefreshSurface.tsx`, `PhoneField.tsx`, `phone.ts`
- Form components: `AccountForm.tsx`, `EditAccountForm.tsx`, `OrganizationForms.tsx`
- Pages: `ProfilePage.tsx`, `UsersPage.tsx`, `OrganizationPage.tsx`,
  `TicketConfigurationPage.tsx`, `EmployeeTicketsPage.tsx`,
  `EmployeeTicketPage.tsx`, `OperationalWorkspacePage.tsx`,
  `OperationalTicketPage.tsx`, `SubtaskPage.tsx`
- Tests: `client/test/administration-flow.mjs`, `client/test/employee-flow.mjs`;
  new `client/test/manual-polish.mjs`, `client/test/phone.test.mjs`
- `docs/frontend-polish.md` and this report.

## Tests and commands

All browser tests use isolated API fixtures, not a live database or SMTP provider.
Chromium ran with permitted execution outside the sandbox. Commands below run in
`client` unless stated otherwise.

| Command | Result |
| --- | --- |
| `pnpm.cmd lint` | Pass |
| `pnpm.cmd build` | Pass, including TypeScript |
| `pnpm.cmd test:phone` | 8 tests pass: LB/US/CA/GB, reconstruction, paste, blank, invalid lengths/characters/extensions, country changes |
| `node test/administration-flow.mjs --manual-polish` | Pass: branding, notifications, keyboard profile/back/fallback, identity priority, retained DOM on refresh, rapid clicks, shared selects, error/success toasts, drawer focus/Escape/backdrop/scroll, responsive/dark screens, normalized create/edit/clear phone payloads |
| `node test/administration-flow.mjs --ui-polish` | Pass |
| `node test/administration-flow.mjs --account-metadata` | Pass: existing authority, normalized update/clear payloads, immutable identity, conflicts and mobile editing |
| `node test/administration-flow.mjs --account-directory` | Pass: existing directory and stale-response protections preserved |
| `node test/administration-flow.mjs --bootstrap` | Pass |
| `pnpm.cmd test:browser` | Pass: requester, support, administration, all 16 session groups, and new manual-polish checks |
| `pnpm.cmd audit --prod --audit-level high` | No known vulnerabilities |
| `git diff --check` (repository root) | Pass; existing line-ending notices only |

The standard browser gate now includes the new manual-polish mode. The focused
test fixture supports session reads and a controlled failed activation-mail action.
Requester assertions were updated for the empty-state heading and to wait for
refresh completion rather than for text that now intentionally remains visible.

Initial support regression exposed missing child refresh after retaining the page;
it was fixed and the complete support suite passed. Initial new-test failures were
keyboard-event setup, selector quoting and fixture expectations, all corrected.
An initial package install used the wrong sandbox pnpm store; installation then
used the existing store, and the generated empty local store was removed.

No backend/database regression was run: backend validation, API and schema were
not changed. No outstanding requested implementation item is intentionally deferred;
cross-browser, native zoom and real-provider checks remain manual boundaries.

## Manual retest checklist

1. Check **Kino Service Desk** on login/setup, desktop/mobile navigation and the
   browser tab. Do not reset bootstrap to test branding.
2. Open an empty notification panel using Enter. Check light/dark appearance,
   Tab navigation and Escape returning focus to the bell. Existing notifications
   should still navigate and mark read normally.
3. Open Profile from the topbar using keyboard and mouse. Back should return to
   the prior in-app page. Open `/profile` directly: Back to workspace should use
   your role's dashboard. Check displayName, Unicode first initials and the neutral icon for blank corrupt data.
4. Refresh each main workspace with network throttling enabled. Content should
   remain stable and temporarily noninteractive; rapid clicks should not stack
   reloads. A failed request must still show an honest error/retry state.
5. Open account, team and configuration forms. Check fixed close/header, internal
   scrolling, Escape/backdrop, focus return and unchanged centered confirmations.
   Repeat at native 100%, 125% and 200% zoom and on a phone-sized viewport.
6. Try long select options, keyboard selection and disabled controls in both themes.
7. Try LB `71 123 456`, US `(202) 555-0123`, Canada `(416) 555-0123`, UK
   `020 7946 0018`, and paste `+44 20 7946 0018`. Change countries after entering
   digits; test very short/long inputs, blank creation, existing-number editing
   and clearing. Confirm only one normalized phoneNumber travels in the request.
8. Trigger a controlled failed operation and a successful operation. Check the
   danger/icon versus success presentation and useful message text in both themes.

If ISS-012/013 recur, use the separate account-directory investigation's Network
capture steps; this UI batch does not claim to fix them.
