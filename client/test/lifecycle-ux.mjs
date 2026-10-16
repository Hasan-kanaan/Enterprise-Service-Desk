import assert from 'node:assert/strict'

export async function lifecycleUxChecks({ accounts, catalogs, specialtyLinks, navigate, click, fill, evaluate, waitText, until, send, requests }) {
  const agent = accounts.find(a => a.id === 4)
  const rowAction = async (id, label) => {
    await evaluate(`(() => { const row = document.querySelector('[data-account-id="${id}"]'); row.querySelector('button[popovertarget]').click(); [...row.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(label)}).click() })()`)
  }
  const dialogText = () => evaluate('document.querySelector("dialog").innerText')
  const openSpecialties = async () => {
    await navigate('/admin/accounts')
    await waitText(agent.displayName)
    await rowAction(agent.id, 'Manage specialties')
    await waitText('Specialties do not grant ticket authority or change team membership.')
  }
  const addDisabled = () => evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.trim() === "Add specialty").disabled')
  for (const scheme of ['light', 'dark']) {
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] })
    await send('Emulation.setDeviceMetricsOverride', { width: scheme === 'dark' ? 320 : 1440, height: 900, deviceScaleFactor: 1, mobile: scheme === 'dark' })
    await navigate('/admin/accounts')
    await waitText(agent.displayName)
    await until(() => evaluate(`document.documentElement.dataset.theme === '${scheme}'`), 'theme')
    for (const [id, heading, fragment] of [[4, 'Leaving the Agent role', 'Team Lead and Team memberships will be removed'], [6, 'Leaving the Manager role', 'operational tickets return to intake'], [3, null, 'All sessions and unused activation/reset links will be revoked']]) {
      await rowAction(id, 'Change role')
      await fill('[aria-label="New role"]', id === 3 ? 'AGENT' : 'EMPLOYEE')
      const text = await dialogText()
      assert(text.includes(fragment))
      assert.equal(await evaluate('document.querySelectorAll("dialog .account-lifecycle-warning").length'), heading ? 1 : 0)
      if (heading) assert(text.includes(heading))
      assert(text.includes('invalidate its current activation link'))
      assert(text.includes('send new activation instructions to the user using Resend activation'))
      assert(!/backend may|automatically sends/i.test(text))
      assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'))
      await click('Cancel')
    }
    for (const [id, fragment] of [[4, 'Team memberships, specialties and completed or cancelled subtask assignments remain'], [6, 'Current managed operational tickets will return to intake'], [3, 'Active sessions, refresh tokens and unused activation/reset links will be revoked']]) {
      assert(await evaluate(`document.querySelector('[data-account-id="${id}"] .account-deactivate') !== null`))
      assert(await evaluate(`(() => {
        const button = document.querySelector('[data-account-id="${id}"] .account-deactivate');
        const routine = [...button.parentElement.querySelectorAll('button')].find(b => b.textContent.trim() === 'Edit account');
        return getComputedStyle(button).color !== getComputedStyle(routine).color && getComputedStyle(button).fontWeight === '600';
      })()`), 'deactivation has distinct visual treatment')
      await rowAction(id, 'Deactivate')
      const text = (await dialogText()).replace(/\s+/g, ' ')
      assert(text.includes(fragment))
      assert.equal(await evaluate('document.querySelectorAll("dialog .account-lifecycle-warning").length'), 1)
      assert(!/backend may/i.test(text))
      assert(await evaluate('document.querySelector("dialog").scrollWidth <= document.querySelector("dialog").clientWidth'))
      await click('Cancel')
    }
    assert.equal(await evaluate('document.querySelectorAll(\'[data-account-id="1"] .directory-actions button, [data-account-id="2"] .directory-actions button\').length'), 0, 'Admin cannot manage Admin/root')
  }
  await openSpecialties()
  assert(await addDisabled())
  await waitText("Activate this Agent's account before adding specialties.")
  agent.status = 'INACTIVE'
  await openSpecialties()
  assert(await addDisabled())
  await waitText('Reactivate this Agent before adding specialties.')
  await waitText('The account must also complete activation.')
  agent.activatedAt = new Date().toISOString()
  await openSpecialties()
  assert(await addDisabled())
  assert(!(await evaluate('document.body.innerText')).includes('must also complete activation'))
  agent.status = 'ACTIVE'
  catalogs.specialties.push({ id: 901, name: 'Archived fixture specialty', archivedAt: new Date().toISOString() })
  await openSpecialties()
  assert.equal(await addDisabled(), false)
  assert(!(await evaluate('document.body.innerText')).includes('before adding specialties'))
  await click('Add specialty')
  assert.deepEqual(await evaluate('[...document.querySelector("select[aria-label=Specialty]").options].map(o => o.value)'), ['', '1'])
  await fill('[aria-label="Specialty"]', '1')
  await click('Confirm')
  await waitText('Specialty added')
  await waitText('No active unlinked specialties are available.')
  assert(await addDisabled())
  assert.deepEqual(specialtyLinks.get('agents/4'), [1])
  agent.role = 'EMPLOYEE'
  await openSpecialties()
  await waitText('Networking')
  await waitText('Retained link')
  await waitText('New specialties can only be added to active verified Agents.')
  await waitText('They do not represent active Agent responsibilities.')
  assert(await addDisabled())
  await click('Remove specialty')
  await click('Confirm')
  await waitText('No specialties linked.')
  assert.deepEqual(specialtyLinks.get('agents/4'), [])
  assert(requests.includes('DELETE /organization/agents/4/specialties/1'))
  assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'))
  await send('Emulation.setEmulatedMedia', { features: [] })
  console.log('PASS: pending role guidance, contextual role/deactivation consequences, authority boundaries, specialty eligibility/add/remove/retention/empty choices, light/dark/mobile')
}
