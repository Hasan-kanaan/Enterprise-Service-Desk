// Dependency-free browser acceptance checks using installed Chrome/Edge and CDP.
// Run after `pnpm build`: node test/employee-flow.mjs. API responses are isolated fixtures.
import assert from 'node:assert/strict'
import { communicationFixture, submission } from './communication-fixture.mjs'
import { notificationFixture } from './notification-fixture.mjs'
const notifications = notificationFixture()
const communication = communicationFixture()
import { spawn } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const executable =
  process.env.BROWSER_PATH ||
  [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find(existsSync)
assert(executable, 'Set BROWSER_PATH to an installed Chromium browser')
const profile = mkdtempSync(join(tmpdir(), 'eds-browser-'))
const preview = spawn(
  process.execPath,
  [
    join(root, 'node_modules/vite/bin/vite.js'),
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    '3000',
    '--strictPort',
  ],
  { cwd: root, windowsHide: true, stdio: 'pipe' },
)
let previewFailure = ''
preview.stderr.on('data', (data) => {
  previewFailure += data.toString()
})
const browser = spawn(
  executable,
  [
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--window-size=1440,1050',
    'about:blank',
  ],
  { windowsHide: true, stdio: 'ignore' },
)
let socket
let serial = 0
const pending = new Map()
const browserErrors = []
const requests = []
const mutations = []
let role = 'EMPLOYEE',
  loggedIn = true,
  expired = false,
  conflict = false,
  listFailure = false,
  emptyCategories = false,
  refreshCount = 0,
  retryUnauthorized = false
const options = {
  categories: [{ id: 4, name: 'Network & connectivity' }],
  regions: [{ id: 2, name: 'Beirut' }],
  departments: [{ id: 3, name: 'Operations' }],
  tags: [{ id: 7, name: 'VPN' }],
}
const now = '2026-09-22T08:00:00.000Z'
const ownership = {
  manager: { id: 20, username: 'Sara' },
  team: { id: 8, name: 'Network support' },
  agent: { id: 31, username: 'Ali' },
}
let tickets = []
let cycles = []
const original = (id) => ({
  id: id * 10,
  sequenceNumber: 1,
  type: 'ORIGINAL',
  isCurrent: true,
  isEnded: false,
  startedAt: now,
  startedBy: { id: 10, username: 'Maya' },
  startReason: null,
  startDisposition: null,
  outcome: null,
  endedAt: null,
  endedBy: null,
  closedAt: null,
  closedBy: null,
  resolutionSummary: null,
  ownership: { ...ownership, basis: 'CURRENT', capturedAt: null },
})
function send(method, params = {}) {
  const id = ++serial
  return new Promise((accept, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`CDP timeout: ${method}`))
    }, 10000)
    pending.set(id, { accept, reject, timer })
    socket.send(JSON.stringify({ id, method, params }))
  })
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })
  if (result.exceptionDetails)
    throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}
async function until(check, label) {
  for (let n = 0; n < 100; n++) {
    if (await check()) return
    await delay(100)
  }
  throw new Error(`Timed out: ${label}`)
}
const waitText = (text) =>
  until(
    () =>
      evaluate(`document.body.textContent.includes(${JSON.stringify(text)})`),
    text,
  )
async function navigate(path) {
  await send('Page.navigate', { url: `http://127.0.0.1:3000${path}` })
  await delay(150)
}
async function click(text) {
  await evaluate(
    `(() => { const el = [...document.querySelectorAll('button,a')].find(el => el.textContent.trim() === ${JSON.stringify(text)}); if (!el || el.disabled) throw Error('Missing or disabled: ' + ${JSON.stringify(text)}); el.click(); })()`,
  )
  await delay(70)
}
async function fill(selector, value) {
  await evaluate(
    `(() => { const el = document.querySelector(${JSON.stringify(selector)}); const prototype = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); })()`,
  )
  await delay(30)
}
async function checkLabel(text) {
  await evaluate(
    `(() => { const label = [...document.querySelectorAll('label')].find(el => el.textContent.trim() === ${JSON.stringify(text)}); if (!label) throw Error('Missing label'); label.querySelector('input').click(); })()`,
  )
}

async function selectAttachment(selector, name) {
  await evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); const transfer = new DataTransfer(); transfer.items.add(new File(['service desk'], ${JSON.stringify(name)}, { type: 'text/plain' })); input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true })); })()`)
}

function response(request) {
  const path = new URL(request.url).pathname
  requests.push(`${request.method} ${path}`)
  const body = submission(request).body
  if (/^\/tickets\/\d+\/attachments$/.test(path)) return [200, tickets.find(t => t.id === Number(path.split('/')[2]))?.attachments ?? []]
  if (/^\/tickets\/attachments\/\d+\/download$/.test(path)) return [200, { file: 'downloaded' }]
  if (path === '/auth/refresh') {
    refreshCount++
    return loggedIn
      ? [
          201,
          {
            accessToken: `token-${refreshCount}`,
            user: {
              id: 10,
              username: 'Maya',
              email: 'maya@example.test',
              role,
            },
          },
        ]
      : [401, { message: 'Invalid session' }]
  }
  if (path === '/auth/logout') {
    loggedIn = false
    return [201, {}]
  }
  if (path.startsWith('/notifications')) return notifications.respond(request, 10)
  if (path === '/ticket-options')
    return [
      200,
      { ...options, categories: emptyCategories ? [] : options.categories },
    ]
  if (retryUnauthorized && path.startsWith('/tickets'))
    return [401, { message: 'Inactive account' }]
  if (expired && path.startsWith('/tickets')) {
    expired = false
    return [401, { message: 'Expired token' }]
  }
  if (path === '/tickets' && request.method === 'GET')
    return listFailure
      ? [503, { message: 'Service temporarily unavailable' }]
      : [200, tickets]
  if (path === '/tickets' && request.method === 'POST') {
    mutations.push({ path, body })
    assert.equal(body.categoryId, 4)
    assert.deepEqual(body.affectedRegionIds, [2])
    assert.deepEqual(body.affectedDepartmentIds, [3])
    assert(!('assignedManagerId' in body))
    const id = 142
    cycles = [original(id)]
    const ticket = {
      ...body,
      attachments: submission(request).files,
      id,
      status: 'NEW',
      requesterId: 10,
      assignedManagerId: null,
      assignedTeamId: null,
      assignedAgentId: null,
      ownership: { manager: null, team: null, agent: null },
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
      closedAt: null,
      currentCycle: cycles[0],
    }
    tickets.push(ticket)
    return [201, ticket]
  }
  const communicationTicket = tickets.find(item => item.id === Number(path.split('/')[2]))
  if (communicationTicket && /\/(messages|internal-notes)/.test(path))
    return communication.respond(request, communicationTicket, cycles[0], { id: 10, username: 'Maya', role: 'EMPLOYEE' }, true, false)
  const match = path.match(
    /^\/tickets\/(\d+)(?:\/(history|cancel|status|reopen))?$/,
  )
  if (match) {
    const ticket = tickets.find((item) => item.id === Number(match[1]))
    if (!ticket) return [404, { message: 'Ticket not found' }]
    if (match[2] === 'history')
      return [
        200,
        {
          ticketId: ticket.id,
          currentCycleId: cycles[0].id,
          subtasksAccess: 'NONE',
          cycles,
        },
      ]
    if (request.method === 'GET') return [200, ticket]
    mutations.push({ path, body })
    if (conflict) {
      conflict = false
      return [
        409,
        { message: 'Ticket changed concurrently; reload before retrying' },
      ]
    }
    if (match[2] === 'cancel') {
      ticket.status = 'CANCELLED'
      cycles[0].outcome = 'CANCELLED'
      cycles[0].isEnded = true
      cycles[0].endedAt = now
    } else if (match[2] === 'status') {
      assert.equal(body.status, 'CLOSED')
      ticket.status = 'CLOSED'
      ticket.closedAt = now
      cycles[0].outcome = 'CLOSED'
      cycles[0].closedAt = now
    } else if (match[2] === 'reopen') {
      assert(body.reason.trim())
      ticket.status = 'IN_PROGRESS'
      ticket.resolvedAt = null
      ticket.closedAt = null
      cycles[0].isCurrent = false
      cycles.unshift({
        ...original(ticket.id),
        id: ticket.id * 10 + cycles.length,
        sequenceNumber: cycles.length + 1,
        type: 'REOPENED',
        startReason: body.reason,
        startDisposition: 'CONTINUE',
      })
      ticket.currentCycle = cycles[0]
    } else Object.assign(ticket, body)
    return [200, ticket]
  }
  return [404, { message: 'Unknown fixture endpoint' }]
}
try {
  await until(async () => {
    if (preview.exitCode !== null) throw Error(previewFailure)
    try {
      return (await fetch('http://127.0.0.1:3000')).ok
    } catch {
      return false
    }
  }, 'preview server')
  await until(() => existsSync(join(profile, 'DevToolsActivePort')), 'browser')
  const port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split(
    '\n',
  )[0]
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  socket = new WebSocket(
    tabs.find((tab) => tab.type === 'page').webSocketDebuggerUrl,
  )
  await new Promise((accept) =>
    socket.addEventListener('open', accept, { once: true }),
  )
  socket.addEventListener('message', async (event) => {
    const data = JSON.parse(event.data)
    if (data.id) {
      const entry = pending.get(data.id)
      if (!entry) return
      clearTimeout(entry.timer)
      pending.delete(data.id)
      data.error
        ? entry.reject(new Error(JSON.stringify(data.error)))
        : entry.accept(data.result)
      return
    }
    if (data.method === 'Runtime.exceptionThrown')
      browserErrors.push(data.params.exceptionDetails)
    if (data.method === 'Fetch.requestPaused') {
      const { requestId, request } = data.params
      try {
        const [status, body] =
          request.method === 'OPTIONS' ? [200, {}] : response(request)
        await send('Fetch.fulfillRequest', {
          requestId,
          responseCode: status,
          responseHeaders: [
            { name: 'Content-Type', value: 'application/json' },
            {
              name: 'Access-Control-Allow-Origin',
              value: 'http://127.0.0.1:3000',
            },
            { name: 'Access-Control-Allow-Credentials', value: 'true' },
            {
              name: 'Access-Control-Allow-Headers',
              value: 'content-type,authorization',
            },
            {
              name: 'Access-Control-Allow-Methods',
              value: 'GET,POST,PATCH,DELETE,OPTIONS',
            },
          ],
          body: Buffer.from(JSON.stringify(body)).toString('base64'),
        })
      } catch (error) {
        browserErrors.push(String(error))
        await send('Fetch.failRequest', { requestId, errorReason: 'Failed' })
      }
    }
  })
  await send('Page.enable')
  await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.attachmentConfirmations = []; window.confirm = text => { window.attachmentConfirmations.push(text); return true }' })
  await send('Runtime.enable')
  await send('Fetch.enable', {
    patterns: [{ urlPattern: 'http://localhost:8000/*' }],
  })
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1050,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await navigate('/tickets')
  await waitText('Your next request starts here')
  assert.equal(refreshCount, 1)
  console.log('PASS: restored employee session and empty list')
  await evaluate(`document.querySelector('[aria-label="Notifications"]').click()`)
  await waitText('No notifications yet.')
  await evaluate(`document.querySelector('[aria-label="Close dialog"]').click()`)
  await click('New ticket')
  await waitText('New support request')
  await click('Submit ticket')
  await waitText('Enter a title.')
  await fill('#ticket-title', 'VPN disconnects during calls')
  await fill('#ticket-description', 'The connection drops every few minutes.')
  await fill('#ticket-category', '4')
  await checkLabel('Beirut')
  await checkLabel('Operations')
  await checkLabel('VPN')
  await selectAttachment('input[type=file]', 'remove.txt')
  await waitText('Remove remove.txt')
  await click('Remove remove.txt')
  await selectAttachment('input[type=file]', 'original.txt')
  await click('Submit ticket')
  await waitText('Request #142')
  assert.equal(mutations.filter((item) => item.path === '/tickets').length, 1)
  console.log(
    'PASS: validated form submits real category/scope IDs and opens detail',
  )
  await waitText('Download original.txt')
  await click('Download original.txt')
  await until(() => requests.some(path => /attachments\/\d+\/download/.test(path)), 'authenticated file download')
  assert(!await evaluate(`document.querySelector('[aria-label="Original request attachments"]').textContent.includes('Delete attachment')`))
  console.log('PASS: draft attachment removal, multipart ticket submission, immutable attachment display/download')
  const supportNotice = notifications.add(10, 'SUPPORT_MESSAGE', 142)
  notifications.add(10, 'WAITING_FOR_EMPLOYEE', 142)
  await evaluate(`document.querySelector('[aria-label="Notifications"]').click()`)
  await waitText('Support replied on ticket #142.')
  await until(() => evaluate(`!!document.querySelector('[aria-label="2 unread notifications"]')`), 'unread badge')
  await evaluate(`document.querySelector('[aria-label="Mark notification ${supportNotice.id} read"]').click()`)
  await until(() => evaluate(`!!document.querySelector('[aria-label="1 unread notifications"]')`), 'mark one read')
  assert(supportNotice.readAt)
  await click('Mark all read')
  await until(() => evaluate(`!document.querySelector('.notification-badge')`), 'mark all read')
  await click('Support replied on ticket #142.')
  await waitText('Request #142')
  assert.equal(await evaluate('location.pathname'), '/tickets/142')
  notifications.add(10, 'RESOLVED', 999)
  await evaluate(`document.querySelector('[aria-label="Notifications"]').click()`)
  await waitText('Ticket #999 was resolved.')
  await click('Ticket #999 was resolved.')
  await waitText('This ticket could not be found')
  await evaluate(`document.querySelector('[aria-label="Notifications"]').click()`)
  await waitText('Ticket #999 was resolved.')
  await evaluate(`document.querySelector('[aria-label="Close dialog"]').click()`)
  await navigate('/tickets/142')
  await waitText('Request #142')
  console.log('PASS: employee notification empty/list/badge, mark one/all read, ticket navigation and retained history after unavailable destination')
  await click('Edit details')
  await fill('#ticket-title', 'VPN disconnects repeatedly')
  notifications.add(10, 'SUPPORT_MESSAGE', 142)
  await click('Save changes')
  await waitText('VPN disconnects repeatedly')
  await until(
    () => evaluate(`!document.querySelector('#ticket-title')`),
    'saved edit',
  )
  await until(() => evaluate(`!!document.querySelector('[aria-label="1 unread notifications"]')`), 'notification refresh after mutation')
  conflict = true
  await click('Edit details')
  await fill('#ticket-title', 'Stale change')
  await click('Save changes')
  await waitText('Reload ticket')
  assert(
    await evaluate(
      `[...document.querySelectorAll('button')].find(el => el.textContent === 'Save changes').matches(':disabled')`,
    ),
  )
  await click('Reload ticket')
  await waitText('VPN disconnects repeatedly')
  console.log('PASS: edit and explicit conflict reload without write retry')
  await waitText('No messages yet.')
  await fill('[aria-label="Message content"]', 'Employee context')
  await selectAttachment('[aria-label="Conversation"] input[type=file]', 'message.txt')
  communication.fail(503)
  await click('Send message')
  await waitText('Temporary server failure')
  await waitText('Remove message.txt')
  assert.equal(await evaluate(`document.querySelector('[aria-label="Message content"]').value`), 'Employee context')
  await click('Send message')
  await waitText('Employee context')
  await until(() => evaluate(`!![...document.querySelectorAll('button')].find(el => el.textContent === 'Edit message')`), 'message posted')
  tickets[0].status = 'WAITING_FOR_EMPLOYEE'
  await click('Edit message')
  await fill('[aria-label="Message content"]', 'Employee corrected context')
  await click('Save edit')
  await waitText('edited')
  assert.equal(tickets[0].status, 'WAITING_FOR_EMPLOYEE')
  await fill('[aria-label="Message content"]', 'The requested result')
  communication.fail(409)
  await click('Send message')
  await waitText('Reload the latest information')
  assert.equal(await evaluate(`document.querySelector('[aria-label="Message content"]').value`), 'The requested result')
  await click('Refresh conversation')
  await until(() => evaluate(`!!document.querySelector('[aria-label="Message content"]')`), 'draft restored after reload')
  await click('Send message')
  await waitText('The requested result')
  assert.equal(tickets[0].status, 'IN_PROGRESS')
  assert(!requests.some(path => path.includes('internal-notes')))
  assert(!await evaluate(`document.body.textContent.includes('Internal notes — support only')`))
  console.log('PASS: requester conversation, own editing, edited marker, waiting reply, private-note exclusion and preserved 503/409 drafts')
  await click('Delete attachment')
  await waitText('Attachment deleted')
  await click('Delete message')
  await waitText('Message deleted')
  assert(await evaluate('window.attachmentConfirmations.length >= 2'))
  assert(!await evaluate(`document.body.textContent.includes('Employee corrected context')`))
  assert.equal(tickets[0].status, 'IN_PROGRESS')
  console.log('PASS: preserved file draft after upload failure and confirmed own attachment/message tombstones')
  communication.records.push({ id: 9000, ticketId: 142, kind: 'messages', createdInCycleId: cycles[0].id, author: { id: 20, username: 'Sara' }, content: 'Support file reply', createdAt: now, editedAt: null, deletedAt: null, attachments: [{ id: 9001, filename: 'support.txt', byteSize: 12, createdAt: now, deletedAt: null }] })
  await click('Refresh conversation')
  await waitText('Download support.txt')
  assert(!await evaluate(`[...document.querySelectorAll('.communication-records > li')].find(el => el.textContent.includes('Support file reply')).textContent.includes('Delete')`))
  console.log('PASS: requester sees support attachment without non-author deletion controls')

  tickets[0].status = 'NEW'
  await click('Refresh')
  await waitText('Cancel ticket')
  await click('Cancel ticket')
  await waitText('Cancel this ticket?')
  await click('Keep ticket')
  assert.equal(tickets[0].status, 'NEW')
  await click('Cancel ticket')
  await click('Confirm cancellation')
  await waitText('This ticket was cancelled.')
  assert(
    !(await evaluate(`document.body.textContent.includes('Reopen ticket')`)),
  )
  assert(
    !(await evaluate(`document.body.textContent.includes('Edit details')`)),
  )
  console.log('PASS: cancellation confirmation and terminal immutability')
  tickets[0].status = 'RESOLVED'
  tickets[0].ownership = ownership
  tickets[0].assignedManagerId = 20
  tickets[0].assignedTeamId = 8
  tickets[0].assignedAgentId = 31
  cycles[0].outcome = 'RESOLVED'
  cycles[0].resolutionSummary = 'Reinstalled the VPN client.'
  tickets[0].resolvedAt = now
  await click('Refresh')
  await waitText('Your request has been resolved.')
  await click('Close ticket')
  await click('Confirm closure')
  await waitText('This request is closed.')
  await click('Reopen ticket')
  assert(
    await evaluate(
      `[...document.querySelectorAll('button')].find(el => el.textContent === 'Confirm reopening').disabled`,
    ),
  )
  await fill('#reopen-reason', 'The problem returned after restarting.')
  await click('Confirm reopening')
  await waitText('Reopening #1')
  assert.equal(cycles.length, 2)
  assert.equal(cycles[1].outcome, 'CLOSED')
  assert.equal(tickets[0].closedAt, null)
  await waitText('Message deleted')
  assert(!await evaluate(`[...document.querySelectorAll('button')].some(el => ['Edit message', 'Delete message', 'Delete attachment'].includes(el.textContent))`))
  assert(!requests.some((item) => /subtasks/.test(item)))
  await fill('[aria-label="Message content"]', 'Draft written before another reopening')
  cycles[0].isCurrent = false
  cycles[0].isEnded = true
  cycles[0].outcome = 'RESOLVED'
  cycles.unshift({ ...cycles[0], id: cycles[0].id + 1, sequenceNumber: cycles[0].sequenceNumber + 1, isCurrent: true, isEnded: false, outcome: null })
  tickets[0].currentCycle = cycles[0]
  await click('Send message')
  await waitText('Reload the latest information')
  await click('Refresh conversation')
  await waitText('This draft belongs to an earlier cycle')
  assert.equal(await evaluate(`document.querySelector('[aria-label="Message content"]').value`), 'Draft written before another reopening')
  assert(await evaluate(`[...document.querySelectorAll('button')].find(el => el.textContent === 'Send message').disabled`))
  await click('Use reviewed text as new message')
  await click('Send message')
  await waitText('Reopening #2')
  assert.equal(communication.records.at(-1).createdInCycleId, cycles[0].id)
  console.log('PASS: stale-cycle draft remains blocked until explicit review and new-cycle submission')
  const screenshot = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(
    join(tmpdir(), 'eds-employee-desktop.png'),
    Buffer.from(screenshot.data, 'base64'),
  )
  console.log(
    'PASS: closure, required reopen reason, preserved public history, no subtask requests',
  )
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  })
  await until(
    () =>
      evaluate(
        'document.querySelector("aside").getBoundingClientRect().right <= 1',
      ),
    'mobile navigation hidden',
  )
  await evaluate(
    `document.querySelector('[aria-label="Open navigation"]').click()`,
  )
  await until(
    () =>
      evaluate(
        'document.querySelector("aside").getBoundingClientRect().left >= 0',
      ),
    'mobile navigation opens',
  )
  await evaluate(
    `document.querySelector('[aria-label="Close navigation"]').click()`,
  )
  await until(
    () =>
      evaluate(
        'document.querySelector("aside").getBoundingClientRect().right <= 1',
      ),
    'mobile navigation closes',
  )
  assert(
    await evaluate('document.documentElement.scrollWidth <= window.innerWidth'),
  )
  const mobile = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(
    join(tmpdir(), 'eds-employee-mobile.png'),
    Buffer.from(mobile.data, 'base64'),
  )
  console.log(
    'PASS: mobile navigation opens/closes and layout has no horizontal overflow',
  )
  await evaluate(`document.querySelector('[aria-label="Notifications"]').click()`)
  await waitText('Support replied on ticket #142.')
  assert(await evaluate(`document.querySelector('dialog').getBoundingClientRect().right <= innerWidth && document.querySelector('dialog').getBoundingClientRect().left >= 0`))
  await evaluate(`document.querySelector('[aria-label="Close dialog"]').click()`)
  await navigate('/tickets/142')
  await waitText('Reopening #1')
  console.log('PASS: detail deep link survives reload')
  await navigate('/tickets/999')
  await waitText('This ticket could not be found')
  listFailure = true
  await navigate('/tickets')
  await waitText('Service temporarily unavailable')
  listFailure = false
  await click('Try again')
  await waitText('VPN disconnects repeatedly')
  await fill('input[aria-label="Search tickets"]', 'no match')
  await waitText('No matching requests')
  emptyCategories = true
  await navigate('/tickets/new')
  await waitText('Ticket categories have not been configured')
  assert(
    await evaluate(
      `[...document.querySelectorAll('button')].find(el => el.textContent === 'Submit ticket').disabled`,
    ),
  )
  emptyCategories = false
  console.log(
    'PASS: unavailable ticket, retry, search-empty and missing-catalog states',
  )
  await navigate('/tickets')
  await waitText('VPN disconnects repeatedly')
  const before = refreshCount
  expired = true
  await evaluate(
    `document.querySelector('[aria-label="Refresh tickets"]').click()`,
  )
  await waitText('VPN disconnects repeatedly')
  assert.equal(refreshCount, before + 1)
  loggedIn = false
  retryUnauthorized = true
  await evaluate(
    `document.querySelector('[aria-label="Refresh tickets"]').click()`,
  )
  await waitText('Welcome back')
  console.log('PASS: token renewal and deactivated session redirects to login')
  role = 'ADMIN'
  loggedIn = true
  retryUnauthorized = false
  const count = requests.filter((item) => item.includes('/tickets')).length
  await navigate('/tickets')
  await waitText('This page is not available for your account')
  assert.equal(
    requests.filter((item) => item.includes('/tickets')).length,
    count,
  )
  assert.deepEqual(browserErrors, [])
  console.log('PASS: admin route exclusion; no browser runtime errors')
  console.log(
    'Browser acceptance checks passed. Screenshots: ' +
      join(tmpdir(), 'eds-employee-{desktop,mobile}.png'),
  )
} catch (error) {
  console.error(
    'Browser failure details:',
    await evaluate('document.body.innerText').catch(() => ''),
    browserErrors,
    requests,
    mutations,
  )
  throw error
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    await send('Browser.close').catch(() => {})
    socket.close()
  }
  browser.kill()
  preview.kill()
  await delay(500)
  // Delete only this test's generated browser profile under the OS temp directory.
  if (
    resolve(profile).startsWith(resolve(tmpdir()) + sep) &&
    profile.includes('eds-browser-')
  ) {
    rmSync(profile, {
      recursive: true,
      force: true,
      maxRetries: 30,
      retryDelay: 200,
    })
  }
}
