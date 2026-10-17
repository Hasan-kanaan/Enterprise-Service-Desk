import assert from 'node:assert/strict'
export async function requestFollowup(c) {
  const { send, evaluate, navigate, waitText, click, fill, checkLabel, selectAttachment, tickets, options, browserErrors, original, setCycles } = c
  const checked = label => evaluate(`[...document.querySelectorAll('label')].find(el => el.textContent.trim() === ${JSON.stringify(label)}).querySelector('input').checked`)
  const value = id => evaluate(`document.querySelector('#ticket-${id}').value`)
  options.requesterDefaults = { regionId: 2, departmentId: 3 }
  options.regions.push({ id: 12, name: 'Other region' })
  options.departments.push({ id: 13, name: 'Other department' })
  await navigate('/tickets/new'); await waitText('Choose files')
  assert(await checked('Beirut')); assert(await checked('Operations'))
  assert.equal(await value('priority'), 'MEDIUM')
  assert.deepEqual(await evaluate(`[...document.querySelector('#ticket-priority').options].map(o => o.value)`), ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  await waitText('Most requests should remain Medium.')
  await evaluate(`document.querySelector('.optional-fields').open = true`)
  await waitText('Tags are optional labels that help describe and organize the request.')
  await waitText('They do not determine who can access or work the ticket.')
  await waitText('No files selected')
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('input[type=file]')).opacity`), '0')
  await send('Page.bringToFront')
  await send('Page.setInterceptFileChooserDialog', { enabled: true })
  await evaluate(`document.querySelector('input[type=file]').focus()`)
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.file-picker-control')).outlineStyle`), 'solid')
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 })
  await new Promise(resolve => setTimeout(resolve, 200))
  assert.equal(c.fileDialogs(), 1, 'Space opens the native multiple-file chooser')
  await send('Page.setInterceptFileChooserDialog', { enabled: false })
  await selectAttachment('input[type=file]', 'draft.txt'); await waitText('1 file selected')
  await evaluate(`document.querySelector('[aria-label="Remove draft.txt"]').click()`); await waitText('No files selected')
  await selectAttachment('input[type=file]', 'draft.txt'); await waitText('1 file selected')
  await evaluate(`(() => { const el=document.querySelector('input[type=file]'); const t=new DataTransfer(); for(const name of ['two.txt','three.txt']) t.items.add(new File(['ok'],name,{type:'text/plain'})); el.files=t.files; el.dispatchEvent(new Event('change',{bubbles:true})); })()`)
  await waitText('3 files selected')
  await evaluate(`(() => { const el=document.querySelector('input[type=file]'); const t=new DataTransfer(); for(let i=0;i<3;i++) t.items.add(new File(['ok'],i+'.txt',{type:'text/plain'})); el.files=t.files; el.dispatchEvent(new Event('change',{bubbles:true})); })()`)
  await waitText('Choose at most 5 files.')
  await evaluate(`document.querySelector('[aria-label="Remove two.txt"]').click()`); await evaluate(`document.querySelector('[aria-label="Remove three.txt"]').click()`)
  await evaluate(`(() => { const el=document.querySelector('input[type=file]'); const t=new DataTransfer(); t.items.add(new File([new Uint8Array(10485761)],'big.txt',{type:'text/plain'})); el.files=t.files; el.dispatchEvent(new Event('change',{bubbles:true})); })()`)
  await waitText('Each file must be at most 10 MiB, or 25 MiB for video.')
  await selectAttachment('input[type=file]', 'bad.exe'); await waitText('Unsupported file type.')
  await evaluate(`(() => { const el=document.querySelector('input[type=file]'); const t=new DataTransfer(); t.items.add(new File([new Uint8Array(25*1024*1024+1)],'large.mp4',{type:'video/mp4'})); el.files=t.files; el.dispatchEvent(new Event('change',{bubbles:true})); })()`)
  await waitText('Each file must be at most 10 MiB, or 25 MiB for video.')
  await evaluate(`(() => { const el=document.querySelector('input[type=file]'); const t=new DataTransfer(); for (const name of ['first.mp4','second.webm']) t.items.add(new File([new Uint8Array(25*1024*1024)],name,{type:name.endsWith('mp4')?'video/mp4':'video/webm'})); el.files=t.files; el.dispatchEvent(new Event('change',{bubbles:true})); })()`)
  await waitText('Attachments must total at most 50 MiB.')
  assert(await evaluate(`document.querySelector('input[type=file]').accept.includes('.mp4') && document.querySelector('input[type=file]').accept.includes('.webm')`))

  await fill('#ticket-title', 'Draft request'); await fill('#ticket-description', 'Private draft description')
  await fill('#ticket-category', '4'); await fill('#ticket-priority', 'HIGH'); await checkLabel('VPN')
  await checkLabel('Beirut'); assert(!await checked('Beirut'))
  await checkLabel('Other region'); await checkLabel('Beirut')
  await checkLabel('Other department'); await checkLabel('All departments')
  await click('Cancel'); await waitText('My Requests'); await click('New request'); await waitText('Choose files')
  assert.equal(await value('title'), 'Draft request'); assert.equal(await value('description'), 'Private draft description')
  assert.equal(await value('category'), '4'); assert.equal(await value('priority'), 'HIGH')
  assert(await checked('VPN')); assert(await checked('Beirut')); assert(await checked('Other region')); assert(await checked('All departments'))
  await checkLabel('All departments'); assert(await checked('Operations')); assert(await checked('Other department'))
  await checkLabel('All regions'); await click('Cancel'); await click('New request'); await waitText('Choose files'); assert(await checked('All regions'))
  await checkLabel('All regions'); await checkLabel('Other region'); await checkLabel('Other department')
  await waitText('No files selected'); assert(!await evaluate(`document.querySelector('[aria-label="Remove draft.txt"]') !== null`))
  for (const theme of ['light','dark']) {
    await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`)
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
    assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'))
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1050, deviceScaleFactor: 1, mobile: false })
  await click('Submit ticket'); await waitText('Submission response interrupted')
  await click('Cancel'); await click('New request'); await waitText('A submission was previously attempted.')
  await click('Submit ticket'); await waitText('Request #142'); assert.equal(tickets.length, 1)
  await click('My Requests'); await click('New request'); await waitText('Choose files')
  assert.equal(await value('title'), ''); assert.equal(await value('priority'), 'MEDIUM')
  assert(await checked('Beirut')); assert(await checked('Operations'))
  // Full reload is deliberately allowed to discard memory-only drafts.
  for (const defaults of [{ regionId: null, departmentId: null }, { regionId: 999, departmentId: 999 }]) {
    options.requesterDefaults = defaults
    await navigate('/tickets/new'); await waitText('Choose files')
    assert(!await checked('Beirut')); assert(!await checked('Operations'))
  }
  const ticket=tickets[0]; const cycle=original(ticket.id); setCycles([cycle]); ticket.currentCycle=cycle
  for (const status of ['NEW','ASSIGNED','IN_PROGRESS','WAITING_FOR_EMPLOYEE','BLOCKED','RESOLVED','CLOSED','CANCELLED']) {
    ticket.status=status
    await navigate('/tickets/142'); await waitText('Request #142')
    const editable=await evaluate(`[...document.querySelectorAll('button')].some(el => el.textContent.trim()==='Edit details')`)
    assert.equal(editable,['NEW','ASSIGNED'].includes(status))
    if (['IN_PROGRESS','WAITING_FOR_EMPLOYEE','BLOCKED'].includes(status)) {
      await waitText('Support work has started.'); await waitText('Send message')
    }
  }
  ticket.status='ASSIGNED'; await navigate('/tickets/142'); await waitText('Edit details'); await click('Edit details')
  await fill('#ticket-description','Unsaved information to copy'); ticket.status='IN_PROGRESS'
  await click('Save changes'); await waitText('Copy any unsaved changes before reloading.')
  assert.equal(await value('description'),'Unsaved information to copy')
  assert.equal(ticket.description,'Private draft description')
  await click('Reload ticket'); await waitText('Support work has started.')
  assert.deepEqual(browserErrors, [])
  console.log('PASS: guidance, picker limits/focus/mobile/themes, SPA draft selections/files, idempotent navigation retry, successful clearing, active-only home defaults and requester lifecycle/stale edit')
}
