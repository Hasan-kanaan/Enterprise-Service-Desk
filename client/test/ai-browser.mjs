import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'

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
  until,
  setUser,
  browserErrors,
}) {
  const panel = "document.querySelector('.ai-suggestions')"
  await navigate('/work/tickets/143')
  await waitText('AI routing suggestions are temporarily disabled')
  await delay(300)
  assert(
    await evaluate(
      `${panel} && !${panel}.querySelector('button') && !${panel}.textContent.includes('Generate AI suggestions')`,
    ),
    'Disabled routing suggestions have no generation or apply controls',
  )
  assert(
    await evaluate(
      `(() => { const aside = document.querySelector('#ticket-information'); const text = aside?.textContent ?? ''; return text.indexOf('Request information') >= 0 && text.indexOf('Request information') < text.indexOf('AI suggestions') })()`,
    ),
    'Request information appears before AI suggestions',
  )
  assert.equal(fixture.calls, 0, 'Disabled suggestions do not call the provider')
  await navigate('/work/tickets/142')
  await waitText('AI routing suggestions are temporarily disabled')
  assert.equal(fixture.calls, 0, 'Intake does not call the provider')

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
  console.log('PASS: routing suggestions disabled; Request information appears first')
}
