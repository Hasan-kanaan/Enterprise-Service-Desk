// Focused UI checks share the existing isolated API fixtures and Chromium harness.
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

async function screenshot(send, name) {
  const result = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(tmpdir(), `eds-polish-${name}.png`), Buffer.from(result.data, 'base64'))
}
async function viewport(send, width) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 })
}
async function fits(evaluate) {
  assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'No horizontal page overflow')
}
async function escape(send) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
}
async function drawer({ send, evaluate }) {
  await evaluate(`document.querySelector('[aria-label="Open navigation"]').click()`)
  assert(await evaluate(`document.querySelector('.navigation-drawer').open`))
  for (let i = 0; i < 15; i++) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
    assert(await evaluate(`document.activeElement.closest('.navigation-drawer') !== null`), 'Navigation traps keyboard focus')
  }
  await escape(send)
  assert(await evaluate(`!document.querySelector('.navigation-drawer[open]')`))
  assert(await evaluate(`document.activeElement.getAttribute('aria-label') === 'Open navigation'`), 'Escape restores trigger focus')
  await evaluate(`document.querySelector('[aria-label="Open navigation"]').click()`)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 375, y: 150, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 375, y: 150, button: 'left', clickCount: 1 })
  assert(await evaluate(`!document.querySelector('.navigation-drawer[open]')`), 'Backdrop dismisses navigation')
}

export async function requesterPolish(context) {
  const { send, evaluate, navigate, waitText, click, fill, checkLabel, tickets, requests, browserErrors } = context
  await navigate('/tickets'); await waitText('No requests yet')
  await click('New request'); await waitText('What can we help with?')
  await click('Submit ticket'); await waitText('Enter a title.')
  await fill('#ticket-title', 'VPN disconnects during calls')
  await fill('#ticket-description', 'The connection drops every few minutes when joining a call.')
  await fill('#ticket-category', '4'); await checkLabel('Beirut'); await checkLabel('Operations')
  await viewport(send, 390); await fits(evaluate); await screenshot(send, 'request-form-mobile')
  await click('Submit ticket'); await waitText('Submission response interrupted')
  assert.equal(await evaluate(`document.querySelector('#ticket-title').value`), 'VPN disconnects during calls')
  await click('Submit ticket'); await waitText('Request #142'); await waitText('Conversation')
  assert.equal(tickets.length, 1, 'Retry preserves creation idempotency')
  await fill('[aria-label="Message content"]', 'Please check the VPN connection.')
  await click('Send message'); await waitText('Please check the VPN connection.')
  assert(await evaluate(`document.querySelector('.thread-role').textContent === 'Requester'`))
  assert(await evaluate(`!document.querySelector('.communication').parentElement.closest('.panel')`), 'Conversation is a standalone section')
  assert(await evaluate(`document.querySelector('.detail-aside').textContent.includes('Category')`))
  assert(!requests.some(request => request.includes('internal-notes')), 'Requester never fetches internal notes')
  await fits(evaluate); await drawer(context)
  await viewport(send, 1440); await screenshot(send, 'request-detail-desktop')
  tickets[0].status = 'WAITING_FOR_EMPLOYEE'
  await navigate('/tickets/142'); await waitText('Support is waiting for your input')
  assert(await evaluate(`!!document.querySelector('.notice.warning')`))
  tickets[0].status = 'RESOLVED'
  await navigate('/tickets/142'); await waitText('Close ticket'); await waitText('Reopen ticket')
  await click('Close ticket'); await waitText('Confirm closure'); await click('Confirm closure')
  await waitText('This request is closed')
  await navigate('/tickets'); await waitText('VPN disconnects during calls'); await screenshot(send, 'requests-desktop')
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] })
  await screenshot(send, 'requests-dark'); await viewport(send, 320); await fits(evaluate)
  assert.deepEqual(browserErrors, [])
  console.log('PASS: requester form validation/retry, standalone thread, metadata, requester-only access, waiting/resolved/closed actions, mobile focus trap/backdrop/Escape, 320px layout and dark mode')
}

export async function administrationPolish(context) {
  const { send, evaluate, navigate, waitText, click, fill, requests, browserErrors } = context
  await navigate('/admin'); await waitText('Administration'); await screenshot(send, 'administration')
  await navigate('/admin/accounts'); await waitText('Employee Eve')
  assert(await evaluate(`!document.querySelector('[data-account-id="2"] .action-menu-trigger')`), 'Hierarchy prevents actions on Super Admin')
  await evaluate(`document.querySelector('[data-account-id="3"] .action-menu-trigger').click()`)
  assert(await evaluate(`document.querySelector('[data-account-id="3"] .action-menu').matches(':popover-open')`))
  await escape(send)
  assert(await evaluate(`!document.querySelector(':popover-open')`))
  await screenshot(send, 'accounts-desktop')
  await viewport(send, 390); await fits(evaluate)
  await evaluate(`document.querySelector('[data-account-id="3"] .action-menu-trigger').click()`)
  await click('Edit account'); await waitText('Home Region')
  await fill('[aria-label="Account display name"]', 'Eve Example')
  await fits(evaluate); await screenshot(send, 'account-dialog-mobile')
  await click('Confirm'); await waitText('Eve Example')
  await drawer(context)
  await navigate('/admin/organization?needsManager=true'); await waitText('Regional help')
  assert(await evaluate(`!!document.querySelector('.team-row.needs-manager')`))
  await fits(evaluate); await screenshot(send, 'organization-mobile')
  await click('Regional help'); await waitText('Team members'); await waitText('Team Lead')
  await fits(evaluate)
  await navigate('/admin/ticket-configuration'); await waitText('Network'); await waitText('VPN')
  await fits(evaluate); await screenshot(send, 'configuration-mobile')
  await viewport(send, 1440); await navigate('/admin/organization'); await waitText('Regional help')
  await screenshot(send, 'organization-desktop')
  assert(!requests.some(request => /\/tickets\/\d/.test(request)), 'Administration does not fetch support tickets')
  assert.deepEqual(browserErrors, [])
  console.log('PASS: account directory, native action popover/Escape, account edit, hierarchy, managerless Teams, Team detail, catalogs and mobile dialogs/navigation')
}

export async function operationsPolish(context) {
  const { send, evaluate, navigate, waitText, click, browserErrors } = context
  await navigate('/work/intake'); await waitText('VPN intake')
  assert(await evaluate(`document.querySelector('.queue-tabs [aria-current="page"]').getAttribute('href') === '/work/intake'`))
  await navigate('/work/tickets/142'); await waitText('Take responsibility')
  await click('Take responsibility'); await waitText('Confirm'); await click('Confirm')
  await waitText('Current responsibility')
  await navigate('/work/tickets/143'); await waitText('Internal notes')
  assert(await evaluate(`!!document.querySelector('.internal-notes')`))
  await evaluate(`document.querySelector('[aria-label="Manage responsibility"]').click()`)
  assert(await evaluate(`!!document.querySelector(':popover-open')`))
  await escape(send)
  await screenshot(send, 'support-desktop')
  await viewport(send, 390); await fits(evaluate); await screenshot(send, 'support-mobile')
  await navigate('/work/subtasks'); await waitText('Subtasks'); await fits(evaluate)
  await navigate('/work-history'); await waitText('Completed VPN verification'); await fits(evaluate)
  await screenshot(send, 'history-mobile')
  assert.deepEqual(browserErrors, [])
  console.log('PASS: active queue navigation, Manager claim, ownership popover, internal-note separation, subtasks/history and mobile support detail')
}
