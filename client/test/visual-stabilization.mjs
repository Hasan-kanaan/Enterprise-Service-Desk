// Fixture-only visual evidence. No live API/database, credentials or user content.
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

export const evidenceDirectory = join(tmpdir(), 'eds-visual-066-067')
export async function captureMatrix({ send, evaluate }, name) {
  mkdirSync(evidenceDirectory, { recursive: true })
  for (const width of [1440, 768, 390]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 })
    for (const theme of ['light', 'dark']) {
      await evaluate(`document.documentElement.dataset.theme = '${theme}'; window.scrollTo(0, 0)`)
      // Let layout and theme paint before collecting evidence.
      await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
      await delay(200) // Existing control background transitions last 150 ms.
      assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'), `${name}: ${width}px ${theme} overflow`)
      assert(await evaluate(`(() => {
        const inside = (child, parent) => {
          const a = child.getBoundingClientRect(), b = parent.getBoundingClientRect();
          return a.left >= b.left - 1 && a.right <= b.right + 1;
        };
        return [...document.querySelectorAll('.attachment-card')].every(card =>
          inside(card, card.closest('.attachment-cards')) &&
          [...card.querySelectorAll('.attachment-filename, .attachment-preview, button')].every(child => inside(child, card))
        );
      })()`), `${name}: ${width}px ${theme} attachment containment`)
      const { cssContentSize } = await send('Page.getLayoutMetrics')
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: Math.min(cssContentSize.height, 16000), scale: 1 } })
      writeFileSync(join(evidenceDirectory, `${name}-${width}-${theme}.png`), Buffer.from(shot.data, 'base64'))
    }
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await evaluate("document.documentElement.dataset.theme = 'light'")
}

export async function operationsVisual(context) {
  const { navigate, waitText, evaluate, click, fill, setUser, setFailure, tickets, browserErrors } = context
  const pagination = '[aria-label="History pagination"]'
  await navigate('/work-history?contribution=COMPLETED_SUBTASK')
  await waitText('Completed VPN verification')
  assert(!await evaluate(`!!document.querySelector('${pagination}')`), 'Single page has no pagination')
  await captureMatrix(context, 'history-single')
  await fill('input[type="date"]', '2027-01-01')
  await waitText('No work history found')
  assert(!await evaluate(`!!document.querySelector('${pagination}')`), 'Empty history has no pagination')
  await captureMatrix(context, 'history-empty')
  await navigate('/work-history?from=2026-01-01&to=2026-12-31')
  await waitText('Page 1')
  assert(await evaluate(`document.querySelector('${pagination}').getBoundingClientRect().width < 360`), 'Compact pagination')
  await click('Next'); await waitText('Page 2')
  assert(await evaluate(`location.search.includes('page=2') && location.search.includes('from=2026-01-01') && location.search.includes('to=2026-12-31')`))
  assert.equal(await evaluate(`document.querySelectorAll('.history-list > li').length`), 2)
  await evaluate('history.back()'); await waitText('Page 1')
  await evaluate('history.forward()'); await waitText('Page 2')
  await captureMatrix(context, 'history-page-two')
  await context.send('Page.bringToFront')
  await context.send('Emulation.setFocusEmulationEnabled', { enabled: true })
  await context.until(() => evaluate(`!!document.querySelector('${pagination} button:not(:disabled)') && !document.querySelector('[aria-busy=true]')`), 'pagination ready after focus revalidation')
  await evaluate(`document.querySelector('${pagination} button').focus()`)
  assert(await evaluate(`document.activeElement === document.querySelector('${pagination} button')`))
  await context.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' })
  await context.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await waitText('Page 1')
  await fill('select', 'COMPLETED_SUBTASK'); await waitText('Completed VPN verification')
  assert(await evaluate(`!new URLSearchParams(location.search).has('page') && document.querySelector('input[type=date]').value === '2026-01-01'`))
  setFailure(true); await navigate('/work-history'); await waitText('Service temporarily unavailable')
  await captureMatrix(context, 'history-error')
  setFailure(false); await click('Try again'); await waitText('Page 1')
  console.log('PASS: ISS-066 empty/single/multiple pages, compact footer, URL filters, back/forward, keyboard and error recovery')

  for (const [role, id, routes] of [
    ['MANAGER', 20, [['/dashboard', 'Support overview'], ['/work/tickets', 'Owned network issue'], ['/work/intake', 'VPN intake'], ['/work/tickets/143', 'Internal notes'], ['/work/subtasks', 'Current diagnostics'], ['/work/subtasks/601', 'Update subtask'], ['/analytics', 'Operational overview']]],
    ['AGENT', 31, [['/work/tickets', 'Owned network issue'], ['/work/tickets/143', 'Internal notes'], ['/work/subtasks', 'Current diagnostics'], ['/work/subtasks/601', 'Update subtask'], ['/work-history', 'Primary Agent']]],
    ['AGENT', 32, [['/work/team', 'Owned network issue'], ['/work/tickets/143', 'Internal notes'], ['/work/subtasks/601', 'Update subtask'], ['/work-history', 'Primary Agent']]],
  ]) {
    setUser(role, id)
    for (const [route, ready] of routes) {
      await navigate(route); await waitText(ready)
      await captureMatrix(context, `${role.toLowerCase()}-${id}-${route.slice(1).replaceAll('/', '-')}`)
    }
  }
  setUser('MANAGER', 20)
  tickets[1].status = 'WAITING_FOR_EMPLOYEE'
  await navigate('/work/tickets'); await waitText('Waiting for employee')
  assert(!await evaluate("document.querySelector('.ticket-rows').textContent.includes('Waiting for you')"))
  await navigate('/work/tickets/143'); await waitText('Waiting for employee')
  await click('Change status'); await waitText('Confirm')
  await captureMatrix(context, 'ticket-status-dialog')
  await click('Cancel')
  await navigate('/work/tickets?search=no-matching-fixture'); await waitText('No matching tickets')
  assert(!await evaluate("!!document.querySelector('.list-continuation')"), 'No empty continuation footer')
  await captureMatrix(context, 'work-search-empty')
  assert.deepEqual(browserErrors, [])
  console.log('PASS: Manager/Agent/Team Lead routes, support status language, dialogs, empty queues; desktop/tablet/mobile in both themes')
}

export async function administrationVisual(context) {
  const { navigate, waitText, click, fill, evaluate, setUser, browserErrors } = context
  for (const [route, ready, name] of [
    ['/admin', "Manage your service desk's people and configuration.", 'admin-landing'], ['/admin/accounts', 'Employee Eve', 'accounts'],
    ['/admin/organization', 'Regional help', 'organization'], ['/admin/organization/teams/1', 'Team members', 'team-detail'],
    ['/admin/ticket-configuration', 'Network', 'ticket-configuration'], ['/profile', 'Your sessions', 'profile'],
  ]) {
    await navigate(route); await waitText(ready); await captureMatrix(context, name)
  }
  await navigate('/admin/accounts'); await waitText('Employee Eve'); await click('Create account')
  await waitText('Display name'); await captureMatrix(context, 'account-create-dialog'); await click('Cancel')
  for (const [id, action, ready, name] of [
    [3, 'Edit account', 'Home Region', 'account-edit-dialog'],
    [4, 'Change role', 'New role', 'account-role-dialog'],
    [4, 'Deactivate', 'Confirm', 'account-deactivate-dialog'],
  ]) {
    await evaluate(`(() => { const row = document.querySelector('[data-account-id="${id}"]'); row.querySelector('button[popovertarget]').click(); [...row.querySelectorAll('button')].find(b => b.textContent.trim() === '${action}').click() })()`)
    await waitText(ready)
    if (action === 'Change role') await fill('[aria-label="New role"]', 'EMPLOYEE')
    await captureMatrix(context, name); await click('Cancel')
  }
  await navigate('/admin/organization/teams/1'); await waitText('Team members')
  for (const action of ['Add member', 'Assign Team Lead', 'Assign TeamManager', 'Change coverage', 'Add specialty']) {
    await click(action); await waitText('Confirm'); await captureMatrix(context, action.toLowerCase().replaceAll(' ', '-')); await click('Cancel')
  }
  await evaluate("document.querySelector('[aria-label=Notifications]').click()")
  await waitText('No notifications yet'); await captureMatrix(context, 'notifications-empty')
  await evaluate(`document.querySelector('dialog button[aria-label="Close dialog"]').click()`)
  setUser('SUPER_ADMIN')
  await navigate('/admin/accounts'); await waitText('Employee Eve'); await captureMatrix(context, 'super-admin-accounts')
  assert.deepEqual(browserErrors, [])
  console.log('PASS: administration routes, Super Admin, account/Team/coverage dialogs, notifications; desktop/tablet/mobile in both themes')
}

export async function employeeVisual(context) {
  const { navigate, waitText, click, fill, checkLabel, tickets, selectAttachment, evaluate, browserErrors } = context
  await navigate('/tickets'); await waitText('No requests yet'); await captureMatrix(context, 'requests-empty')
  await navigate('/tickets/new'); await waitText('What can we help with?')
  await captureMatrix(context, 'new-request')
  await fill('#ticket-title', 'VPN disconnects during calls')
  await fill('#ticket-description', 'The connection drops during calls. Please investigate.')
  await fill('#ticket-category', '4'); await checkLabel('Beirut'); await checkLabel('Operations')
  await selectAttachment('input[type=file]', 'original.txt')
  await click('Submit ticket'); await waitText('Submission response interrupted')
  await click('Submit ticket'); await waitText('Request #142'); await waitText('original.txt')
  await fill('[aria-label="Message content"]', 'The issue happens on the office network.')
  await click('Send message'); await waitText('The issue happens on the office network.')
  await captureMatrix(context, 'request-detail-conversation-history')
  await context.attachmentPreviews(context)
  await navigate('/tickets'); await waitText('VPN disconnects during calls'); await captureMatrix(context, 'requests-list')
  await navigate('/tickets?search=no-matching-fixture'); await waitText('No matching requests'); await captureMatrix(context, 'requests-filter-empty')
  tickets[0].status = 'WAITING_FOR_EMPLOYEE'
  await navigate('/tickets/142'); await waitText('Waiting for you')
  assert(!await evaluate("document.querySelector('.status-badge').textContent.includes('Waiting for employee')"))
  await captureMatrix(context, 'request-waiting')
  assert.deepEqual(browserErrors, [])
  console.log('PASS: employee empty/list/filter, request form, conversation/history, private previews and waiting status; desktop/tablet/mobile in both themes')
}
