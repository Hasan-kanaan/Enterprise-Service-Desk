// Dependency-free browser acceptance checks using installed Chrome/Edge and CDP.
// Run after `pnpm build`: node test/employee-flow.mjs. API responses are isolated fixtures.
import assert from 'node:assert/strict'
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
let user = {
  id: 20,
  username: 'Sara',
  role: 'MANAGER',
  email: 'sara@example.test',
}
let refreshCount = 0,
  expired = false,
  loggedIn = true,
  conflict = false,
  failure = false,
  forbidden = false
const options = {
  categories: [{ id: 4, name: 'Network' }],
  regions: [{ id: 2, name: 'Beirut' }],
  departments: [{ id: 3, name: 'Operations' }],
  tags: [{ id: 7, name: 'VPN' }],
}
const people = [
  { id: 20, username: 'Sara' },
  { id: 21, username: 'Omar' },
  { id: 31, username: 'Ali' },
  { id: 32, username: 'Lead Layla' },
  { id: 33, username: 'Mohammad' },
]
const teams = [
  {
    id: 8,
    name: 'Network support',
    agents: people.filter((p) => [31, 32].includes(p.id)),
  },
  { id: 9, name: 'Infrastructure', agents: people.filter((p) => p.id === 33) },
]
const now = '2026-09-22T08:00:00.000Z'
const person = (id) => people.find((p) => p.id === id) ?? null
const owners = (ticket) => ({
  manager: person(ticket.assignedManagerId),
  team: teams.find((t) => t.id === ticket.assignedTeamId) ?? null,
  agent: person(ticket.assignedAgentId),
})
const cycle = (ticket, sequenceNumber = 1) => ({
  id: ticket.id * 10 + sequenceNumber,
  sequenceNumber,
  type: sequenceNumber === 1 ? 'ORIGINAL' : 'REOPENED',
  isCurrent: true,
  isEnded: false,
  startedAt: now,
  startedBy: person(20),
  startReason: sequenceNumber === 1 ? null : 'Issue returned',
  startDisposition: null,
  outcome: null,
  endedAt: null,
  endedBy: null,
  closedAt: null,
  closedBy: null,
  resolutionSummary: null,
  ownership: { ...owners(ticket), basis: 'CURRENT', capturedAt: null },
})
const makeTicket = (id, title, manager = 20, team = 8, agent = 31) => ({
  id,
  title,
  description: 'Investigate the reported issue.',
  categoryId: 4,
  tagIds: [7],
  allRegions: true,
  allDepartments: true,
  affectedRegionIds: [],
  affectedDepartmentIds: [],
  priority: 'MEDIUM',
  status: team ? 'IN_PROGRESS' : 'NEW',
  requesterId: 10,
  assignedManagerId: manager,
  assignedTeamId: team,
  assignedAgentId: agent,
  createdAt: now,
  updatedAt: now,
  resolvedAt: null,
  closedAt: null,
})
const tickets = [
  makeTicket(142, 'VPN intake', null, null, null),
  makeTicket(143, 'Owned network issue'),
  makeTicket(144, 'Private infrastructure issue', 21, 9, 33),
  makeTicket(145, 'Former Ali assignment', 21, 9, 33),
]
const history = Object.fromEntries(
  tickets.map((ticket) => [ticket.id, [cycle(ticket)]]),
)
history[143][0].isCurrent = false
history[143][0].isEnded = true
history[143][0].outcome = 'RESOLVED'
history[143][0].endedAt = now
history[143].unshift(cycle(tickets[1], 2))
const makeTask = (
  id,
  ticketId,
  title,
  team = 8,
  agent = 31,
  cycleId = history[ticketId][0].id,
) => ({
  id,
  ticketId,
  createdInCycleId: cycleId,
  title,
  description: 'Authorized subtask content',
  status: 'TODO',
  assignedTeamId: team,
  assignedAgentId: agent,
  completedAt: null,
  completedById: null,
  createdAt: now,
  updatedAt: now,
})
const subtasks = [
  makeTask(601, 143, 'Current diagnostics'),
  makeTask(602, 143, 'Delegated firewall check', 9, 33),
  makeTask(603, 143, 'Original investigation task', 8, 31, 1431),
  makeTask(604, 144, 'Private parent delegated work', 8, 31),
]
const terminal = (t) => ['RESOLVED', 'CLOSED', 'CANCELLED'].includes(t.status)
const leads = (team) => user.role === 'AGENT' && user.id === 32 && team === 8
const owned = (t) => user.role === 'MANAGER' && t.assignedManagerId === user.id
const visible = (t) =>
  user.role === 'MANAGER'
    ? owned(t) || (t.status === 'NEW' && t.assignedManagerId === null)
    : user.role === 'AGENT' &&
      (t.assignedAgentId === user.id || leads(t.assignedTeamId))
const taskVisible = (s) =>
  owned(tickets.find((t) => t.id === s.ticketId)) ||
  (user.role === 'AGENT' &&
    (s.assignedAgentId === user.id || leads(s.assignedTeamId)))
function taskView(s) {
  return {
    ...s,
    assignedAgent: person(s.assignedAgentId),
    assignedTeam: teams.find((t) => t.id === s.assignedTeamId) ?? null,
    completedBy: person(s.completedById),
  }
}
function permissions(t) {
  const active = !terminal(t),
    manager = owned(t),
    lead = leads(t.assignedTeamId),
    work =
      manager ||
      lead ||
      (user.role === 'AGENT' && t.assignedAgentId === user.id)
  const transitions = {
    NEW: [],
    ASSIGNED: ['IN_PROGRESS'],
    IN_PROGRESS: ['WAITING_FOR_EMPLOYEE', 'BLOCKED', 'RESOLVED'],
    WAITING_FOR_EMPLOYEE: ['IN_PROGRESS'],
    BLOCKED: ['IN_PROGRESS'],
    RESOLVED: manager ? ['CLOSED'] : [],
    CLOSED: [],
    CANCELLED: [],
  }
  return {
    edit: active && work,
    take:
      user.role === 'MANAGER' &&
      t.status === 'NEW' &&
      t.assignedManagerId === null,
    transfer: active && manager,
    assignTeam: active && manager,
    assignAgent: active && (manager || lead),
    createSubtask: active && (manager || lead),
    reopen: manager && ['RESOLVED', 'CLOSED'].includes(t.status),
    statuses: work ? transitions[t.status] : [],
  }
}
function response(request) {
  const url = new URL(request.url),
    path = url.pathname,
    body = request.postData ? JSON.parse(request.postData) : {}
  requests.push(`${request.method} ${path}`)
  if (path === '/auth/refresh') {
    refreshCount++
    return loggedIn
      ? [201, { accessToken: `token-${refreshCount}`, user }]
      : [401, { message: 'Inactive account' }]
  }
  if (expired) {
    expired = false
    return [401, { message: 'Token expired' }]
  }
  if (!loggedIn) return [401, { message: 'Inactive account' }]
  if (failure) return [503, { message: 'Service temporarily unavailable' }]
  if (path === '/ticket-options') return [200, options]
  if (path === '/ticket-workspace')
    return [
      200,
      { ledTeams: leads(8) ? [{ id: 8, name: 'Network support' }] : [] },
    ]
  if (path === '/tickets' && request.method === 'GET')
    return [200, tickets.filter(visible)]
  if (path === '/tickets/subtasks')
    return [
      200,
      subtasks.filter(
        (s) =>
          taskVisible(s) &&
          (!url.searchParams.has('currentWork') ||
            (['TODO', 'IN_PROGRESS'].includes(s.status) &&
              s.createdInCycleId === history[s.ticketId][0].id &&
              !terminal(tickets.find((t) => t.id === s.ticketId)))),
      ),
    ]
  const submatch = path.match(
    /^\/(?:ticket-workspace|tickets)\/subtasks\/(\d+)$/,
  )
  if (submatch) {
    const s = subtasks.find((item) => item.id === Number(submatch[1]))
    if (!s || !taskVisible(s)) return [404, { message: 'Subtask not found' }]
    const t = tickets.find((t) => t.id === s.ticketId),
      historical = s.createdInCycleId !== history[t.id][0].id,
      frozen = historical || terminal(t),
      manager = owned(t),
      lead = leads(s.assignedTeamId)
    if (request.method === 'GET')
      return [
        200,
        {
          subtask: taskView(s),
          historical,
          frozen,
          permissions: {
            edit: !frozen,
            assignTeam: !frozen && manager,
            assignAgent: !frozen && (manager || lead),
          },
          teams: !frozen
            ? manager
              ? teams
              : lead
                ? teams.filter((t) => t.id === s.assignedTeamId)
                : []
            : [],
        },
      ]
    mutations.push({ path, body })
    if (conflict) {
      conflict = false
      return [409, { message: 'Stale work' }]
    }
    assert(!frozen)
    if (!(manager || lead)) assert(!('assignedAgentId' in body))
    if (lead && !manager) assert.equal(body.assignedTeamId, s.assignedTeamId)
    Object.assign(s, body)
    s.completedAt = s.status === 'COMPLETED' ? now : null
    s.completedById = s.status === 'COMPLETED' ? user.id : null
    return [200, s]
  }
  const match = path.match(
    /^\/(?:ticket-workspace\/)?tickets\/(\d+)(?:\/(history|manager|assignment|status|reopen|subtasks))?$/,
  )
  if (match) {
    const t = tickets.find((t) => t.id === Number(match[1]))
    if (!t || !visible(t)) return [404, { message: 'Ticket not found' }]
    const p = permissions(t)
    if (path.startsWith('/ticket-workspace/'))
      return [
        200,
        {
          permissions: p,
          teams: p.assignAgent
            ? owned(t)
              ? teams
              : teams.filter((team) => team.id === t.assignedTeamId)
            : [],
          managers: p.transfer
            ? people.filter((p) => [20, 21].includes(p.id))
            : [],
        },
      ]
    if (match[2] === 'history')
      return [
        200,
        {
          ticketId: t.id,
          currentCycleId: history[t.id][0].id,
          subtasksAccess: owned(t)
            ? 'ALL'
            : user.role === 'MANAGER'
              ? 'NONE'
              : 'FILTERED',
          cycles: history[t.id].map((c) => ({
            ...c,
            ownership: c.isEnded
              ? c.ownership
              : { ...owners(t), basis: 'CURRENT', capturedAt: null },
            subtasks: subtasks
              .filter(
                (s) =>
                  s.ticketId === t.id &&
                  s.createdInCycleId === c.id &&
                  taskVisible(s),
              )
              .map(taskView),
          })),
        },
      ]
    if (request.method === 'GET')
      return [
        200,
        { ...t, ownership: owners(t), currentCycle: history[t.id][0] },
      ]
    mutations.push({ path, body })
    if (conflict) {
      conflict = false
      return [409, { message: 'Stale write' }]
    }
    if (forbidden) {
      forbidden = false
      return [403, { message: 'Responsibility changed' }]
    }
    if (match[2] === 'manager') {
      assert(p.take || p.transfer)
      t.assignedManagerId = body.assignedManagerId
    } else if (match[2] === 'assignment') {
      assert(p.assignAgent)
      if (!p.assignTeam) assert.equal(body.teamId, t.assignedTeamId)
      assert(
        body.agentId === null ||
          teams
            .find((team) => team.id === body.teamId)
            .agents.some((p) => p.id === body.agentId),
      )
      t.assignedTeamId = body.teamId
      t.assignedAgentId = body.agentId
      if (t.status === 'NEW') t.status = 'ASSIGNED'
    } else if (match[2] === 'status') {
      assert(p.statuses.includes(body.status))
      t.status = body.status
      if (terminal(t)) {
        const c = history[t.id][0]
        c.isEnded = true
        c.outcome = t.status
        c.endedAt = now
        c.ownership = { ...owners(t), basis: 'END_OF_WORK', capturedAt: now }
        c.resolutionSummary = body.resolutionSummary ?? null
      }
    } else if (match[2] === 'reopen') {
      assert(p.reopen)
      assert(body.reason.trim())
      history[t.id][0].isCurrent = false
      t.status = 'IN_PROGRESS'
      history[t.id].unshift({
        ...cycle(t, history[t.id].length + 1),
        startReason: body.reason,
      })
    } else if (match[2] === 'subtasks') {
      assert(p.createSubtask)
      if (!p.assignTeam) assert.equal(body.assignedTeamId, t.assignedTeamId)
      const s = makeTask(
        700 + subtasks.length,
        t.id,
        body.title,
        body.assignedTeamId ?? null,
        body.assignedAgentId ?? null,
      )
      s.description = body.description
      subtasks.push(s)
      return [201, s]
    } else {
      assert(p.edit)
      Object.assign(t, body)
    }
    return [200, t]
  }
  return [404, { message: 'Unknown fixture endpoint' }]
}
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
    if (
      data.method === 'Runtime.consoleAPICalled' &&
      data.params.type === 'error'
    )
      browserErrors.push(data.params.args)
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
              value: 'GET,POST,PATCH,OPTIONS',
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
  const absent = async (text) =>
    assert(
      !(await evaluate(
        `document.body.textContent.includes(${JSON.stringify(text)})`,
      )),
      `Unexpected text: ${text}`,
    )
  const button = async (text) =>
    evaluate(
      `[...document.querySelectorAll('button')].some(el => el.textContent.trim() === ${JSON.stringify(text)})`,
    )
  const action = async (text) => {
    await until(() => button(text), text)
    await click(text)
    await waitText('Confirm')
  }
  await navigate('/dashboard')
  await waitText('Support overview')
  await waitText('Owned network issue')
  await absent('Private infrastructure issue')
  await navigate('/work/intake')
  await waitText('VPN intake')
  await absent('Owned network issue')
  assert(
    await evaluate(`!!document.querySelector('a[href="/work/tickets/142"]')`),
  )
  await navigate('/work/tickets/142')
  await waitText('Shared intake.')
  assert(!(await button('Edit details')))
  assert(!(await button('Create subtask')))
  await action('Take responsibility')
  await send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
  })
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
  })
  await until(
    () => evaluate('!document.querySelector("dialog")'),
    'Escape dismisses confirmation',
  )
  assert.equal(mutations.length, 0)
  await action('Take responsibility')
  await click('Confirm')
  await waitText('Change assignment')
  await action('Change assignment')
  await fill('[aria-label="Assignment team"]', '8')
  await fill('[aria-label="Assignment agent"]', '31')
  await click('Confirm')
  await waitText('Assigned')
  await action('Change status')
  await fill('[aria-label="Next ticket status"]', 'IN_PROGRESS')
  await click('Confirm')
  await waitText('In progress')
  await click('Edit details')
  await fill('#ticket-title', 'VPN now owned')
  await click('Save changes')
  await waitText('VPN now owned')
  await until(() => button('Edit details'), 'edit saved')
  await action('Change assignment')
  await fill('[aria-label="Assignment team"]', '9')
  await waitText('Explicitly clear or replace')
  assert(
    await evaluate(
      `[...document.querySelectorAll('button')].find(el=>el.textContent==='Confirm').disabled`,
    ),
  )
  await fill('[aria-label="Assignment agent"]', '')
  await click('Confirm')
  await waitText('Infrastructure')
  await action('Change assignment')
  await fill('[aria-label="Assignment team"]', '8')
  await fill('[aria-label="Assignment agent"]', '31')
  await click('Confirm')
  await waitText('Network support')
  console.log(
    'PASS: manager intake, claim, real routing, explicit incompatible-agent clearing, status and metadata',
  )
  await action('Create subtask')
  await fill('[aria-label="Subtask title"]', 'Manager-created work')
  await fill('[aria-label="Subtask description"]', 'Review logs')
  await fill('[aria-label="Assignment team"]', '9')
  await fill('[aria-label="Assignment agent"]', '33')
  await click('Confirm')
  await waitText('Manager-created work')
  const created = subtasks.find((s) => s.title === 'Manager-created work')
  await navigate(`/work/subtasks/${created.id}`)
  await waitText('Manager-created work')
  await action('Update subtask')
  await fill('[aria-label="Subtask status"]', 'COMPLETED')
  await click('Confirm')
  await waitText('COMPLETED')
  assert.equal(created.completedById, 20)
  await navigate('/work/tickets/143')
  await waitText('Original investigation task')
  await waitText('Frozen history')
  await waitText('Delegated firewall check')
  await navigate('/work/subtasks/603')
  await waitText('permanently frozen')
  assert(!(await button('Update subtask')))
  await navigate('/work/tickets/142')
  await waitText('VPN now owned')
  await action('Change status')
  await fill('[aria-label="Next ticket status"]', 'RESOLVED')
  await fill('[aria-label="Resolution summary"]', 'Updated network client')
  await click('Confirm')
  await waitText('This ticket is frozen.')
  assert(!(await button('Edit details')))
  assert(!(await button('Change assignment')))
  assert(!(await button('Create subtask')))
  await action('Reopen ticket')
  await fill('[aria-label="Reopening reason"]', 'Issue returned')
  await click('Confirm')
  await waitText('Reopening #1')
  assert.equal(history[142].length, 2)
  console.log(
    'PASS: manager subtask creation/completion, full history, frozen old work, terminal restrictions and reopen',
  )
  conflict = true
  await action('Change assignment')
  await click('Confirm')
  await waitText('Reload ticket')
  const writes = mutations.length
  await delay(150)
  assert.equal(mutations.length, writes)
  await click('Reload ticket')
  await waitText('VPN now owned')
  forbidden = true
  await action('Change status')
  await fill('[aria-label="Next ticket status"]', 'BLOCKED')
  await click('Confirm')
  await waitText('You do not have access')
  await click('Cancel')
  await action('Transfer responsibility')
  await fill('[aria-label="Responsible manager"]', '21')
  await click('Confirm')
  await waitText('My tickets')
  await absent('VPN now owned')
  await navigate('/work/tickets/142')
  await waitText('could not be found')
  console.log(
    'PASS: explicit 409 reload without write retry, 403 handling, transfer removes former-owner access',
  )
  user = { ...user, id: 31, username: 'Ali', role: 'AGENT' }
  await navigate('/work/tickets')
  await waitText('My assigned tickets')
  await waitText('Owned network issue')
  await absent('Private infrastructure issue')
  await absent('Former Ali assignment')
  await navigate('/work/tickets/143')
  await waitText('Owned network issue')
  await absent('Delegated firewall check')
  assert(!(await button('Create subtask')))
  assert(!(await button('Change assignment')))
  assert(!(await button('Transfer responsibility')))
  assert(!(await button('Reopen ticket')))
  await action('Change status')
  await fill('[aria-label="Next ticket status"]', 'BLOCKED')
  await click('Confirm')
  await waitText('Blocked')
  await action('Change status')
  await fill('[aria-label="Next ticket status"]', 'IN_PROGRESS')
  await click('Confirm')
  await waitText('In progress')
  const requestStart = requests.length
  await navigate('/work/subtasks/604')
  await waitText('Private parent delegated work')
  await absent('Private infrastructure issue')
  assert(
    !requests.slice(requestStart).some((r) => /GET \/tickets(?:$|\/)/.test(r)),
  )
  await action('Update subtask')
  assert(
    !(await evaluate(
      `!!document.querySelector('[aria-label="Assignment team"]')`,
    )),
  )
  await fill('[aria-label="Subtask status"]', 'COMPLETED')
  await click('Confirm')
  await waitText('COMPLETED')
  assert.equal(subtasks.find((s) => s.id === 604).completedById, 31)
  await navigate('/work/subtasks/603')
  await waitText('permanently frozen')
  assert(!(await button('Update subtask')))
  await navigate('/work/tickets/144')
  await waitText('could not be found')
  console.log(
    'PASS: agent current assignments, lifecycle work, filtered history, subtask-only work without parent requests',
  )
  user = { ...user, id: 32, username: 'Lead Layla' }
  await navigate('/work/team')
  await waitText('Led-team tickets')
  await waitText('Owned network issue')
  await absent('Private infrastructure issue')
  await navigate('/work/tickets/143')
  await waitText('Owned network issue')
  assert(!(await button('Transfer responsibility')))
  assert(!(await button('Reopen ticket')))
  await absent('Delegated firewall check')
  await action('Change assignment')
  assert(
    await evaluate(
      `document.querySelector('[aria-label="Assignment team"]').disabled`,
    ),
  )
  assert(
    !(await evaluate(
      `document.querySelector('dialog').textContent.includes('Infrastructure')`,
    )),
  )
  await fill('[aria-label="Assignment agent"]', '32')
  await click('Confirm')
  await waitText('Lead Layla')
  await action('Create subtask')
  await fill('[aria-label="Subtask title"]', 'Lead-created work')
  assert(
    await evaluate(
      `document.querySelector('[aria-label="Assignment team"]').disabled`,
    ),
  )
  await fill('[aria-label="Assignment agent"]', '31')
  await click('Confirm')
  await waitText('Lead-created work')
  const leadTask = subtasks.find((s) => s.title === 'Lead-created work')
  assert.equal(leadTask.assignedTeamId, 8)
  await navigate(`/work/subtasks/${leadTask.id}`)
  await action('Update subtask')
  assert(
    await evaluate(
      `document.querySelector('[aria-label="Assignment team"]').disabled`,
    ),
  )
  await fill('[aria-label="Assignment agent"]', '32')
  await fill('[aria-label="Subtask status"]', 'IN_PROGRESS')
  await click('Confirm')
  await waitText('IN PROGRESS')
  await navigate('/work/subtasks/602')
  await waitText('could not be found')
  console.log(
    'PASS: Team Lead relationship-based queue, own-team routing/subtasks, no cross-team or manager controls',
  )
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  })
  await navigate('/work/team')
  await waitText('Owned network issue')
  await until(
    () =>
      evaluate(
        'document.querySelector("aside").getBoundingClientRect().right <= 1',
      ),
    'mobile sidebar closed',
  )
  assert(
    await evaluate('document.documentElement.scrollWidth <= window.innerWidth'),
  )
  const mobile = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(
    join(tmpdir(), 'eds-operational-mobile.png'),
    Buffer.from(mobile.data, 'base64'),
  )
  failure = true
  await click('Refresh workspace')
  await waitText('Service temporarily unavailable')
  failure = false
  await click('Try again')
  await waitText('Owned network issue')
  const count = refreshCount
  expired = true
  await click('Refresh workspace')
  await waitText('Owned network issue')
  await until(() => Promise.resolve(refreshCount > count), 'token renewal')
  loggedIn = false
  await click('Refresh workspace')
  await waitText('Welcome back')
  user = { ...user, role: 'ADMIN' }
  loggedIn = true
  const before = requests.length
  await navigate('/work/tickets/143')
  await waitText('This page is not available')
  assert(
    !requests
      .slice(before)
      .some((r) => r.includes('/tickets') || r.includes('/ticket-workspace')),
  )
  assert.deepEqual(browserErrors, [])
  console.log(
    'PASS: mobile layout, network retry, 401 recovery/session rejection, admin exclusion, no runtime errors',
  )
  console.log('Operational browser acceptance checks passed.')
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
      maxRetries: 10,
      retryDelay: 200,
    })
  }
}
