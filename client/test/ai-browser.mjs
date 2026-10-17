import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

export function aiFixture() {
  return {
    mode: 'success',
    calls: 0,
    lag: 0,
    respond(ticket) {
      this.calls++
      if (this.mode === 'unavailable')
        return [503, { message: 'AI unavailable' }]
      if (this.mode === 'limited') return [429, { message: 'AI rate limited' }]
      const evidence = {
        confidence: this.mode === 'weak' ? 0.4 : 0.8,
        reason: 'VPN issue fits network support.',
      }
      const routing = ticket.assignedManagerId === 20
      return [
        200,
        {
          ticketUpdatedAt: ticket.updatedAt,
          generatedAt: new Date().toISOString(),
          suggestions: {
            category: { id: 4, name: 'Network', ...evidence },
            priority: { value: 'HIGH', ...evidence },
            tags: [{ id: 7, name: 'VPN', ...evidence }],
            team: {
              id: routing ? 8 : null,
              name: routing ? 'Network support' : null,
              ...evidence,
            },
            agent: {
              id: routing ? 31 : null,
              name: routing ? 'Ali' : null,
              ...evidence,
            },
          },
        },
        this.lag,
      ]
    },
  }
}

export async function aiBrowser({
  fixture,
  navigate,
  waitText,
  evaluate,
  click,
  send,
  until,
  mutations,
  setUser,
  setConflict,
  browserErrors,
}) {
  const panel = "document.querySelector('.ai-suggestions')"
  const generate = async () => {
    await click('Generate AI suggestions')
    await waitText('AI confidence:')
  }
  await navigate('/work/tickets/143')
  await waitText('Generate AI suggestions')
  await delay(300)
  assert.equal(fixture.calls, 0, 'No generation on load')
  const before = mutations.length
  fixture.lag = 500
  await click('Generate AI suggestions')
  await waitText('Please wait…')
  assert(await evaluate(`${panel}.querySelector('button').disabled`))
  await waitText('AI confidence: 80%')
  assert.equal(fixture.calls, 1)
  assert.equal(mutations.length, before)
  assert(
    await evaluate(
      `${panel}.textContent.includes('AI-generated suggestion — review before applying.')`,
    ),
  )
  await click('Apply priority')
  await waitText('Generate AI suggestions')
  assert.deepEqual(mutations.at(-1), {
    path: '/tickets/143',
    body: { priority: 'HIGH', expectedUpdatedAt: '2026-09-22T08:00:00.000Z' },
  })
  fixture.lag = 0
  await generate()
  await click('Apply agent with team Network support')
  await waitText('Generate AI suggestions')
  assert.equal(mutations.at(-1).path, '/tickets/143/assignment')
  assert.equal(mutations.at(-1).body.teamId, 8)
  assert.equal(mutations.at(-1).body.agentId, 31)
  assert(mutations.at(-1).body.expectedUpdatedAt)
  console.log(
    'PASS: Manager manual generation, pending disable, review, no automatic writes, normal selective metadata and routing APIs',
  )

  for (const [mode, text] of [
    ['unavailable', 'AI suggestions are temporarily unavailable'],
    ['limited', 'AI generation limit reached'],
  ]) {
    fixture.mode = mode
    await click('Generate AI suggestions')
    await waitText(text)
  }
  fixture.mode = 'weak'
  await generate()
  await waitText('Low confidence')
  assert(
    await evaluate(
      `[...${panel}.querySelectorAll('button')].filter(b => b.textContent.startsWith('Apply')).every(b => b.disabled)`,
    ),
  )
  await click('Dismiss suggestions')
  fixture.mode = 'success'
  await generate()
  setConflict(true)
  await click('Apply priority')
  await waitText('Reload and regenerate suggestions')
  await click('Reload ticket')
  await waitText('Generate AI suggestions')
  console.log(
    'PASS: provider unavailable, rate limit, low-confidence suppression, stale mutation recovery',
  )

  await generate()
  for (const theme of ['light', 'dark']) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    })
    await evaluate(
      `document.documentElement.dataset.theme = '${theme}'; ${panel}.scrollIntoView()`,
    )
    assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'))
    const screenshot = await send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(
      join(tmpdir(), `eds-ai-${theme}-mobile.png`),
      Buffer.from(screenshot.data, 'base64'),
    )
  }
  await navigate('/work/tickets/142')
  await waitText('Generate AI suggestions')
  const calls = fixture.calls
  await delay(250)
  assert.equal(fixture.calls, calls, 'Intake must not generate automatically')
  await generate()
  assert(
    await evaluate(
      `[...${panel}.querySelectorAll('button')].filter(b => b.textContent.startsWith('Apply')).every(b => b.disabled)`,
    ),
  )
  console.log(
    'PASS: mobile light/dark layouts; intake classification without routing or apply authority',
  )

  for (const role of ['AGENT', 'ADMIN', 'EMPLOYEE', 'SUPER_ADMIN']) {
    setUser(role, role === 'AGENT' ? 31 : 20)
    const prior = fixture.calls
    await navigate('/work/tickets/143')
    if (role === 'AGENT') await waitText('Owned network issue')
    else await waitText('This page is not available')
    await until(() => evaluate(`!${panel}`), 'AI panel excluded')
    assert.equal(fixture.calls, prior)
  }
  assert.deepEqual(browserErrors, [])
  console.log(
    'PASS: Agent/Employee/Admin/Super Admin exclusion, no runtime errors',
  )
}
