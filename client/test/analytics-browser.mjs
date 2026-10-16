import { revalidatePage } from './revalidation.mjs'
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'

export function analyticsFixture() {
  return {
    mode: 'full',
    delayNext: 0,
    ranges: [],
    respond(request) {
      const days = Number(new URL(request.url).searchParams.get('days') || 30)
      this.ranges.push(days)
      const lag = this.delayNext
      this.delayNext = 0
      if (this.mode === 'live') {
        const endpoint = new URL('/analytics', process.env.ANALYTICS_REVIEW_URL)
        assert.equal(
          endpoint.hostname,
          '127.0.0.1',
          'Only the isolated local test server may receive test credentials',
        )
        endpoint.search = new URL(request.url).search
        return fetch(endpoint, {
          headers: {
            Authorization: `Bearer ${process.env.ANALYTICS_REVIEW_TOKEN}`,
          },
        }).then(async (response) => [
          response.status,
          await response.json(),
          0,
          response.headers.get('cache-control'),
        ])
      }
      if (this.mode === 'failure')
        return [503, { message: 'Analytics temporarily unavailable' }, lag]
      const empty = this.mode === 'empty'
      const count = empty ? 0 : days
      const group = {
        rows: empty
          ? []
          : [
              {
                name: `VPN (${days} days)`,
                archived: true,
                created: count,
                open: 4,
                reopened: 2,
              },
            ],
        totalGroups: empty ? 0 : 1,
      }
      return [
        200,
        {
          range: {
            days,
            from: '2026-10-09T12:00:00.000Z',
            to: '2026-10-16T12:00:00.000Z',
            timezone: 'UTC',
          },
          current: {
            open: empty ? 0 : 5,
            awaitingTeam: empty ? 0 : 1,
            awaitingAgent: empty ? 0 : 2,
            statuses: [
              'NEW',
              'ASSIGNED',
              'IN_PROGRESS',
              'WAITING_FOR_EMPLOYEE',
              'BLOCKED',
            ].map((status) => ({ status, count: empty ? 0 : 1 })),
          },
          period: {
            created: count,
            resolved: count,
            closed: count,
            reopenedTickets: empty ? 0 : 2,
            reopenEvents: empty ? 0 : 3,
          },
          resolution: {
            eligibleCycles: count,
            medianHours: empty ? null : 24,
            p90Hours: empty ? null : 48,
          },
          trend: [
            {
              date: '2026-10-16',
              created: count,
              resolved: count,
              closed: count,
            },
          ],
          aging: [
            'Under 1 day',
            '1–3 days',
            '3–7 days',
            '7–14 days',
            '14+ days',
          ].map((bucket) => ({ bucket, count })),
          groups: Object.fromEntries(
            [
              'categories',
              'tags',
              'regions',
              'departments',
              'combinations',
            ].map((key) => [key, group]),
          ),
          teams: {
            totalGroups: empty ? 0 : 1,
            rows: empty
              ? []
              : [
                  {
                    name: 'Network support',
                    scope: 'GLOBAL',
                    region: null,
                    open: 4,
                    awaitingAgent: 2,
                    eligibleAgents: 2,
                    ticketsPerAgent: 2,
                  },
                ],
          },
          expertise: {
            totalGroups: empty ? 0 : 1,
            rows: empty
              ? []
              : [
                  {
                    name: 'Network',
                    teams: 1,
                    eligibleAgents: 0,
                    open: 4,
                    blocked: 1,
                    awaitingAgent: 2,
                  },
                ],
          },
        },
        lag,
      ]
    },
  }
}

export async function analyticsBrowser({
  fixture,
  navigate,
  waitText,
  evaluate,
  fill,
  click,
  send,
  setUser,
  browserErrors,
}) {
  if (process.env.ANALYTICS_REVIEW_URL) {
    fixture.mode = 'live'
    // Observe the body delivered to the application, not just rendered text.
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
      window.__analyticsNetwork = [];
      const originalOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(method, url, ...args) {
        if (new URL(url, location.href).pathname === '/analytics') this.addEventListener('load', () => {
          window.__analyticsNetwork.push({ status: this.status, cacheControl: this.getResponseHeader('Cache-Control'), body: JSON.parse(this.responseText) });
        });
        return originalOpen.call(this, method, url, ...args);
      };`,
    })
    await navigate('/analytics?days=7')
    await waitText('Expertise coverage signals')
    const records = await evaluate('window.__analyticsNetwork')
    assert.equal(records.length, 1)
    assert.equal(records[0].status, 200)
    assert.equal(records[0].cacheControl, 'no-store')
    const body = records[0].body
    const keys = (value, allowed) =>
      assert.deepEqual(Object.keys(value).sort(), [...allowed].sort())
    keys(body, [
      'range',
      'current',
      'period',
      'resolution',
      'trend',
      'aging',
      'groups',
      'teams',
      'expertise',
    ])
    keys(body.range, ['days', 'from', 'to', 'timezone'])
    keys(body.current, ['open', 'awaitingTeam', 'awaitingAgent', 'statuses'])
    body.current.statuses.forEach((row) => keys(row, ['status', 'count']))
    keys(body.period, [
      'created',
      'resolved',
      'closed',
      'reopenedTickets',
      'reopenEvents',
    ])
    keys(body.resolution, ['eligibleCycles', 'medianHours', 'p90Hours'])
    body.trend.forEach((row) =>
      keys(row, ['date', 'created', 'resolved', 'closed']),
    )
    body.aging.forEach((row) => keys(row, ['bucket', 'count']))
    keys(body.groups, [
      'categories',
      'tags',
      'regions',
      'departments',
      'combinations',
    ])
    for (const section of Object.values(body.groups)) {
      keys(section, ['rows', 'totalGroups'])
      section.rows.forEach((row) =>
        keys(row, ['name', 'archived', 'created', 'open', 'reopened']),
      )
    }
    keys(body.teams, ['rows', 'totalGroups'])
    body.teams.rows.forEach((row) =>
      keys(row, [
        'name',
        'scope',
        'region',
        'open',
        'awaitingAgent',
        'eligibleAgents',
        'ticketsPerAgent',
      ]),
    )
    keys(body.expertise, ['rows', 'totalGroups'])
    body.expertise.rows.forEach((row) =>
      keys(row, [
        'name',
        'teams',
        'eligibleAgents',
        'open',
        'blocked',
        'awaitingAgent',
      ]),
    )
    assert(!JSON.stringify(body).includes('PRIVATE'))
    assert.equal(body.period.created, 7)
    assert.equal(body.period.reopenedTickets, 1)
    await evaluate('delete window.__analyticsNetwork')
    fixture.mode = 'full'
    console.log(
      'PASS: real analytics network payload has only approved aggregate fields, exact counts and no-store caching',
    )
  }
  await navigate('/analytics')
  await waitText('VPN (30 days)')
  assert(await evaluate(`!!document.querySelector('nav a[href="/analytics"]')`))
  for (const text of [
    'Operational overview',
    'Volume trend',
    'Categories',
    'Tags',
    'Affected Regions',
    'Affected Departments',
    'Backlog age',
    'Frequent combinations',
    'Team workload and capacity',
    'Expertise coverage signals',
    'Work with no configured specialist coverage',
  ])
    await waitText(text)
  assert.equal(
    await evaluate(
      `document.querySelectorAll('.analytics-page a[href*="/tickets/"]').length`,
    ),
    0,
  )
  assert(await evaluate(`!!document.querySelector('.status-donut') && document.querySelectorAll('.status-legend tbody tr').length === 5`))
  assert(await evaluate(`document.querySelector('.status-legend').textContent.includes('Waiting for employee') && !document.querySelector('.analytics-page').textContent.includes('Waiting for you')`))
  assert.equal(await evaluate(`document.querySelectorAll('.status-legend td:last-child').length`), 5)
  assert(await evaluate(`[...document.querySelectorAll('.status-legend td:last-child')].every(cell => cell.textContent === '20.0%')`))
  assert(await evaluate(`!document.querySelector('.analytics-controls').classList.contains('panel') && ![...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Refresh')`))
  console.log('PASS: compact activity toolbar, open-only donut, exact counts/percentages and neutral waiting label')
  for (const days of ['7', '90']) {
    await fill('#analytics-range', days)
    await waitText(`VPN (${days} days)`)
    assert.equal(
      await evaluate(`new URLSearchParams(location.search).get('days')`),
      days,
    )
  }
  await navigate('/analytics?days=7')
  await waitText('VPN (7 days)')
  fixture.delayNext = 900
  await fill('#analytics-range', '30')
  await waitText('Loading service analytics...')
  await fill('#analytics-range', '90')
  await waitText('VPN (90 days)')
  await delay(1100)
  assert(
    !(await evaluate(`document.body.textContent.includes('VPN (30 days)')`)),
  )
  console.log(
    'PASS: analytics Manager navigation, overview, structured sections, URL ranges, loading and stale-response protection',
  )

  await evaluate(
    `document.querySelector('.analytics-section details').open = true`,
  )
  await waitText('2026-10-16')
  for (const width of [768, 390]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width === 390,
    })
    for (const theme of ['light', 'dark']) {
      await evaluate(`document.documentElement.dataset.theme = '${theme}'`)
      assert(
        await evaluate('document.documentElement.scrollWidth <= innerWidth'),
        `${width}px ${theme} page overflow`,
      )
      assert.equal(
        await evaluate(
          `getComputedStyle(document.querySelector('.analytics-section')).backgroundColor`,
        ),
        theme === 'dark' ? 'rgb(23, 35, 43)' : 'rgb(255, 255, 255)',
      )
    }
  }
  console.log(
    'PASS: analytics daily table, tablet/mobile layout and light/dark surfaces',
  )
  fixture.mode = 'empty'
  await revalidatePage(evaluate)
  for (const text of [
    'No tickets created in this period',
    'Not enough data',
    'No active Teams configured',
    'No active Specialty data',
    'No activity or current backlog',
  ])
    await waitText(text)
  assert(await evaluate(`document.querySelector('.status-legend').textContent.includes('\u2014') && !document.querySelector('.status-legend').textContent.includes('NaN')`))
  await waitText('No open tickets. Percentages are not applicable.')
  fixture.mode = 'failure'
  await revalidatePage(evaluate)
  await waitText('Analytics temporarily unavailable')
  fixture.mode = 'full'
  await click('Try again')
  await waitText('VPN (90 days)')
  console.log(
    'PASS: analytics empty periods, missing Tags/Specialties/durations, request failure and retry',
  )

  for (const role of ['EMPLOYEE', 'AGENT', 'ADMIN', 'SUPER_ADMIN']) {
    setUser(role)
    const before = fixture.ranges.length
    await navigate('/analytics')
    await waitText('This page is not available for your account')
    assert.equal(
      await evaluate(
        `document.querySelectorAll('nav a[href="/analytics"]').length`,
      ),
      0,
    )
    assert.equal(
      fixture.ranges.length,
      before,
      `${role} must not request aggregates`,
    )
  }
  assert.deepEqual(browserErrors, [])
  console.log(
    'PASS: all four non-Manager roles denied direct route, no Analytics navigation/API calls; no runtime/console errors',
  )
}
