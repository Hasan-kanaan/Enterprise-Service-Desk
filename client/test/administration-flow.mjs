import { pageFixture } from './list-fixture.mjs'
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
  id: 1,
  username: 'Admin user',
  role: 'ADMIN',
  email: 'admin@example.test',
}
let refreshCount = 0,
  expired = false,
  failure = false,
  failureCode = 409,
  rejectMutation = false
const accounts = [
  {
    id: 1,
    username: 'Admin user',
    email: 'admin@example.test',
    role: 'ADMIN',
    status: 'ACTIVE',
    region: null,
    department: null,
  },
  {
    id: 2,
    username: 'Root user',
    email: 'root@example.test',
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
    region: null,
    department: null,
  },
  {
    id: 3,
    username: 'Employee Eve',
    email: 'eve@example.test',
    role: 'EMPLOYEE',
    status: 'ACTIVE',
    region: { id: 1, name: 'Beirut' },
    department: { id: 1, name: 'Operations' },
  },
  {
    id: 4,
    username: 'Agent Ali',
    email: 'ali@example.test',
    role: 'AGENT',
    status: 'ACTIVE',
    region: null,
    department: null,
  },
  {
    id: 5,
    username: 'Agent Maya',
    email: 'maya@example.test',
    role: 'AGENT',
    status: 'ACTIVE',
    region: null,
    department: null,
  },
  {
    id: 6,
    username: 'Manager Sara',
    email: 'sara@example.test',
    role: 'MANAGER',
    status: 'ACTIVE',
    region: null,
    department: null,
  },
  {
    id: 7,
    username: 'Inactive agent',
    email: 'inactive@example.test',
    role: 'AGENT',
    status: 'INACTIVE',
    region: null,
    department: null,
  },
]
const catalogs = {
  regions: [{ id: 1, name: 'Beirut' }],
  departments: [{ id: 1, name: 'Operations' }],
  specialties: [{ id: 1, name: 'Networking' }],
}
const teams = []
const member = (id) => {
  const {
    id: userId,
    username,
    role,
    status,
  } = accounts.find((a) => a.id === id)
  return { userId, user: { id: userId, username, role, status } }
}
const viewTeam = (t) => ({
  ...t,
  region: catalogs.regions.find((r) => r.id === t.regionId) ?? null,
  teamLead: accounts.find((a) => a.id === t.teamLeadId) ?? null,
  managers: t.managerId
    ? [
        {
          managerId: t.managerId,
          manager: accounts.find((a) => a.id === t.managerId),
        },
      ]
    : [],
  specialties: [],
})
function response(request) {
  const url = new URL(request.url), path = url.pathname,
    body = request.postData ? JSON.parse(request.postData) : {}
  requests.push(`${request.method} ${path}`)
  if (path === '/auth/refresh') {
    refreshCount++
    return [201, { accessToken: `token-${refreshCount}`, user }]
  }
  if (path === '/notifications') return [200, []]
  if (path === '/notifications/unread-count') return [200, { count: 0 }]
  if (expired) {
    expired = false
    return [401, { message: 'Expired access' }]
  }
  if (failure && request.method === 'GET')
    return [503, { message: 'Administration temporarily unavailable' }]
  if (path === '/ticket-workspace' && user.role === 'AGENT')
    return [200, { ledTeams: [] }]
  assert(
    !path.startsWith('/tickets') &&
      !path.startsWith('/ticket-workspace') &&
      !path.startsWith('/ticket-options'),
    'Administrative UI requested ticket data',
  )
  if (!['ADMIN', 'SUPER_ADMIN'].includes(user.role))
    return [403, { message: 'Forbidden' }]
  if (request.method !== 'GET') {
    mutations.push({ path, body, method: request.method })
    if (rejectMutation) {
      rejectMutation = false
      return [
        failureCode,
        {
          message:
            failureCode === 409
              ? 'Concurrent change; reload administration'
              : 'Record unavailable or forbidden',
        },
      ]
    }
  }
  if (path === '/users') return [200, pageFixture(accounts, url, false)]
  if (path === '/auth/accounts') {
    assert(body.role !== 'SUPER_ADMIN')
    assert(user.role === 'SUPER_ADMIN' || body.role !== 'ADMIN')
    const created = {
      id: accounts.length + 1,
      ...body,
      status: 'ACTIVE',
      region: null,
      department: null,
    }
    delete created.password
    accounts.push(created)
    return [201, { user: created }]
  }
  const lifecycle = path.match(/^\/users\/(\d+)\/status$/)
  if (lifecycle) {
    const account = accounts.find((a) => a.id === Number(lifecycle[1]))
    assert(account.role !== 'SUPER_ADMIN')
    assert(user.role === 'SUPER_ADMIN' || account.role !== 'ADMIN')
    account.status = body.status
    if (body.status === 'INACTIVE') {
      for (const team of teams) {
        if (team.teamLeadId === account.id) team.teamLeadId = null
        if (team.managerId === account.id) team.managerId = null
      }
    }
    return [200, { id: account.id, status: account.status }]
  }
  const lookup = path.match(/^\/organization\/teams\/(\d+)\/(people|members)$/)
  if (lookup && request.method === 'GET') {
    const team = teams.find(t => t.id === Number(lookup[1]))
    if (!team) return [404, { message: 'Team not found' }]
    if (lookup[2] === 'members') return [200, pageFixture(team.memberIds.map(id => member(id).user), url, false)]
    const purpose = url.searchParams.get('purpose'), search = (url.searchParams.get('search') ?? '').toLowerCase()
    return [200, search ? accounts.filter(a => a.status === 'ACTIVE' && a.username.toLowerCase().includes(search) && (purpose === 'manager' ? a.role === 'MANAGER' : a.role === 'AGENT' && (purpose === 'member' ? !team.memberIds.includes(a.id) : team.memberIds.includes(a.id) && !teams.some(t => t.id !== team.id && t.teamLeadId === a.id)))).slice(0, 20).map(({id, username}) => ({id, username})) : []]
  }
  if (path === '/organization/teams') {
    if (request.method === 'GET') return [200, teams.map(viewTeam)]
    assert(body.scope === 'GLOBAL' ? !('regionId' in body) : body.regionId > 0)
    const t = {
      id: teams.length + 1,
      name: body.name,
      scope: body.scope,
      regionId: body.regionId ?? null,
      teamLeadId: null,
      managerId: null,
      memberIds: [],
    }
    teams.push(t)
    return [201, t]
  }
  const catalog = path.match(
    /^\/organization\/(regions|departments|specialties)$/,
  )
  if (catalog) {
    if (request.method === 'GET') return [200, catalogs[catalog[1]]]
    const item = { id: catalogs[catalog[1]].length + 1, name: body.name }
    catalogs[catalog[1]].push(item)
    return [201, item]
  }
  const assignment = path.match(
    /^\/organization\/teams\/(\d+)\/(members|lead|manager)(?:\/(\d+))?$/,
  )
  if (assignment) {
    const t = teams.find((t) => t.id === Number(assignment[1])),
      id = Number(assignment[3])
    assert(t)
    if (request.method === 'DELETE') {
      if (assignment[2] === 'members') {
        assert.notEqual(t.teamLeadId, id)
        t.memberIds = t.memberIds.filter((member) => member !== id)
      } else if (assignment[2] === 'lead') t.teamLeadId = null
      else t.managerId = null
      return [200, { message: 'Removed' }]
    }
    const account = accounts.find((a) => a.id === id)
    assert.equal(account.status, 'ACTIVE')
    assert.equal(
      account.role,
      assignment[2] === 'manager' ? 'MANAGER' : 'AGENT',
    )
    if (assignment[2] === 'members') {
      assert(!t.memberIds.includes(id))
      t.memberIds.push(id)
    } else if (assignment[2] === 'lead') {
      assert(t.memberIds.includes(id))
      assert(
        !teams.some((other) => other.id !== t.id && other.teamLeadId === id),
      )
      t.teamLeadId = id
    } else {
      assert.equal(t.managerId, null)
      t.managerId = id
    }
    return [201, {}]
  }
  return [404, { message: 'Unknown endpoint' }]
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
  await until(() => evaluate(`[...document.querySelectorAll('button,a')].some(el => el.textContent.trim() === ${JSON.stringify(text)} && !el.disabled)`), `ready: ${text}`)
  await evaluate(
    `(() => { const el = [...document.querySelectorAll('button,a')].find(el => el.textContent.trim() === ${JSON.stringify(text)}); if (!el || el.disabled) throw Error('Missing or disabled: ' + ${JSON.stringify(text)}); el.click(); })()`,
  )
  await delay(70)
}
async function fill(selector, value) {
  if (value && selector === '[aria-label="Organization assignee"]') {
    await fill('[aria-label="Organization assignee search"]', accounts.find(a => a.id === Number(value)).username)
    await until(() => evaluate(`[...document.querySelector(${JSON.stringify(selector)}).options].some(o => o.value === ${JSON.stringify(value)} && !o.disabled)`), 'lookup choice')
  }
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
              value: 'content-type,authorization,x-requested-with',
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
    )
  const action = async (text) => {
    await until(
      () =>
        evaluate(
          `[...document.querySelectorAll('button')].some(el=>el.textContent.trim()===${JSON.stringify(text)}&&!el.disabled)`,
        ),
      text,
    )
    await click(text)
    await until(() => evaluate('!!document.querySelector("dialog")'), 'dialog')
  }
  const confirm = async () => {
    await click('Confirm')
    await until(
      () => evaluate('!document.querySelector("dialog")'),
      'mutation finished',
    )
  }
  const rowClick = async (id, text) => {
    await until(
      () => evaluate(`!!document.querySelector('[data-account-id="${id}"]')`),
      'account refreshed',
    )
    await evaluate(
      `(() => {const el=[...document.querySelector('[data-account-id="${id}"]').querySelectorAll('button')].find(el=>el.textContent===${JSON.stringify(text)});if(!el)throw Error('Missing account action');el.click()})()`,
    )
    await until(
      () => evaluate('!!document.querySelector("dialog")'),
      'account dialog',
    )
  }
  const createUser = async (role, prefix) => {
    await action('Create account')
    await fill(
      '[aria-label="Account username"]',
      `${prefix}-${role.toLowerCase()}`,
    )
    await fill(
      '[aria-label="Account email"]',
      `${prefix}-${role.toLowerCase()}@test.invalid`,
    )
    await fill('[aria-label="Account password"]', 'TestingPass123!')
    await fill('[aria-label="Account role"]', role)
    await confirm()
    await waitText(`${prefix}-${role.toLowerCase()}`)
  }
  await navigate('/admin')
  await waitText('Administration workspace')
  await click('Manage accounts')
  await waitText('Employee Eve')
  await waitText('Region: Beirut / Department: Operations')
  assert(
    !(await evaluate(
      `document.querySelector('[data-account-id="2"]').querySelector('button')!==null`,
    )),
  )
  assert(
    !(await evaluate(
      `document.querySelector('[data-account-id="1"]').querySelector('button')!==null`,
    )),
  )
  await action('Create account')
  assert.deepEqual(
    await evaluate(
      `[...document.querySelector('[aria-label="Account role"]').options].map(o=>o.value).filter(Boolean)`,
    ),
    ['MANAGER', 'AGENT', 'EMPLOYEE'],
  )
  assert(
    await evaluate(
      `[...document.querySelectorAll('button')].find(el=>el.textContent==='Confirm').disabled`,
    ),
  )
  await click('Cancel')
  for (const role of ['EMPLOYEE', 'AGENT', 'MANAGER'])
    await createUser(role, 'admin-created')
  await rowClick(3, 'Deactivate')
  await waitText('administratively offboards')
  await waitText('No replacement people')
  await confirm()
  assert.equal(accounts[2].status, 'INACTIVE')
  await rowClick(3, 'Activate')
  await waitText('Previous sessions and responsibilities are not restored')
  await confirm()
  assert.equal(accounts[2].status, 'ACTIVE')
  for (const id of [4, 6]) {
    await rowClick(id, 'Deactivate')
    await confirm()
    assert.equal(accounts.find((a) => a.id === id).status, 'INACTIVE')
    await rowClick(id, 'Activate')
    await confirm()
    assert.equal(accounts.find((a) => a.id === id).status, 'ACTIVE')
  }
  await absent('Delete user')
  console.log(
    'PASS: ADMIN account creation matrix, safe directory labels, lifecycle confirmations, no privileged/deletion controls',
  )
  await navigate('/admin/organization')
  await waitText('No records yet')
  for (const [tab, name] of [
    ['Regions', 'Tripoli'],
    ['Departments', 'Finance'],
    ['Specialties', 'Identity'],
  ]) {
    await click(tab)
    await action(
      `Create ${tab === 'Specialties' ? 'specialty' : tab.toLowerCase().slice(0, -1)}`,
    )
    await fill('[aria-label="Organization name"]', name)
    await confirm()
    await waitText(name)
  }
  await click('Teams')
  await action('Create team')
  await fill('[aria-label="Organization name"]', 'Regional support')
  await fill('[aria-label="Team coverage"]', 'REGION')
  assert(
    await evaluate(
      `[...document.querySelectorAll('button')].find(el=>el.textContent==='Confirm').disabled`,
    ),
  )
  await fill('[aria-label="Team region"]', '1')
  await confirm()
  await waitText('Regional support')
  await action('Create team')
  await fill('[aria-label="Organization name"]', 'Global support')
  await fill('[aria-label="Team coverage"]', 'REGION')
  await fill('[aria-label="Team region"]', '1')
  await fill('[aria-label="Team coverage"]', 'GLOBAL')
  await confirm()
  await waitText('Global support')
  assert.equal(teams[1].regionId, null)
  await click('Regional support')
  await waitText('Team members')
  await waitText('REGION - Beirut')
  await action('Add member')
  await absent('Inactive agent')
  await fill('[aria-label="Organization assignee"]', '4')
  await confirm()
  await waitText('Agent Ali')
  await action('Add member')
  await fill('[aria-label="Organization assignee"]', '5')
  await confirm()
  await waitText('Agent Maya')
  await action('Assign Team Lead')
  await fill('[aria-label="Organization assignee"]', '4')
  await confirm()
  await waitText('Remove Team Lead')
  assert(
    await evaluate(
      `[...document.querySelectorAll('.admin-row')].find(row=>row.textContent.includes('Agent Ali')).querySelector('button').disabled`,
    ),
  )
  await action('Assign TeamManager')
  await waitText('organizational only')
  await fill('[aria-label="Organization assignee"]', '6')
  await confirm()
  await waitText('Manager Sara')
  assert(
    !(await evaluate(
      `[...document.querySelectorAll('button')].some(el=>el.textContent==='Assign TeamManager')`,
    )),
  )
  await navigate('/admin/organization/teams/2')
  await waitText('GLOBAL - all regions')
  await action('Add member')
  await fill('[aria-label="Organization assignee"]', '4')
  await confirm()
  await waitText('Agent Ali')
  await action('Assign Team Lead')
  assert(
    !(await evaluate(
      `[...document.querySelector('[aria-label="Organization assignee"]').options].some(o=>o.value==='4')`,
    )),
  )
  await click('Cancel')
  await action('Assign TeamManager')
  await fill('[aria-label="Organization assignee"]', '6')
  await confirm()
  await waitText('Manager Sara')
  assert.equal(teams[0].managerId, teams[1].managerId)
  await action('Remove TeamManager')
  await confirm()
  await waitText('Assign TeamManager')
  assert.equal(teams[1].managerId, null)
  await navigate('/admin/organization/teams/1')
  await waitText('Regional support')
  await action('Assign Team Lead')
  await fill('[aria-label="Organization assignee"]', '5')
  await confirm()
  assert.equal(teams[0].teamLeadId, 5)
  await action('Remove Team Lead')
  await confirm()
  await waitText('Assign Team Lead')
  assert.equal(teams[0].teamLeadId, null)
  await evaluate(
    `[...document.querySelectorAll('.admin-row')].find(row=>row.textContent.includes('Agent Ali')).querySelector('button').click()`,
  )
  await confirm()
  assert.deepEqual(teams[0].memberIds, [5])
  await action('Remove TeamManager')
  await confirm()
  assert.equal(teams[0].managerId, null)
  console.log(
    'PASS: all exposed catalog/team creation, coverage, multiple memberships, Team Lead constraints/replacement/removal, organizational manager assignment/removal',
  )
  await action('Add member')
  await fill('[aria-label="Organization assignee"]', '4')
  rejectMutation = true
  await click('Confirm')
  await waitText('Reload administration')
  assert(
    await evaluate(
      `[...document.querySelectorAll('button')].find(el=>el.textContent==='Confirm').disabled`,
    ),
  )
  await click('Reload administration')
  await waitText('Regional support')
  for (const code of [403, 404]) {
    await action('Add member')
    await fill('[aria-label="Organization assignee"]', '4')
    failureCode = code
    rejectMutation = true
    await click('Confirm')
    await waitText('Reload administration')
    await click('Reload administration')
    await waitText('Regional support')
  }
  failureCode = 409
  failure = true
  await click('Refresh organization')
  await waitText('Administration temporarily unavailable')
  failure = false
  await click('Try again')
  await waitText('Regional support')
  await navigate('/admin/organization/teams/999')
  await waitText('Team not found')
  console.log('PASS: 403/404/409 reload, missing team, network error and retry')
  user = { ...user, id: 2, username: 'Root user', role: 'SUPER_ADMIN' }
  await navigate('/admin/accounts')
  await waitText('Accounts')
  await action('Create account')
  assert.deepEqual(
    await evaluate(
      `[...document.querySelector('[aria-label="Account role"]').options].map(o=>o.value).filter(Boolean)`,
    ),
    ['ADMIN', 'MANAGER', 'AGENT', 'EMPLOYEE'],
  )
  await click('Cancel')
  for (const role of ['ADMIN', 'MANAGER', 'AGENT', 'EMPLOYEE'])
    await createUser(role, 'root-created')
  await rowClick(1, 'Deactivate')
  await confirm()
  assert.equal(accounts[0].status, 'INACTIVE')
  await rowClick(1, 'Activate')
  await confirm()
  assert.equal(accounts[0].status, 'ACTIVE')
  assert(
    !(await evaluate(
      `!!document.querySelector('[data-account-id="2"]').querySelector('button')`,
    )),
  )
  for (const id of [3, 4, 6]) {
    await rowClick(id, 'Deactivate')
    await confirm()
    assert.equal(accounts.find((a) => a.id === id).status, 'INACTIVE')
    await rowClick(id, 'Activate')
    await confirm()
    assert.equal(accounts.find((a) => a.id === id).status, 'ACTIVE')
  }
  const originalAccountsLength = accounts.length
  for (let i = 0; i < 61; i++) accounts.push({ id: 1000 + i, username: `scale account ${i}`, email: `scale${i}@example.test`, role: i < 30 ? 'AGENT' : 'EMPLOYEE', status: i < 30 ? 'INACTIVE' : 'ACTIVE', region: null, department: null })
  await navigate('/admin/accounts?search=scale')
  await until(() => evaluate("document.querySelectorAll('[data-account-id]').length === 25"), 'bounded directory')
  await click('Load more')
  await until(() => evaluate("document.querySelectorAll('[data-account-id]').length === 50"), 'directory continuation')
  await click('Load more')
  await until(() => evaluate("document.querySelectorAll('[data-account-id]').length === 61"), 'directory final page')
  await waitText('End of results')
  await fill('[aria-label="Account role filter"]', 'AGENT')
  await until(() => evaluate("document.querySelectorAll('[data-account-id]').length === 25 && !document.querySelector('[data-account-id=\"1060\"]')"), 'role reset')
  await fill('[aria-label="Account status filter"]', 'ACTIVE')
  await waitText('No matching accounts')
  await navigate('/admin/accounts?search=scale&role=EMPLOYEE&status=ACTIVE')
  await until(() => evaluate("document.querySelectorAll('[data-account-id]').length === 25"), 'directory deep filters')
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Account role filter\"]').value"), 'EMPLOYEE')
  const scaleTeam = teams.find(t => t.id === 1)
  const originalMemberIds = scaleTeam.memberIds
  scaleTeam.memberIds = accounts.filter(a => a.id >= 1000).map(a => a.id)
  await navigate('/admin/organization/teams/1')
  await waitText('Load more')
  await fill('[aria-label="Search team members"]', 'scale account 60')
  await waitText('scale account 60')
  await until(() => evaluate("!document.body.textContent.includes('scale account 59')"), 'member search is server scoped')
  scaleTeam.memberIds = originalMemberIds
  accounts.splice(originalAccountsLength)
  await navigate('/admin/accounts')
  await waitText('Accounts')
  console.log('PASS: bounded account pages, role/status/search reset, deep reload and member lookup pagination')
  const before = refreshCount
  expired = true
  await createUser('EMPLOYEE', 'renewed')
  assert.equal(refreshCount, before + 1)
  await fill('[aria-label="Search accounts"]', 'no such identity')
  await waitText('No matching accounts')
  await fill('[aria-label="Search accounts"]', '')
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
    'mobile sidebar closed',
  )
  assert(
    await evaluate('document.documentElement.scrollWidth <= window.innerWidth'),
  )
  const screenshot = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(
    join(tmpdir(), 'eds-admin-mobile.png'),
    Buffer.from(screenshot.data, 'base64'),
  )
  console.log(
    'PASS: SUPER_ADMIN requested creation matrix, lifecycle authority, no SUPER_ADMIN mutation, account-creation token recovery and mobile layout',
  )
  for (const role of ['ADMIN', 'SUPER_ADMIN']) {
    user = { ...user, role }
    for (const path of [
      '/work/intake',
      '/work/tickets/142',
      '/work/subtasks/1',
      '/tickets/142',
    ]) {
      const count = requests.length
      await navigate(path)
      await waitText('This page is not available')
      assert(
        !requests
          .slice(count)
          .some(
            (r) => r.includes('/tickets') || r.includes('/ticket-workspace'),
          ),
      )
    }
  }
  for (const role of ['EMPLOYEE', 'AGENT', 'MANAGER']) {
    user = { ...user, role }
    for (const path of [
      '/admin',
      '/admin/accounts',
      '/admin/organization',
      '/admin/organization/teams/1',
    ]) {
      const count = requests.length
      await navigate(path)
      await waitText('This page is not available')
      assert(
        !requests
          .slice(count)
          .some((r) => r.includes('/users') || r.includes('/organization')),
      )
    }
  }
  assert.deepEqual(browserErrors, [])
  console.log(
    'PASS: protected administration routes, no administrative ticket requests, no runtime/console errors',
  )
  console.log('Administration browser acceptance checks passed.')
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
