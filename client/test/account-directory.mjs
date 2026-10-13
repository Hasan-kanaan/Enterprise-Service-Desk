import assert from 'node:assert/strict'
import { expectToast } from './loading-feedback.mjs'
import { setTimeout as delay } from 'node:timers/promises'

export async function accountDirectoryChecks({ accounts, root, securityMail, requests, navigate, click, fill, evaluate, waitText, until, delayNextList, failMail, send }) {
  const rowIds = () => evaluate('[...document.querySelectorAll("[data-account-id]")].map(el => Number(el.dataset.accountId))')
  const settled = () => until(() => evaluate('!document.body.textContent.includes("Loading accounts...")'), 'directory settled')
  await navigate('/login')
  await waitText('Welcome back')
  await fill('input[name="email"]', root.email)
  await fill('input[name="password"]', 'ChosenPassword123!')
  await click('Sign in')
  await waitText("Manage your service desk's people and configuration.")
  await evaluate(`document.querySelector('a[href="/admin/accounts"]').click()`)
  await waitText(root.email)
  assert.deepEqual(await rowIds(), [root.id], 'sole root visible on initial navigation after login')
  const first = await rowIds()
  await click('Refresh accounts')
  await settled()
  assert.deepEqual(await rowIds(), first)

  const create = async (displayName, email) => {
    await click('Create account')
    await fill('[aria-label="Account display name"]', 'Directory Person')
    await fill('[aria-label="Account job title"]', 'Employee')
    await fill('[aria-label="Account display name"]', displayName)
    await fill('[aria-label="Account email"]', email)
    await fill('[aria-label="Account role"]', 'EMPLOYEE')
    await click('Confirm')
  }
  for (const [displayName, email] of [['freshperson', root.email]]) {
    const count = securityMail.length
    await create(displayName, email)
    await waitText('User with this email already exists')
    assert.equal(accounts.length, 1)
    assert.equal(securityMail.length, count)
    assert.deepEqual(await rowIds(), first)
    await expectToast(evaluate, until, 'error', 'User with this email already exists')
    assert.equal(await evaluate(`[...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Refresh accounts').length`), 1)
    assert.equal(await evaluate(`document.querySelectorAll('dialog .error-state button').length`), 0)
    assert.equal(await evaluate(`document.querySelector('dialog fieldset').disabled`), false)
    await click('Cancel')
    await settled()
    assert.deepEqual(await rowIds(), first, 'failed create retains exactly the persisted root')
  }
  await fill('[aria-label="Account role filter"]', 'SUPER_ADMIN')
  await fill('[aria-label="Account status filter"]', 'ACTIVE')
  await fill('[aria-label="Search accounts"]', root.email)
  await delay(400)
  await settled()
  assert.deepEqual(await rowIds(), first)
  await fill('[aria-label="Account role filter"]', 'EMPLOYEE')
  await waitText('No matching accounts')
  await fill('[aria-label="Account role filter"]', '')
  await waitText(root.email)
  const listCount = requests.filter(r => r === 'GET /users').length
  delayNextList()
  await fill('[aria-label="Search accounts"]', 'missing identity')
  await until(() => requests.filter(r => r === 'GET /users').length > listCount, 'old search request started')
  await fill('[aria-label="Search accounts"]', '')
  await delay(1300)
  await settled()
  assert.deepEqual(await rowIds(), first, 'late empty response cannot replace newer root data')
  await fill('[aria-label="Account status filter"]', '')
  await settled()
  failMail()
  await create('mailfailure', 'mailfailure@example.test')
  await waitText('Account created, but activation email delivery failed.')
  await until(() => evaluate('!document.querySelector("dialog")'), 'successful creation closes form')
  await waitText('mailfailure@example.test')
  assert.equal(accounts.length, 2)
  assert.equal((await rowIds()).length, 2)
  assert.equal(accounts.find(a => a.email === 'mailfailure@example.test').activatedAt, null)
  assert.deepEqual(new Set(await rowIds()), new Set(accounts.map(a => a.id)))
  await click('Refresh accounts')
  await settled()
  assert.deepEqual(new Set(await rowIds()), new Set(accounts.map(a => a.id)))
  await create('Correctable draft', root.email)
  await waitText('User with this email already exists')
  await fill('[aria-label="Account email"]', 'corrected@example.test')
  failMail(false)
  await click('Confirm')
  await until(() => evaluate(`document.querySelector('[data-sonner-toast][data-type="success"]')?.textContent.includes('Account created')`), 'corrected create success toast')
  assert.equal(await evaluate(`[...document.querySelectorAll('[data-sonner-toast][data-type="success"]')].filter(el => el.textContent.includes('Account created')).length`), 1)
  await until(() => evaluate('!document.querySelector("dialog")'), 'corrected draft saves')
  await waitText('corrected@example.test')

  // Exercise both independent state dimensions, including long identities.
  const pending = accounts.find(a => a.email === 'corrected@example.test')
  const verifiedInactive = { ...pending, id: 8001, email: 'verified.inactive@example.test', status: 'INACTIVE', activatedAt: root.activatedAt }
  const pendingInactive = { ...pending, id: 8002, email: 'verylong'.repeat(15) + '@example.test', displayName: 'Long identity '.repeat(12), status: 'INACTIVE' }
  accounts.push(verifiedInactive, pendingInactive)
  await click('Refresh accounts'); await waitText(verifiedInactive.email)
  for (const [id, wording] of [[root.id, 'Active · Verified'], [pending.id, 'Active · Pending verification'], [8001, 'Inactive · Verified'], [8002, 'Inactive · Pending verification']]) {
    assert.equal(await evaluate(`document.querySelector('[data-account-id="${id}"] .directory-state span').textContent`), wording)
  }
  assert.equal(await evaluate(`document.body.textContent.includes('Active · Activated')`), false)
  for (const width of [1440, 768, 320]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width === 320 })
    const layout = await evaluate(`(() => {
      const root = document.querySelector('[data-account-id="${root.id}"]');
      const other = document.querySelector('[data-account-id="${pending.id}"]');
      const slot = row => row.querySelector('.directory-actions');
      const rect = el => ({ x: el.getBoundingClientRect().x, width: el.getBoundingClientRect().width });
      return { root: rect(slot(root)), other: rect(slot(other)),
        rootState: rect(root.querySelector('.directory-state')), otherState: rect(other.querySelector('.directory-state')),
        rootControls: slot(root).querySelectorAll('button,a,[tabindex]').length,
        otherLabel: slot(other).querySelector('button').getAttribute('aria-label'),
        overflow: document.documentElement.scrollWidth > innerWidth };
    })()`)
    assert.deepEqual(layout.root, layout.other, `action track at ${width}px`)
    assert.deepEqual(layout.rootState, layout.otherState, `state track at ${width}px`)
    assert.equal(layout.rootControls, 0)
    assert.equal(layout.otherLabel, 'Actions for Correctable draft')
    assert.equal(layout.overflow, false)
  }
  console.log('PASS: correctable create conflict without duplicate recovery, separate verification/status wording, aligned noninteractive self-row and long identities at desktop/tablet/mobile')
  console.log('PASS: sole bootstrap root after login, identical reload, duplicate email unchanged, filters, out-of-order responses and truthful mail failure')
}
