import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

export function requesterAiFixture() {
  return {
    mode: 'success', lag: 0, calls: [],
    respond(body) {
      this.calls.push(body)
      if (this.mode === 'unavailable') return [503, { message: 'Unavailable' }]
      if (this.mode === 'limited') return [429, { message: 'Limit reached' }]
      const status = this.mode === 'out' ? 'OUT_OF_SCOPE' : this.mode === 'vague' ? 'NEEDS_MORE_INFORMATION' : 'IN_SCOPE'
      const good = status === 'IN_SCOPE', nullable = !good || this.mode === 'null'
      const choice = id => ({ id: nullable ? null : this.mode === 'invalid' ? 999 : id, confidence: this.mode === 'low' ? .2 : .9, reason: 'Matches supplied information.' })
      return [200, {
        scope: { status, confidence: this.mode === 'low' ? .2 : .9, reasonCode: good ? 'IT_REQUEST' : status === 'OUT_OF_SCOPE' ? 'UNRELATED_REQUEST' : 'INSUFFICIENT_CONTEXT', message: good ? 'Review the fields.' : status === 'OUT_OF_SCOPE' ? "This doesn't appear to be a workplace IT support request. Please describe the IT problem or service you need." : 'I need a little more information. Tell us what device, application, account, or service is affected and what happens when you try to use it.' },
        suggestions: { title: nullable || this.mode === 'invalid' ? null : 'VPN connection failure', description: nullable || this.mode === 'invalid' ? null : 'The company VPN cannot connect in the Beirut Operations office.', category: choice(4), priority: { value: nullable || this.mode === 'invalid' ? null : 'HIGH', confidence: .9, reason: 'Review impact.' }, tags: nullable ? [] : [choice(7)], region: choice(2), department: choice(3) },
      }, this.lag]
    },
  }
}

export async function requesterAiBrowser({ fixture, send, evaluate, navigate, waitText, until, click, fill, checkLabel, selectAttachment, mutations, requests, browserErrors, options, tickets }) {
  options.categories.push({ id: 5, name: 'Access' })
  options.regions.push({ id: 12, name: 'Tripoli' })
  options.departments.push({ id: 13, name: 'Finance' })
  options.tags.push({ id: 8, name: 'Existing tag' })
  const description = 'My company VPN cannot connect from the Beirut Operations office.'
  const helper = 'Help me complete this ticket'
  const success = 'AI helped complete this ticket. Review the fields before submitting.'
  const disabled = text => evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)})?.disabled`)
  const value = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).value`)
  const checked = label => evaluate(`[...document.querySelectorAll('label')].find(el => el.textContent.trim() === ${JSON.stringify(label)}).querySelector('input').checked`)
  const snapshot = () => evaluate(`[...document.querySelectorAll('.ticket-form input:not([type=file]), .ticket-form textarea, .ticket-form select')].map(el => ({ id: el.id, label: el.closest('label')?.textContent.trim(), value: el.value, checked: el.checked }))`)
  const reset = async () => { await navigate('/tickets/new'); await waitText(helper) }
  const seed = async () => {
    await fill('#ticket-title', 'Original request')
    await fill('#ticket-description', description)
    await fill('#ticket-category', '5')
    await fill('#ticket-priority', 'LOW')
    await checkLabel('Tripoli'); await checkLabel('Finance')
    await evaluate("document.querySelector('.optional-fields').open = true")
    await checkLabel('Existing tag')
  }
  const override = async () => {
    await fill('#ticket-title', 'My final edited title')
    await fill('#ticket-description', description + ' Please review access.')
    await fill('#ticket-category', '5')
    await fill('#ticket-priority', 'LOW')
    await checkLabel('VPN'); await checkLabel('Beirut'); await checkLabel('Tripoli')
    await checkLabel('Operations'); await checkLabel('Finance')
  }
  await reset(); await seed()
  await selectAttachment('input[type=file]', 'private-network-log.txt')
  const before = await snapshot()
  fixture.lag = 600
  await evaluate("document.querySelector('.draft-assistance button').focus({ preventScroll: true })")
  await click(helper); await waitText('Analyzing your request')
  assert(await evaluate("document.querySelector('.draft-assistance button').getAttribute('aria-disabled') === 'true'"))
  await click(helper) // Guard repeated activation while retaining keyboard focus.
  await waitText(success)
  assert.equal(fixture.calls.length, 1)
  assert.equal(await value('#ticket-title'), 'VPN connection failure')
  assert.equal(await value('#ticket-description'), 'The company VPN cannot connect in the Beirut Operations office.')
  assert.equal(await value('#ticket-category'), '4')
  assert.equal(await value('#ticket-priority'), 'HIGH')
  for (const label of ['Beirut', 'Operations', 'VPN', 'Existing tag']) assert(await checked(label))
  for (const label of ['Tripoli', 'Finance', 'All regions', 'All departments']) assert(!await checked(label))
  assert(await evaluate("document.activeElement === document.querySelector('.draft-assistance button')"))
  assert(await evaluate("document.querySelector('.draft-assistance [role=status]').getAttribute('aria-live') === 'polite'"))
  assert(!await evaluate("!!document.querySelector('.draft-assistance .ai-suggestion') || [...document.querySelectorAll('.draft-assistance button')].some(b => b.textContent.includes('Apply'))"))
  assert.equal(mutations.length, 0)
  assert.deepEqual(fixture.calls[0], { title: 'Original request', description })
  await waitText('private-network-log.txt')
  console.log('PASS: all seven fields populate directly, tags merge, no duplicate controls/Apply actions, accessible status/focus and no automatic submission')

  await override()
  const final = await snapshot()
  await click('Undo AI changes')
  assert.deepEqual(await snapshot(), before)
  await waitText('private-network-log.txt')
  await waitText('Your pre-AI form values have been restored')
  assert(await evaluate("document.activeElement === document.querySelector('.draft-assistance button')"))
  fixture.lag = 0
  await click(helper); await waitText(success)
  await override()
  assert.deepEqual(await snapshot(), final)
  assert.equal(mutations.length, 0)
  await click('Submit ticket'); await waitText('Request #142')
  assert.equal(mutations.length, 1)
  assert.equal(mutations[0].body.title, 'My final edited title')
  assert.equal(mutations[0].body.description, description + ' Please review access.')
  assert.equal(mutations[0].body.priority, 'LOW')
  assert.deepEqual(mutations[0].body.tagIds, [8])
  assert.equal(typeof mutations[0].body.clientRequestId, 'string')
  assert.deepEqual(tickets[0].attachments.map(file => file.filename), ['private-network-log.txt'])
  assert(fixture.calls.every(call => Object.keys(call).sort().join(',') === 'description,title'))
  assert(!JSON.stringify(fixture.calls).includes('private-network-log'))
  console.log('PASS: every populated field remains editable; Undo restores exact pre-AI snapshot after manual edits; normal explicit submission sends final values and intact attachment')

  for (const mode of ['null', 'low', 'invalid']) {
    await reset(); await seed(); fixture.mode = mode
    const before = await snapshot()
    await click(helper); await waitText('AI found no confident changes')
    assert.deepEqual(await snapshot(), before)
    assert(!await evaluate("document.body.textContent.includes('Undo AI changes')"))
  }
  console.log('PASS: null, low-confidence and unavailable candidate suggestions leave all existing controls unchanged')

  for (const [mode, text, message] of [
    ['out', 'Please give me a recipe for a chocolate cake.', "This doesn't appear to be a workplace IT support request"],
    ['vague', 'I have a problem and need some help please.', 'I need a little more information.'],
  ]) {
    await reset(); await seed(); fixture.mode = mode
    await fill('#ticket-description', text)
    const before = await snapshot(), calls = fixture.calls.length
    await click(helper); await waitText(message)
    assert.deepEqual(await snapshot(), before)
    await click(helper); await waitText('Reused the previous result')
    assert.equal(fixture.calls.length, calls + 1)
    assert.deepEqual(await snapshot(), before)
    await fill('#ticket-description', text + ' More context.')
    await click(helper); await waitText(message)
    assert.equal(fixture.calls.length, calls + 2)
    assert.equal(await disabled('Submit ticket'), false)
  }
  console.log('PASS: both negative scopes change no fields, retain manual submission and reuse unchanged results without a new call')

  await reset(); await seed()
  const calls = fixture.calls.length
  await fill('#ticket-description', 'help'); assert(await disabled(helper))
  await fill('#ticket-description', 'x'.repeat(3001)); assert(await disabled(helper))
  assert.equal((await value('#ticket-description')).length, 3001)
  await waitText('Shorten the description to use AI')
  assert.equal(fixture.calls.length, calls)
  await fill('#ticket-description', description)
  for (const [mode, message] of [['unavailable', 'AI assistance is temporarily unavailable'], ['limited', 'AI generation limit reached']]) {
    fixture.mode = mode
    const before = await snapshot()
    await click(helper); await waitText(message)
    assert.deepEqual(await snapshot(), before)
    assert.equal(await disabled('Submit ticket'), false)
  }
  console.log('PASS: input limits preserve original text; provider failure and 429 preserve every draft field')

  fixture.mode = 'success'; fixture.lag = 700
  await click(helper)
  await fill('#ticket-description', description + ' I am adding context.')
  const changed = await snapshot()
  await waitText('No fields were updated')
  assert.deepEqual(await snapshot(), changed)
  await reset(); await seed()
  await click(helper)
  await fill('#ticket-priority', 'CRITICAL')
  await evaluate("document.querySelector('#ticket-priority').focus({ preventScroll: true })")
  await waitText(success)
  assert.equal(await value('#ticket-priority'), 'CRITICAL')
  assert(await evaluate("document.activeElement.id === 'ticket-priority'"))
  await click('Undo AI changes')
  assert.equal(await value('#ticket-priority'), 'CRITICAL') // Snapshot is taken at application, not request start.
  assert.equal(await value('#ticket-title'), 'Original request')
  console.log('PASS: stale text blocks population; in-flight field edits/focus are preserved and Undo captures the latest pre-application draft')

  fixture.lag = 0
  await click(helper); await waitText(success)
  fixture.mode = 'out'
  await click(helper); await waitText("This doesn't appear to be a workplace IT support request")
  assert(!await evaluate("document.body.textContent.includes('Undo AI changes')"))
  fixture.mode = 'success'
  await reset(); await seed(); await click(helper); await waitText(success)
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  for (const theme of ['light', 'dark']) {
    await evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}`)
    await evaluate("document.querySelector('#ticket-description').scrollIntoView(); window.scrollBy(0, -90); new Promise(resolve => setTimeout(resolve, 250))")
    assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'), theme + ' mobile width')
    assert(await evaluate("document.querySelector('.draft-assistance').getBoundingClientRect().height < 370"))
    const screenshot = await send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(tmpdir(), 'eds-requester-ai-390-' + theme + '.png'), Buffer.from(screenshot.data, 'base64'))
  }
  assert(!requests.some(path => /internal-notes|ticket-workspace|ai-suggestions/.test(path)))
  assert.deepEqual(browserErrors, [])
  console.log('PASS: next generation clears Undo; compact 390px light/dark form assistance, no routing APIs or runtime errors')
}
