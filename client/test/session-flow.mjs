// Real same-profile Chromium pages and isolated cookie-rotating HTTP fixtures.
// Vite dev exposes source imports to the test only; no production test hooks.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
const root = resolve(import.meta.dirname, '..')
const executable =
  process.env.BROWSER_PATH ||
  [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find(existsSync)
assert(executable)
const profile = mkdtempSync(join(tmpdir(), 'eds-multitab-'))
const vite = spawn(
  process.execPath,
  [
    join(root, 'node_modules/vite/bin/vite.js'),
    '--host',
    '127.0.0.1',
    '--port',
    '3001',
    '--strictPort',
  ],
  {
    cwd: root,
    env: { ...process.env, VITE_API_URL: 'http://127.0.0.1:8000' },
    windowsHide: true,
    stdio: 'ignore',
  },
)
const browser = spawn(
  executable,
  [
    '--headless=new',
    '--no-first-run',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { windowsHide: true, stdio: 'ignore' },
)
const clients = []
const errors = []
const user = {
  id: 10,
  username: 'Maya',
  email: 'maya@example.test',
  role: 'EMPLOYEE',
}
let refreshCookie = null
let blockRefresh = false,
  heldRequest = null,
  closing = false
let port,
  count = 0,
  active = 0,
  peak = 0,
  logouts = 0,
  token = 0,
  rejection = false,
  offline = false
async function until(check, label) {
  for (let i = 0; i < 150; i++) {
    if (await check()) return
    await delay(100)
  }
  throw Error(`Timed out: ${label}`)
}
async function browserCommand(method, params = {}) {
  const version = await (
    await fetch(`http://127.0.0.1:${port}/json/version`)
  ).json()
  const ws = new WebSocket(version.webSocketDebuggerUrl)
  await new Promise((resolve) =>
    ws.addEventListener('open', resolve, { once: true }),
  )
  try {
    return await new Promise((resolve, reject) => {
      ws.addEventListener('message', (event) => {
        const data = JSON.parse(event.data)
        if (data.id === 1)
          data.error
            ? reject(Error(JSON.stringify(data.error)))
            : resolve(data.result)
      })
      ws.send(JSON.stringify({ id: 1, method, params }))
    })
  } finally {
    ws.close()
  }
}
async function page(source = '', contextId = null) {
  let target
  if (contextId) {
    const created = await browserCommand('Target.createTarget', {
      url: 'about:blank',
      browserContextId: contextId,
    })
    const targets = await (
      await fetch(`http://127.0.0.1:${port}/json/list`)
    ).json()
    target = targets.find((item) => item.id === created.targetId)
  } else
    target = await (
      await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
        method: 'PUT',
      })
    ).json()
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve) =>
    ws.addEventListener('open', resolve, { once: true }),
  )
  let serial = 0
  const pending = new Map()
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++serial
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(Error(method))
      }, 25000)
      pending.set(id, { resolve, reject, timer })
      ws.send(JSON.stringify({ id, method, params }))
    })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (result.exceptionDetails)
      throw Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  ws.addEventListener('message', async (event) => {
    const data = JSON.parse(event.data)
    if (data.id) {
      const item = pending.get(data.id)
      if (!item) return
      clearTimeout(item.timer)
      pending.delete(data.id)
      if (data.error) item.reject(Error(JSON.stringify(data.error)))
      else item.resolve(data.result)
      return
    }
    if (data.method === 'Runtime.exceptionThrown')
      errors.push(data.params.exceptionDetails)
    if (data.method !== 'Fetch.requestPaused') return
    const { requestId, request } = data.params
    let status = 200,
      body = {},
      cookie
    const path = new URL(request.url).pathname
    try {
      if (request.method !== 'OPTIONS') {
        if (
          contextId &&
          ['/auth/refresh', '/auth/login', '/probe'].includes(path)
        ) {
          body =
            path === '/probe'
              ? {}
              : { accessToken: 'independent-device-access', user }
          cookie = 'refresh=independent-opaque; HttpOnly; Path=/; SameSite=Lax'
        } else if (path === '/auth/refresh') {
          count++
          active++
          peak = Math.max(peak, active)
          if (refreshCookie)
            assert.equal(
              request.headers.Cookie ?? request.headers.cookie,
              refreshCookie,
              'request must consume the latest rotated HttpOnly cookie',
            )
          await delay(150)
          if (blockRefresh) {
            heldRequest = requestId
            active--
            return
          }
          active--
          if (offline) {
            await send('Fetch.failRequest', {
              requestId,
              errorReason: 'InternetDisconnected',
            })
            return
          }
          if (rejection) status = 401
          else {
            token++
            body = { accessToken: `access-${token}`, user }
            refreshCookie = `refresh=opaque-${token}`
            cookie = `${refreshCookie}; HttpOnly; Path=/; SameSite=Lax`
          }
        } else if (path === '/auth/login') {
          rejection = false
          token++
          body = { accessToken: `access-${token}`, user }
          refreshCookie = `refresh=opaque-${token}`
          cookie = `${refreshCookie}; HttpOnly; Path=/; SameSite=Lax`
        } else if (path === '/auth/logout') {
          logouts++
          rejection = true
        } else if (path === '/probe') {
          status =
            request.headers.Authorization === `Bearer access-${token}` &&
            !rejection
              ? 200
              : 401
        } else if (path === '/profile') body = user
        else if (path === '/notifications/unread-count')
          body = { unreadCount: 0 }
        else
          body = { data: [], items: [], hasMore: false, page: 1, pageSize: 25 }
      }
      await send('Fetch.fulfillRequest', {
        requestId,
        responseCode: status,
        responseHeaders: [
          { name: 'Content-Type', value: 'application/json' },
          {
            name: 'Access-Control-Allow-Origin',
            value: 'http://127.0.0.1:3001',
          },
          { name: 'Access-Control-Allow-Credentials', value: 'true' },
          {
            name: 'Access-Control-Allow-Headers',
            value: 'content-type,authorization',
          },
          { name: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' },
          ...(cookie ? [{ name: 'Set-Cookie', value: cookie }] : []),
        ],
        body: Buffer.from(JSON.stringify(body)).toString('base64'),
      })
    } catch (error) {
      if (!closing && ws.readyState === WebSocket.OPEN)
        errors.push(String(error))
    }
  })
  await send('Page.enable')
  await send('Runtime.enable')
  if (source) await send('Page.addScriptToEvaluateOnNewDocument', { source })
  await send('Fetch.enable', {
    patterns: [{ urlPattern: 'http://127.0.0.1:8000/*' }],
  })
  const client = { send, evaluate, ws, target }
  clients.push(client)
  await send('Page.navigate', { url: 'http://127.0.0.1:3001/profile' })
  await until(
    () => evaluate("!!document.querySelector('#root')").catch(() => false),
    'document',
  )
  await evaluate(
    "Promise.all([import('/src/services/api.ts'), import('/src/store/store.ts'), import('/src/services/auth.service.ts')]).then(([api, store, auth]) => { window.api = api; window.store = store.store; window.auth = auth })",
  )
  return client
}
const state = (p) => p.evaluate('store.getState().auth')
const refresh = (p) =>
  p.evaluate('api.refreshSession().then(x => !!x).catch(() => "network")')
const probe = (p) =>
  p.evaluate('api.default.get("/probe").then(() => true).catch(() => false)')
try {
  await until(async () => {
    try {
      return (await fetch('http://127.0.0.1:3001')).ok
    } catch {
      return false
    }
  }, 'vite')
  await until(() => existsSync(join(profile, 'DevToolsActivePort')), 'browser')
  port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split(
    '\n',
  )[0]
  const [a, b] = await Promise.all([page(), page()])
  await until(
    async () => (await state(a)).user && (await state(b)).user,
    'two authenticated pages',
  )
  assert.equal(peak, 1)
  let before = count
  assert.deepEqual(await Promise.all([refresh(a), refresh(b)]), [true, true])
  assert.equal(count, before + 1)
  assert.equal((await state(a)).accessToken, (await state(b)).accessToken)
  assert.deepEqual(await Promise.all([probe(a), probe(b)]), [true, true])
  console.log(
    'PASS: two real tabs share one simultaneous refresh; both continue API requests',
  )
  token++ // All existing access tokens now rejected by the API fixture.
  before = count
  assert.deepEqual(await Promise.all([probe(a), probe(b)]), [true, true])
  assert.equal(count, before + 1)
  console.log(
    'PASS: simultaneous 401 responses recover once without a refresh storm',
  )
  const { browserContextId } = await browserCommand(
    'Target.createBrowserContext',
  )
  const independent = await page('', browserContextId)
  await until(
    async () => (await state(independent)).user,
    'independent profile session',
  )
  const stale = await a.evaluate(
    '({ id: JSON.parse(localStorage.getItem("service-desk:auth:v1")).id, session: store.getState().auth })',
  )
  await a.evaluate('void api.refreshSession(); true')
  await until(() => active === 1, 'refresh before logout')
  await Promise.all([a.evaluate('auth.logout()'), b.evaluate('auth.logout()')])
  await until(async () => !(await state(b)).user, 'logout propagation')
  assert.equal(logouts, 1)
  assert((await state(independent)).user)
  assert.equal(await probe(independent), true)
  console.log(
    'PASS: logout leaves unrelated browser context/session authenticated',
  )
  before = count
  assert.equal(await probe(b), false)
  assert.equal(count, before)
  await a.evaluate(
    `{ const c = new BroadcastChannel('service-desk:auth:v1'); c.postMessage({type:'session', ...${JSON.stringify(stale)}}); c.close() }`,
  )
  await delay(150)
  assert.equal((await state(b)).user, null)
  assert.match(await b.evaluate('document.body.innerText'), /Welcome back/)
  console.log(
    'PASS: concurrent logout waits for refresh, revokes once, clears sibling UI/credentials and rejects stale broadcasts',
  )
  await a.evaluate('auth.login({email:"maya@example.test",password:"fixture"})')
  await until(async () => (await state(b)).user, 'login propagation')
  assert.equal(await probe(b), true)
  rejection = true
  await refresh(a)
  await until(async () => !(await state(b)).user, 'deactivation propagation')
  console.log(
    'PASS: login propagates; backend session rejection/deactivation clears both tabs',
  )
  await a.evaluate('auth.login({email:"maya@example.test",password:"fixture"})')
  await until(async () => (await state(b)).user, 'login')
  offline = true
  before = count
  assert.deepEqual(await Promise.all([refresh(a), refresh(b)]), [
    'network',
    'network',
  ])
  assert.equal(count, before + 1)
  assert((await state(a)).user && (await state(b)).user)
  offline = false
  await delay(2100)
  assert.equal(await refresh(b), true)
  assert.equal(await probe(a), true)
  console.log(
    'PASS: network failure retains auth, bounds attempts and recovers on later retry',
  )
  const c = await page('window.BroadcastChannel = undefined')
  await until(async () => (await state(c)).user, 'channel fallback')
  await Promise.all([refresh(a), refresh(c)])
  assert.equal(peak, 1)
  await a.evaluate('auth.logout()')
  await until(async () => !(await state(c)).user, 'storage logout fallback')
  console.log(
    'PASS: no BroadcastChannel uses serialized refresh and storage logout events',
  )
  const blockedStorage = await page(
    'Storage.prototype.setItem = () => { throw new DOMException("blocked", "SecurityError") }',
  )
  before = count
  assert.equal(await refresh(blockedStorage), 'network')
  assert.equal(count, before)
  await until(
    async () =>
      /Enable site storage/.test(
        await blockedStorage.evaluate('document.body.innerText'),
      ),
    'blocked storage UI',
  )
  console.log(
    'PASS: blocked metadata storage does not risk an uncoordinated refresh',
  )
  const d = await page(
    'Object.defineProperty(navigator, "locks", {value: undefined})',
  )
  before = count
  assert.equal(await refresh(d), 'network')
  assert.equal(count, before)
  await until(
    async () =>
      /Unable to connect/.test(await d.evaluate('document.body.innerText')),
    'fallback error UI',
  )
  console.log(
    'PASS: no Web Locks fails safely with connection retry UI and no cookie race',
  )
  // Closing a lock owner must not leave a permanent browser lock or trigger a
  // second cookie consumption while the abandoned HTTP outcome is unknown.
  await a.evaluate('auth.login({email:"maya@example.test",password:"fixture"})')
  await until(async () => (await state(b)).user, 'login before owner closure')
  blockRefresh = true
  await a.evaluate('void api.refreshSession().catch(() => {}); true')
  await until(() => heldRequest, 'refresh in flight')
  closing = true
  await b.send('Target.closeTarget', { targetId: a.target.id })
  before = count
  assert.equal(await refresh(b), 'network')
  assert.equal(count, before)
  blockRefresh = false
  await b.evaluate('auth.login({email:"maya@example.test",password:"fixture"})')
  assert.equal(await probe(b), true)
  console.log(
    'PASS: closing refresh owner releases lock; uncertain rotation requires fresh login without replay',
  )
  const stored = await b.evaluate(
    'JSON.stringify({...localStorage}) + JSON.stringify({...sessionStorage}) + document.cookie',
  )
  assert(!stored.includes('access-') && !stored.includes('opaque-'))
  assert.deepEqual(errors, [])
  console.log(
    'PASS: tokens absent from persistent JS storage; no browser runtime errors',
  )
} finally {
  for (const client of clients) client.ws.close()
  browser.kill()
  vite.kill()
  await delay(500)
  if (
    resolve(profile).startsWith(resolve(tmpdir()) + sep) &&
    profile.includes('eds-multitab-')
  )
    rmSync(profile, {
      recursive: true,
      force: true,
      maxRetries: 30,
      retryDelay: 200,
    })
}
