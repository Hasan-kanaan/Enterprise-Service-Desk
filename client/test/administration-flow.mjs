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
let catalogDelay = 0
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
const configuration = { categories: [], tags: [] }
const specialtyLinks = new Map()
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
  specialties: (specialtyLinks.get(`teams/${t.id}`) ?? []).map(id => ({ specialty: catalogs.specialties.find(item => item.id === id) })),
})
let securitySession = true
let securitySequence = 0
let securityRateLimit = false
const securityMail = []
const securityPasswords = new Map()
function sendSecurityMail(account, type) {
  const token = `fixture-${++securitySequence}`
  securityMail.push({ account, type, token, used: false })
  return token
}
function response(request) {
  const url = new URL(request.url), path = url.pathname,
    body = request.postData ? JSON.parse(request.postData) : {}
  requests.push(`${request.method} ${path}`)
  if (path === '/auth/activate' || path === '/auth/reset-password') {
    const type = path.endsWith('activate') ? 'activation' : 'reset'
    const message = securityMail.find(m => m.token === body.token && m.type === type && !m.used)
    if (!message) return [400, { message: 'Invalid, expired or used link' }]
    message.used = true
    message.account.activatedAt = new Date().toISOString()
    securityPasswords.set(message.account.email, body.newPassword)
    securitySession = false
    return [201, { message: 'Password saved. Sign in to continue.' }]
  }
  if (path === '/auth/forgot-password' || path === '/auth/resend-activation') {
    if (securityRateLimit) return [429, { message: 'Too many requests' }]
    const account = accounts.find(a => a.email === body.email)
    if (account) sendSecurityMail(account, path.endsWith('forgot-password') ? 'reset' : 'activation')
    return [201, { message: 'If an eligible account exists, instructions have been sent.' }]
  }
  if (path === '/auth/login') {
    const account = accounts.find(a => a.email === body.email)
    if (!account?.activatedAt || securityPasswords.get(body.email) !== body.password) return [401, { message: 'Invalid credentials' }]
    user = account; securitySession = true
    return [201, { accessToken: 'security-session', user }]
  }
  if (path === '/auth/setup/status') return [200, { available: false }]
  const securityAction = path.match(/^\/auth\/accounts\/(\d+)\/(reset-password|resend-activation)$/)
  if (securityAction) {
    assert.deepEqual(body, {})
    sendSecurityMail(accounts.find(a => a.id === Number(securityAction[1])), securityAction[2] === 'reset-password' ? 'reset' : 'activation')
    return [201, { delivery: 'SENT' }]
  }
  if (path === '/auth/refresh') {
    if (!securitySession) return [401, { message: 'Invalid session' }]

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
  if (process.argv.includes('--identity-lifecycle')) {
    const own = { id: 42, requesterId: user.id, title: 'Own support request', description: 'Help please', status: 'NEW', priority: 'MEDIUM', categoryId: 1, allRegions: true, allDepartments: true, tagIds: [], affectedRegionIds: [], affectedDepartmentIds: [], assignedManagerId: null, assignedTeamId: null, assignedAgentId: null, ownership: {manager:null,team:null,agent:null}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), currentCycle: null }
    if (path === '/ticket-workspace') return [200, {ledTeams:[]}]
    if (path === '/ticket-options') return [200, {categories:[{id:1,name:'IT'}],tags:[],regions:[],departments:[]}]
    if (path === '/tickets/summary') return [200, {counts:[1,0,0]}]
    if (path === '/tickets') { assert.equal(url.searchParams.get('queue'), 'requests'); return [200, {items:[own],hasMore:false,nextCursor:null}] }
    if (path === '/tickets/42') return [200, own]
    if (path === '/tickets/42/history') return [200, {ticketId:42,cycles:[],currentCycleId:null,subtasksAccess:'NONE',hasMore:false,nextCursor:null}]
    if (path === '/tickets/42/attachments') return [200, []]
    if (path === '/tickets/42/messages') return [200, {records:[],cycles:[],canPost:true,canReadNotes:false,hasMore:false,nextCursor:null}]
  }
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
  const config = path.match(/^\/ticket-configuration\/(categories|tags)(?:\/(\d+)(?:\/(archive|reactivate))?)?$/)
  if (config) {
    const [, kind, id, operation] = config
    const rows = configuration[kind]
    if (request.method === 'GET') return [200, rows]
    if (!id) { const record = { id: rows.length + 1, name: body.name, archivedAt: null }; rows.push(record); return [201, record] }
    const record = rows.find(item => item.id === Number(id))
    if (operation) record.archivedAt = operation === 'archive' ? new Date().toISOString() : null
    else record.name = body.name
    return [operation ? 201 : 200, record]
  }
  const specialty = path.match(/^\/organization\/(agents|teams)\/(\d+)\/specialties(?:\/(\d+))?$/)
  if (specialty) {
    const key = `${specialty[1]}/${specialty[2]}`
    const links = specialtyLinks.get(key) ?? []
    if (request.method === 'GET') return [200, links.map(id => catalogs.specialties.find(item => item.id === id))]
    specialtyLinks.set(key, request.method === 'DELETE' ? links.filter(id => id !== Number(specialty[3])) : [...links, Number(specialty[3])])
    return [request.method === 'DELETE' ? 200 : 201, { message: 'Updated' }]
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
    assert(!('password' in body))
    created.activatedAt = null
    sendSecurityMail(created, 'activation')
    accounts.push(created)
    return [201, { user: created, delivery: 'SENT' }]
  }
  const roleChange = path.match(/^\/users\/(\d+)\/role$/)
  if (roleChange) {
    const account = accounts.find(a => a.id === Number(roleChange[1]))
    assert(account.role !== 'SUPER_ADMIN' && body.role !== 'SUPER_ADMIN')
    assert(user.role === 'SUPER_ADMIN' || (account.role !== 'ADMIN' && body.role !== 'ADMIN'))
    const managerlessTeams = teams.filter(t => t.managerId === account.id && t.scope === 'REGION' && !t.archivedAt).map(({id,name}) => ({id,name}))
    for (const team of teams) {
      if (team.managerId === account.id) team.managerId = null
      if (team.teamLeadId === account.id) team.teamLeadId = null
      if (account.role === 'AGENT') team.memberIds = team.memberIds.filter(id => id !== account.id)
    }
    account.role = body.role
    return [200, {id:account.id, role:account.role, changed:true, managerlessTeams}]
  }
  const lifecycle = path.match(/^\/users\/(\d+)\/status$/)
  const metadata = path.match(/^\/users\/(\d+)$/)
  if (metadata) {
    assert.equal(request.method, 'PATCH')
    assert(Object.keys(body).every(key => ['username', 'displayName', 'jobTitle', 'phoneNumber', 'regionId', 'departmentId'].includes(key)))
    const account = accounts.find(a => a.id === Number(metadata[1]))
    if (body.username && accounts.some(a => a.id !== account.id && a.username === body.username)) return [409, { message: 'Username already exists' }]
    for (const field of ['displayName', 'jobTitle']) if (body[field] !== undefined) account[field] = body[field]
    if (body.username !== undefined) account.username = body.username
    if (body.phoneNumber !== undefined) account.phoneNumber = body.phoneNumber
    for (const [field, catalog] of [['region', 'regions'], ['department', 'departments']]) {
      if (body[`${field}Id`] !== undefined) account[field] = body[`${field}Id`] === null ? null : catalogs[catalog].find(r => r.id === body[`${field}Id`])
    }
    return [200, account]
  }
  if (lifecycle) {
    const account = accounts.find((a) => a.id === Number(lifecycle[1]))
    assert(account.role !== 'SUPER_ADMIN')
    assert(user.role === 'SUPER_ADMIN' || account.role !== 'ADMIN')
    const managerlessTeams = teams.filter(t => t.managerId === account.id && t.scope === 'REGION' && !t.archivedAt).map(({id,name}) => ({id,name}))
    account.status = body.status
    if (body.status === 'INACTIVE') {
      for (const team of teams) {
        if (team.teamLeadId === account.id) team.teamLeadId = null
        if (team.managerId === account.id) team.managerId = null
      }
    }
    return [200, { id: account.id, status: account.status, managerlessTeams }]
  }
  const coverage = path.match(/^\/organization\/teams\/(\d+)\/coverage$/)
  if (coverage) {
    assert.equal(request.method, 'PATCH')
    const team = teams.find(t => t.id === Number(coverage[1]))
    assert(body.scope === 'GLOBAL' ? !('regionId' in body) : catalogs.regions.some(r => r.id === body.regionId && !r.archivedAt))
    team.scope = body.scope
    team.regionId = body.regionId ?? null
    return [200, { id: team.id, name: team.name, scope: team.scope, regionId: team.regionId, archivedAt: team.archivedAt ?? null }]
  }
  const maintenance = path.match(/^\/organization\/(regions|departments|specialties|teams)\/(\d+)(?:\/(archive|reactivate))?$/)
  if (maintenance) {
    const [ , catalog, id, operation ] = maintenance
    const item = (catalog === 'teams' ? teams : catalogs[catalog]).find(r => r.id === Number(id))
    if (!item) return [404, { message: 'Record unavailable' }]
    if (operation === 'archive' && catalog === 'regions' && teams.some(t => t.regionId === item.id && !t.archivedAt))
      return [409, { message: "Archive the region's active teams first." }]
    if (!operation) { assert.equal(request.method, 'PATCH'); item.name = body.name.trim() }
    else {
      item.archivedAt = operation === 'archive' ? new Date().toISOString() : null
      if (catalog === 'teams' && operation === 'archive') { item.teamLeadId = null; item.managerId = null }
    }
    return [operation ? 201 : 200, { id: item.id, name: item.name, archivedAt: item.archivedAt ?? null }]
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
  await until(() => evaluate(`!!document.querySelector(${JSON.stringify(selector)})`), `input ready: ${selector}`)
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
        if (catalogDelay && /\/organization\/(regions|departments)$/.test(new URL(request.url).pathname)) await delay(catalogDelay)
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
    assert.equal(await evaluate(`!!document.querySelector('[aria-label="Account password"]')`), false)
    await fill('[aria-label="Account display name"]', `${prefix}-${role.toLowerCase()}`)
    await fill('[aria-label="Account job title"]', 'Analyst')
    await fill('[aria-label="Account role"]', role)
    await confirm()
    await waitText(`${prefix}-${role.toLowerCase()}`)
  }
  if (process.argv.includes('--identity-lifecycle')) {
    for (const role of ['EMPLOYEE','AGENT','MANAGER','ADMIN','SUPER_ADMIN']) {
      user = {...user, role}
      await navigate('/tickets'); await waitText('Own support request'); await waitText('My Requests')
      const links = await evaluate(`[...document.querySelectorAll('aside a')].map(a=>a.getAttribute('href'))`)
      assert(links.includes('/tickets'))
      assert.equal(links.some(l=>l?.startsWith('/work')), ['AGENT','MANAGER'].includes(role))
      assert.equal(links.includes('/admin'), ['ADMIN','SUPER_ADMIN'].includes(role))
      await navigate('/tickets/42'); await waitText('Cancel ticket'); await waitText('Conversation')
      await absent('Internal notes'); await absent('Assign team'); await absent('Create subtask')
      await navigate('/tickets/new'); await waitText('New support request')
    }
    user = {...user,role:'ADMIN'}
    await navigate('/admin/accounts'); await waitText('Employee Eve')
    await createUser('EMPLOYEE', 'identity')
    assert.equal(mutations.at(-1).body.displayName, 'identity-employee')
    assert.equal(mutations.at(-1).body.jobTitle, 'Analyst')
    await rowClick(3,'Edit account'); await until(()=>evaluate(`!!document.querySelector('[aria-label="Home Region"]')`),'metadata choices')
    await fill('[aria-label="Account display name"]','Eve Example'); await fill('[aria-label="Account job title"]','Director'); await confirm(); await waitText('Eve Example')
    await rowClick(3,'Change role'); await waitText('Resend activation')
    assert.deepEqual(await evaluate(`[...document.querySelector('[aria-label="New role"]').options].map(o=>o.value).filter(Boolean)`), ['MANAGER','AGENT'])
    await fill('[aria-label="New role"]','AGENT'); await confirm()
    specialtyLinks.set('agents/4',[1])
    await rowClick(4,'Change role'); await waitText('Team Lead and Team memberships will be removed')
    await fill('[aria-label="New role"]','EMPLOYEE'); await confirm()
    // Locate by text because account action ordering may change.
    await evaluate(`{const b=[...document.querySelector('[data-account-id="4"]').querySelectorAll('button')].find(b=>b.textContent.trim()==='Manage specialties');b.click()}`)
    await waitText('Networking')
    assert(await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Add specialty').disabled`))
    await action('Remove specialty'); await confirm(); await waitText('No specialties linked')
    teams.push({id:1,name:'Regional help',scope:'REGION',regionId:1,managerId:6,teamLeadId:null,memberIds:[]},{id:2,name:'Global help',scope:'GLOBAL',regionId:null,managerId:6,teamLeadId:null,memberIds:[]})
    await rowClick(6,'Change role'); await waitText('operational tickets return to intake')
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
    assert(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'))
    await fill('[aria-label="New role"]','AGENT'); await confirm(); await waitText('These active regional Teams now require a Manager')
    await evaluate(`[...document.querySelectorAll('a')].find(a=>a.textContent==='Review Teams').click()`)
    await waitText('Regional help'); await absent('Global help'); await waitText('Active regional Teams requiring a Manager')
    assert(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'))
    await navigate('/tickets'); await waitText('Own support request')
    assert(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'))
    accounts.find(a=>a.id===6).role = 'MANAGER'; teams[0].managerId = 6
    await navigate('/admin/accounts'); await waitText('Manager Sara')
    await rowClick(6,'Deactivate'); await confirm(); await waitText('These active regional Teams now require a Manager')
    assert.equal(teams[0].managerId, null)
    user = {...user,role:'SUPER_ADMIN'}
    await navigate('/admin/accounts'); await waitText('Eve Example')
    await rowClick(3,'Change role')
    assert((await evaluate(`[...document.querySelector('[aria-label="New role"]').options].map(o=>o.value)`)).includes('ADMIN'))
    await fill('[aria-label="New role"]','ADMIN'); await confirm()
    assert.equal(accounts.find(a=>a.id===3).role,'ADMIN')
    console.log('PASS: all-role My Requests, Admin support isolation, Work/Admin navigation, identity metadata, role matrix/warnings, pending guidance, retained specialties, managerless Team filter, mobile')
  } else if (process.argv.includes('--account-metadata')) {
    for (const catalog of ['regions', 'departments']) {
      catalogs[catalog][0].archivedAt = new Date().toISOString()
      catalogs[catalog].push({ id: 2, name: `Active ${catalog}` }, { id: 3, name: `Other archived ${catalog}`, archivedAt: new Date().toISOString() })
    }
    accounts[2].region = catalogs.regions[0]; accounts[2].department = catalogs.departments[0]
    await navigate('/admin/accounts')
    await waitText('Beirut (ARCHIVED)')
    for (const id of [1, 2]) assert.equal(await evaluate(`[...document.querySelector('[data-account-id="${id}"]').querySelectorAll('button')].some(b=>b.textContent==='Edit account')`), false)
    for (const id of [3,4,5,6,7]) assert.equal(await evaluate(`[...document.querySelector('[data-account-id="${id}"]').querySelectorAll('button')].some(b=>b.textContent==='Edit account')`), true)
    catalogDelay = 600
    await rowClick(3, 'Edit account')
    await waitText('Loading home organization choices...')
    assert(await evaluate(`document.querySelector('dialog button[type=submit]').disabled`))
    catalogDelay = 0
    await until(() => evaluate(`!!document.querySelector('[aria-label="Home Region"]')`), 'home choices loaded')
    assert.equal(await evaluate(`!!document.querySelector('dialog input[type=email], dialog [aria-label="Account email"], dialog [aria-label="Account role"]')`), false)
    for (const field of ['Home Region', 'Home Department']) {
      assert.equal(await evaluate(`document.querySelector('[aria-label="${field}"]').value`), '1')
      assert.deepEqual(await evaluate(`[...document.querySelector('[aria-label="${field}"]').options].map(o=>o.value)`), ['', '1', '2'])
    }
    await fill('[aria-label="Account username"]', '  renamed.employee  ')
    await fill('[aria-label="Account phone"]', '+96170123456')
    const before = mutations.length
    await evaluate(`(() => {const f=document.querySelector('dialog form'); f.requestSubmit(); f.requestSubmit()})()`)
    await until(() => evaluate('!document.querySelector("dialog")'), 'saved')
    assert.equal(mutations.length, before + 1)
    assert.deepEqual(mutations.at(-1).body, {username: 'renamed.employee', phoneNumber: '+96170123456'})
    await waitText('renamed.employee'); await waitText('Beirut (ARCHIVED)')
    await rowClick(3, 'Edit account'); await until(() => evaluate(`!!document.querySelector('[aria-label="Home Region"]')`), 'home choices loaded')
    await fill('[aria-label="Home Region"]', '2'); await fill('[aria-label="Home Department"]', '2'); await confirm()
    await waitText('Active regions')
    await rowClick(3, 'Edit account'); await until(() => evaluate(`!!document.querySelector('[aria-label="Home Region"]')`), 'home choices loaded')
    for (const field of ['Home Region', 'Home Department']) assert.deepEqual(await evaluate(`[...document.querySelector('[aria-label="${field}"]').options].map(o=>o.value)`), ['', '2'])
    await fill('[aria-label="Account phone"]', '')
    await fill('[aria-label="Home Region"]', ''); await fill('[aria-label="Home Department"]', ''); await confirm()
    assert.deepEqual(mutations.at(-1).body, {phoneNumber: null, regionId: null, departmentId: null})
    await rowClick(3, 'Edit account'); await until(() => evaluate(`!!document.querySelector('[aria-label="Home Region"]')`), 'home choices loaded')
    await fill('[aria-label="Account username"]', accounts[3].username)
    // API normalizes usernames; use a lower-case duplicate fixture.
    accounts[3].username = accounts[3].username.toLowerCase()
    await click('Confirm'); await waitText('Username already exists')
    assert(await evaluate(`document.querySelector('dialog button[type=submit]').disabled`))
    await click('Reload administration'); await waitText('renamed.employee')
    for (const code of [400,404]) {
      await rowClick(3, 'Edit account'); await until(() => evaluate(`!!document.querySelector('[aria-label="Home Region"]')`), 'home choices loaded')
      await fill('[aria-label="Account phone"]', '+96170123457')
      failureCode = code; rejectMutation = true
      await click('Confirm'); await until(() => evaluate('!!document.querySelector("[role=alert]")'), 'metadata error')
      await click(code === 400 ? 'Cancel' : 'Reload administration')
    }
    await send('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:1,mobile:true})
    failure = true
    await rowClick(7, 'Edit account')
    await waitText('Administration temporarily unavailable')
    assert(await evaluate(`document.querySelector('dialog button[type=submit]').disabled`))
    failure = false
    await click('Try again')
    await until(() => evaluate(`!!document.querySelector('[aria-label="Home Region"]')`), 'home choices loaded')
    assert(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'))
    await fill('[aria-label="Account phone"]', '+96170123458'); await confirm()
    user = {...user, role:'SUPER_ADMIN'}
    await navigate('/admin/accounts'); await waitText('Admin user')
    await rowClick(1, 'Edit account'); await until(() => evaluate(`!!document.querySelector('[aria-label="Home Region"]')`), 'home choices loaded'); await click('Cancel')
    assert.deepEqual(browserErrors, [])
    console.log('PASS: focused account metadata authority, fields/clearing, archived retention, active choices, immutable email/role, duplicate submission, 400/404/409 and mobile')
  } else if (process.argv.includes('--team-coverage')) {
    catalogs.regions.push({id: 2, name: 'Tripoli'}, {id: 3, name: 'Archived region', archivedAt: new Date().toISOString()})
    teams.push({id: 1, name: 'Network', scope: 'REGION', regionId: 1, teamLeadId: 4, managerId: 5, memberIds: [4]})
    await navigate('/admin/organization/teams/1')
    await waitText('REGION - Beirut')
    await action('Change coverage')
    await waitText('Existing ticket assignments, memberships, responsibilities, specialties and history are preserved.')
    assert.equal(await evaluate(`document.querySelector('[aria-label="Team region"]').options.length`), 3)
    await fill('[aria-label="Team region"]', '2')
    await confirm()
    await waitText('REGION - Tripoli')
    await action('Change coverage')
    await fill('[aria-label="Team coverage"]', 'GLOBAL')
    assert.equal(await evaluate(`!!document.querySelector('[aria-label="Team region"]')`), false)
    await waitText('GLOBAL Teams may be selected by any responsible Manager')
    await fill('[aria-label="Team coverage"]', 'REGION')
    assert.equal(await evaluate(`document.querySelector('[aria-label="Team region"]').value`), '')
    await fill('[aria-label="Team coverage"]', 'GLOBAL')
    const before = mutations.length
    await evaluate(`(() => {const f = document.querySelector('dialog form'); f.requestSubmit(); f.requestSubmit()})()`)
    await until(() => evaluate('!document.querySelector("dialog")'), 'saved')
    assert.equal(mutations.length, before + 1)
    await waitText('GLOBAL - all regions')
    assert.equal(teams[0].regionId, null)
    for (const code of [400,404,409]) {
      await action('Change coverage')
      failureCode = code; rejectMutation = true
      await click('Confirm')
      await until(() => evaluate('!!document.querySelector("[role=alert]")'), 'coverage error')
      rejectMutation = false
      await click(code === 400 ? 'Cancel' : 'Reload administration')
      await waitText('GLOBAL - all regions')
    }
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
    await action('Change coverage')
    await fill('[aria-label="Team coverage"]', 'REGION')
    await waitText('REGION Teams may be selected for future routing only by their organizational TeamManager.')
    assert(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'))
    await fill('[aria-label="Team region"]', '1')
    await confirm()
    await waitText('REGION - Beirut')
    assert.deepEqual(teams[0].memberIds, [4]); assert.equal(teams[0].teamLeadId, 4); assert.equal(teams[0].managerId, 5)
    teams[0].archivedAt = new Date().toISOString(); catalogs.regions[0].archivedAt = new Date().toISOString()
    await click('Refresh organization'); await waitText('ARCHIVED')
    await action('Change coverage')
    assert.equal(await evaluate(`document.querySelector('[aria-label="Team region"]').value`), '')
    assert.equal(await evaluate(`document.querySelector('[aria-label="Team region"]').options.length`), 2)
    await fill('[aria-label="Team coverage"]', 'GLOBAL'); await confirm()
    await waitText('GLOBAL - all regions'); await waitText('ARCHIVED')
    assert(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'))
    assert.deepEqual(browserErrors, [])
    console.log('PASS: focused Team coverage transitions, active destinations, confirmation, duplicate submit, 400/404/409, archived Team and mobile')
  } else if (process.argv.includes('--ticket-configuration')) {
    await navigate('/admin/ticket-configuration')
    await waitText('No records yet')
    for (const kind of ['category', 'tag']) {
      await action(`Create ${kind}`)
      await fill('[aria-label="Configuration name"]', `  Test ${kind}  `)
      const before = mutations.length
      await evaluate(`(() => { const form = document.querySelector('dialog form'); form.requestSubmit(); form.requestSubmit(); })()`)
      await until(() => evaluate('!document.querySelector("dialog")'), 'saved')
      assert.equal(mutations.length, before + 1)
      await waitText(`Test ${kind}`)
      const rowAction = async (name, button) => {
        await evaluate(`(() => {const row=[...document.querySelectorAll('.admin-row')].find(el => el.textContent.includes(${JSON.stringify(name)})); [...row.querySelectorAll('button')].find(el => el.textContent === ${JSON.stringify(button)}).click()})()`)
        await until(() => evaluate('!!document.querySelector("dialog")'), 'dialog')
      }
      await rowAction(`Test ${kind}`, 'Archive')
      await click('Cancel')
      assert.equal(configuration[kind === 'category' ? 'categories' : 'tags'][0].archivedAt, null)
      await rowAction(`Test ${kind}`, 'Archive'); await confirm(); await waitText('ARCHIVED')
      await rowAction(`Test ${kind}`, 'Rename'); await fill('[aria-label="Configuration name"]', `Renamed ${kind}`); await confirm(); await waitText(`Renamed ${kind}`)
      await rowAction(`Renamed ${kind}`, 'Reactivate'); await confirm(); await waitText('ACTIVE')
    }
    rejectMutation = true; failureCode = 409
    await action('Create category'); await fill('[aria-label="Configuration name"]', 'Duplicate'); await click('Confirm'); await waitText('Concurrent change')
    await click('Reload administration'); await waitText('Renamed category')
    failure = true; await click('Refresh configuration'); await waitText('temporarily unavailable'); failure = false; await click('Try again'); await waitText('Renamed category')
    teams.push({ id: 1, name: 'Specialty team', scope: 'GLOBAL', regionId: null, teamLeadId: null, managerId: null, memberIds: [4] })
    catalogs.specialties.push({ id: 2, name: 'Archived specialty', archivedAt: new Date().toISOString() })
    await navigate('/admin/organization/teams/1'); await waitText('Specialty team')
    await action('Add specialty')
    assert(!(await evaluate(`document.querySelector('[aria-label="Specialty"]').textContent.includes('Archived specialty')`)))
    await fill('[aria-label="Specialty"]', '1'); await confirm(); await waitText('Remove specialty')
    await action('Remove specialty'); await confirm(); await waitText('No specialties linked')
    await action('Remove member'); await waitText('clears the Agent'); rejectMutation = true; await click('Confirm'); await waitText('Concurrent change'); await click('Reload administration'); await waitText('Agent Ali')
    await action('Remove member'); await confirm(); await waitText('No members assigned')
    teams[0].archivedAt = new Date().toISOString(); specialtyLinks.set('teams/1', [2])
    await click('Refresh organization'); await waitText('Archived specialty (ARCHIVED)')
    assert(await evaluate(`[...document.querySelectorAll('button')].find(el=>el.textContent==='Add specialty').disabled`))
    await action('Remove specialty'); await confirm()
    accounts.find(a => a.id === 4).activatedAt = new Date().toISOString()
    await navigate('/admin/accounts'); await waitText('Agent Ali')
    await evaluate(`document.querySelector('[data-account-id="4"] button').click()`)
    await waitText('Add specialty'); await action('Add specialty'); await fill('[aria-label="Specialty"]', '1'); await confirm(); await waitText('Remove specialty')
    await action('Remove specialty'); await confirm(); await waitText('No specialties linked')
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
    for (const path of ['/admin/accounts', '/admin/ticket-configuration', '/admin/organization/teams/1']) {
      await navigate(path); await delay(250)
      assert(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), path)
    }
    console.log('PASS: configuration lifecycles, empty/error/conflict/pending, specialty links, member confirmation/errors, mobile and admin ticket isolation')
  } else if (process.argv.includes('--organization-maintenance')) {
    teams.push({ id: 1, name: 'Regional support', scope: 'REGION', regionId: 1, teamLeadId: 4, managerId: 5, memberIds: [4] })
    await navigate('/admin/organization')
    await waitText('Regional support')
    await click('Regions')
    await action('Archive')
    await click('Confirm')
    await waitText("Archive the region's active teams first.")
    assert(await evaluate(`[...document.querySelectorAll('button')].find(el => el.textContent === 'Confirm').disabled`))
    await click('Reload administration')
    await click('Teams')
    await action('Archive')
    await waitText('Current Team/Agent operational assignments may be cleared')
    await click('Cancel')
    assert.equal(teams[0].archivedAt, undefined)
    for (const tab of ['Teams', 'Regions', 'Departments', 'Specialties']) {
      await click(tab)
      await action('Rename')
      await fill('[aria-label="Organization name"]', '   ')
      assert(await evaluate(`[...document.querySelectorAll('button')].find(el => el.textContent === 'Confirm').disabled`))
      await fill('[aria-label="Organization name"]', `  Updated ${tab}  `)
      await confirm()
      await waitText(`Updated ${tab}`)
      await action('Archive')
      const before = mutations.length
      await evaluate(`(() => { const form = document.querySelector('dialog form'); form.requestSubmit(); form.requestSubmit(); })()`)
      await until(() => evaluate('!document.querySelector("dialog")'), 'archived')
      assert.equal(mutations.length, before + 1)
      await waitText('ARCHIVED')
      await action('Rename')
      await fill('[aria-label="Organization name"]', `Archived ${tab}`)
      await confirm()
      await waitText(`Archived ${tab}`)
    }
    assert.equal(teams[0].teamLeadId, null)
    assert.equal(teams[0].managerId, null)
    assert.deepEqual(teams[0].memberIds, [4])
    await click('Teams')
    await action('Create team')
    await fill('[aria-label="Team coverage"]', 'REGION')
    assert.equal(await evaluate(`document.querySelector('[aria-label="Team region"]').options.length`), 1)
    await click('Cancel')
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
    for (const tab of ['Regions', 'Departments', 'Specialties', 'Teams']) {
      await click(tab)
      await action('Reactivate')
      await waitText('Previously cleared assignments')
      assert(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'))
      await confirm()
      await waitText('ACTIVE')
    }
    await click('Archived Teams')
    await waitText('Team members')
    await waitText('Unassigned')
    assert.equal(teams[0].teamLeadId, null)
    assert.equal(teams[0].managerId, null)
    assert(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'))
    assert.deepEqual(browserErrors, [])
    console.log('PASS: focused organization rename/archive/reactivate, archived rename/labels, Region 409, confirmation/cancel, duplicate submission, active-only Region selector, retained membership, cleared responsibility, mobile and admin ticket isolation')
  } else {
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
  // Account/security browser flows use the same in-memory mail boundary as API fixtures.
  user = accounts.find(a => a.role === 'SUPER_ADMIN')
  await navigate('/admin/accounts')
  await waitText('Pending activation')
  const invited = accounts.find(a => a.role === 'ADMIN' && a.activatedAt === null)
  assert(invited)
  await evaluate(`document.querySelector('[data-account-id="${invited.id}"]').querySelector('button').click()`)
  await waitText('Instructions sent to the account email.')
  const activation = securityMail.filter(m => m.account.id === invited.id && m.type === 'activation').at(-1)
  securitySession = false
  await navigate(`/activate#token=${activation.token}`)
  await waitText('Activate account')
  assert.equal(await evaluate('location.hash'), '')
  assert(!(await evaluate('JSON.stringify(localStorage) + JSON.stringify(sessionStorage)')).includes(activation.token))
  await fill('input[autocomplete="new-password"]', 'UserChosenPassword123!')
  await fill('input[autocomplete="new-password"]:last-of-type', 'UserChosenPassword123!')
  // Each input lives in its own label; select by label order.
  await fill('label:nth-child(2) input', 'UserChosenPassword123!')
  await click('Save password')
  await waitText('Password saved. Sign in to continue.')
  assert.equal(await evaluate('location.pathname'), '/activate')
  await click('Go to login')
  await waitText('Forgot password?')
  await fill('input[name="email"], input[type="email"]', invited.email)
  await fill('input[type="password"]', 'UserChosenPassword123!')
  await evaluate(`document.querySelector('form').requestSubmit()`)
  await waitText('Administration workspace')
  // Super Admin can send the activated Admin a link.
  user = accounts.find(a => a.role === 'SUPER_ADMIN')
  await navigate('/admin/accounts')
  await waitText('Send password reset')
  await evaluate(`document.querySelector('[data-account-id="${invited.id}"]').querySelector('button').click()`)
  await waitText('Instructions sent to the account email.')
  assert(securityMail.some(m => m.account.id === invited.id && m.type === 'reset'))
  securitySession = false
  await navigate('/forgot-password')
  await fill('input[name="email"], input[type="email"]', invited.email)
  await click('Send instructions')
  await waitText('If an eligible account exists')
  const reset = securityMail.filter(m => m.account.id === invited.id && m.type === 'reset').at(-1)
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  securitySession = true
  user = invited
  await navigate(`/reset-password#token=${reset.token}`)
  await waitText('Reset password')
  assert.equal(await evaluate('location.hash'), '')
  assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'))
  await fill('label:nth-child(1) input', 'NewUserPassword456!')
  await fill('label:nth-child(2) input', 'Mismatch')
  await click('Save password')
  await waitText('Use matching passwords')
  await fill('label:nth-child(2) input', 'NewUserPassword456!')
  await click('Save password')
  await waitText('Password saved. Sign in to continue.')
  assert.equal(await evaluate('location.pathname'), '/reset-password')
  await click('Go to login')
  await waitText('Welcome back')
  await fill('input[name="email"], input[type="email"]', invited.email)
  await fill('input[type="password"]', 'UserChosenPassword123!')
  await evaluate(`document.querySelector('form').requestSubmit()`)
  await waitText('Invalid credentials')
  await fill('input[type="password"]', 'NewUserPassword456!')
  await evaluate(`document.querySelector('form').requestSubmit()`)
  await waitText('Administration workspace')
  securitySession = false
  await navigate(`/reset-password#token=${reset.token}`)
  await fill('label:nth-child(1) input', 'AnotherPassword789!')
  await fill('label:nth-child(2) input', 'AnotherPassword789!')
  await click('Save password')
  await waitText('Invalid, expired or used link')
  await navigate('/activate')
  await waitText('Invalid or missing link')
  await navigate('/resend-activation')
  securityRateLimit = true
  await fill('input[name="email"], input[type="email"]', 'unknown@example.test')
  await click('Send instructions')
  await waitText('Too many requests')
  securityRateLimit = false
  await click('Send instructions')
  await waitText('If an eligible account exists')
  console.log('PASS: activation mail, memory-only fragment, no auto-login, user-owned passwords, admin resend/reset links, forgot/reset, old password rejection, replay, rate limits and mobile security pages')
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
