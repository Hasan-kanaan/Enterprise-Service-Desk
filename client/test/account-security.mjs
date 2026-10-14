import assert from 'node:assert/strict'

export async function accountSecurityChecks({ accounts, requests, sendSecurityMail, navigate, click, fill, evaluate, waitText, until, send, failNext, delayNext, failNetwork, hasSession }) {
  const text = () => evaluate('document.querySelector(".public-auth-card").innerText')
  const noRecovery = async () => assert(!(await text()).includes('Request a new link'))
  const posts = action => requests.filter(r => r === `POST /auth/${action}`).length
  const passwords = async (value, confirm = value) => {
    await fill('#new-password', value)
    await fill('#confirm-password', confirm)
  }
  const mobile = async () => {
    assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'no horizontal overflow')
    assert(await evaluate('[...document.querySelectorAll(".public-auth-card input, .public-auth-card button, .public-auth-card a")].every(e => e.getBoundingClientRect().height >= 44)'), 'touch targets')
  }
  const account = accounts.find(a => a.role === 'ADMIN')
  const activation = sendSecurityMail(account, 'activation')
  await navigate(`/activate#token=${activation}`)
  await waitText('Password requirements')
  await noRecovery()
  assert.equal(await evaluate('location.hash'), '')
  assert((await text()).includes('At least 8 characters'))
  assert((await text()).includes('At most 72 UTF-8 bytes'))
  assert.equal(await evaluate('document.querySelectorAll("input[autocomplete=new-password]").length'), 2)
  const count = posts('activate')
  for (const [value, confirmation, feedback] of [
    ['short', 'short', 'Use at least 8 characters.'],
    ['é'.repeat(37), 'é'.repeat(37), 'Use at most 72 UTF-8 bytes.'],
    ['ChosenPassword123!', 'Mismatch', 'Both password fields must match.'],
  ]) {
    await passwords(value, confirmation)
    assert((await evaluate('document.querySelector(".public-auth-feedback").innerText')).includes(feedback), 'live inline feedback')
    await click('Save password')
    assert.equal(posts('activate'), count, 'invalid form never submits')
    assert(await evaluate('!!document.querySelector("[data-sonner-toast][data-type=warning]")'))
    assert(await evaluate('document.activeElement.getAttribute("aria-invalid") === "true"'))
  }
  await passwords('ChosenPassword123!')
  assert(await evaluate('document.querySelectorAll("[data-met=true]").length === 3'))
  delayNext()
  await click('Save password')
  assert(await evaluate('document.querySelector("fieldset").disabled'))
  await evaluate('document.querySelector("form").requestSubmit()')
  await waitText('Your account is verified')
  assert.equal(posts('activate'), count + 1, 'duplicate submit prevented')
  assert.equal(hasSession(), false)
  await noRecovery()
  assert((await text()).includes('You may close this tab'))
  assert.equal(await evaluate('document.activeElement.tagName'), 'H1')
  assert.equal(await evaluate('!!document.querySelector("form")'), false)
  const storage = await evaluate('JSON.stringify(localStorage) + JSON.stringify(sessionStorage)')
  for (const secret of [activation, 'ChosenPassword123!']) assert(!storage.includes(secret))
  await click('Sign in')
  await waitText('Welcome back')

  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 740, deviceScaleFactor: 1, mobile: true })
  const reset = sendSecurityMail(account, 'reset')
  await navigate(`/reset-password#token=${reset}`)
  await waitText('Password requirements')
  await noRecovery()
  await mobile()
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] })
  // Batch 5A applies live system changes through the MediaQueryList event.
  await until(() => evaluate("document.documentElement.dataset.theme === 'dark' && getComputedStyle(document.documentElement).colorScheme === 'dark'"), 'dark account-security theme')
  assert.equal(await evaluate('getComputedStyle(document.documentElement).colorScheme'), 'dark')
  await mobile()
  await passwords('é'.repeat(36)) // Exactly 72 UTF-8 bytes is accepted.
  failNetwork()
  await click('Save password')
  await waitText('Unable to connect. Please try again.')
  await noRecovery()
  failNext([429, { message: 'Too many requests' }])
  await click('Save password')
  await waitText('Too many requests. Please wait and try again.')
  await noRecovery()
  failNext([409, { message: 'Please retry this request.' }])
  await click('Save password')
  await waitText('Please retry this request.')
  await noRecovery()
  assert(await evaluate('!!document.querySelector("[data-sonner-toast][data-type=error]")'))
  await click('Save password')
  await waitText('Your password has been changed')
  assert((await text()).includes('Sign in with your new password'))
  assert.equal(hasSession(), false)
  await noRecovery()
  await mobile()
  await click('Sign in')
  await waitText('Welcome back')

  for (const action of ['activate', 'reset-password']) {
    await navigate(`/${action}`)
    await waitText('No link was supplied')
    assert.equal(await evaluate('document.querySelector("a.public-auth-primary").getAttribute("href")'), action === 'activate' ? '/resend-activation' : '/forgot-password')
    await click('Request a new link')
    await until(() => evaluate('!!document.querySelector("#email")'), 'recovery form')
    await click('Return to sign in')
    await waitText('Welcome back')
    // A token's appearance alone does not establish validity. Submit to the server.
    await navigate(`/${action}#token=${action === 'activate' ? 'invalid-link' : reset}`)
    await waitText('Password requirements')
    await noRecovery()
    await passwords('AnotherPassword123!')
    await click('Save password')
    await waitText('This link is invalid, expired or already used.')
    assert((await text()).includes('Request a new link'))
    assert.equal(await evaluate('!!document.querySelector("form")'), false)
    await mobile()
  }

  for (const action of ['forgot-password', 'resend-activation']) {
    const submit = action === 'forgot-password' ? 'Send reset instructions' : 'Send activation instructions'
    let completion
    for (const email of [account.email, 'unknown@example.test']) {
      await navigate(`/${action}`)
      await fill('#email', email)
      await mobile()
      await click(submit)
      await waitText('If this email is associated with an eligible Kino Service Desk account')
      const result = await text()
      assert(!/does not exist|no account was found|inactive|not been activated|delivery failed/i.test(result))
      if (completion) assert.equal(result, completion, 'existing and unknown emails get identical copy')
      completion = result
      await click('Return to sign in')
      await waitText('Welcome back')
    }
    for (const detail of ['This email does not exist', 'This account is inactive', 'This account has not been activated', 'Email delivery failed']) {
      await navigate(`/${action}`)
      await fill('#email', 'unknown@example.test')
      failNext([503, { message: detail }])
      await click(submit)
      await waitText('Unable to send the request. Please try again.')
      assert(!(await evaluate('document.body.innerText')).includes(detail), 'error details are masked, including toasts')
    }
    failNext([429, { message: 'Too many requests' }])
    await click(submit)
    await waitText('Too many requests. Please wait and try again.')
    await click(submit)
    await waitText('Check your inbox')
  }
  await send('Emulation.setEmulatedMedia', { features: [] })
  console.log('PASS: guidance, Unicode limits, mismatch, duplicate submit, completion, generic recovery, server-confirmed unusable links, navigation, 320px mobile and dark theme')
}
