import { useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useResource } from '@/hooks/useResource'
import { getAnalytics } from '@/services/analytics.service'
import { ErrorState, LoadingState } from '@/components/TicketUI'
import { OpenStatusChart } from '@/components/OpenStatusChart'
import type { AnalyticsResponse } from '@/types/analytics'
import '@/analytics.css'

const number = (value: number) => value.toLocaleString()
const duration = (value: number | null) =>
  value === null
    ? 'Not enough data'
    : `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} hours`
function LimitNote({ count, total }: { count: number; total: number }) {
  return total > count ? (
    <p className="muted">
      Showing {count} of {number(total)} groups, ordered by volume.
    </p>
  ) : null
}
function Groups({
  title,
  group,
  total,
}: {
  title: string
  group: AnalyticsResponse['groups']['categories']
  total: number
}) {
  return (
    <section className="panel analytics-section">
      <h2>{title}</h2>
      <LimitNote count={group.rows.length} total={group.totalGroups} />
      {group.rows.length ? (
        <div
          className="analytics-table-wrap"
          role="region"
          aria-label={title}
          tabIndex={0}
        >
          <table>
            <caption className="sr-only">
              {title}: created and reopened in the selected period, open now
            </caption>
            <thead>
              <tr>
                <th scope="col">Group</th>
                <th scope="col">Created</th>
                <th scope="col">Share of created</th>
                <th scope="col">Open now</th>
                <th scope="col">Reopened tickets</th>
              </tr>
            </thead>
            <tbody>
              {group.rows.map((row, index) => (
                <tr key={index}>
                  <th scope="row">
                    {row.name}
                    {row.archived && <span className="muted"> (archived)</span>}
                  </th>
                  <td>{number(row.created)}</td>
                  <td>
                    {total
                      ? `${((row.created / total) * 100).toFixed(1)}%`
                      : 'Not enough data'}
                  </td>
                  <td>{number(row.open)}</td>
                  <td>{number(row.reopened)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">
          No activity or current backlog for this grouping.
        </p>
      )}
    </section>
  )
}

export function AnalyticsPage() {
  const [params, setParams] = useSearchParams()
  const selected = params.get('days') ?? '30'
  const days = ['7', '30', '90'].includes(selected) ? selected : '30'
  const resource = useResource(
    useCallback((signal: AbortSignal) => getAnalytics(days, signal), [days]),
  )
  const data = resource.data
  return (
    <div className="ticket-workspace analytics-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Manager workspace</p>
          <h1>Service analytics</h1>
          <p className="muted">
            Company-wide aggregates, without individual performance metrics.
            Ticket details remain limited to your existing access.
          </p>
        </div>
        <Link className="button secondary" to="/work/tickets">
          My Work
        </Link>
      </header>
      <div className="compact-toolbar analytics-controls">
        <label htmlFor="analytics-range">Activity period</label>
        <select
          id="analytics-range"
          value={days}
          onChange={(event) => {
            const next = new URLSearchParams(params)
            next.set('days', event.target.value)
            setParams(next)
          }}
        >
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>
        {data && <span className="analytics-period">{new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).formatRange(new Date(data.range.from), new Date(data.range.to))}<span className="quiet-note"> UTC activity dates</span></span>}
      </div>
      {resource.loading && !data ? (
        <LoadingState label="Loading service analytics..." />
      ) : resource.error ? (
        <ErrorState error={resource.error} onRetry={resource.reload} />
      ) : (
        data && (
          <>
            <p className="quiet-note">Backlog and coverage are current snapshots, including older work.</p>
            {!data.period.created && (
              <p className="panel">
                No tickets created in this period. Current backlog and recorded
                lifecycle activity may still be present.
              </p>
            )}
            <section aria-labelledby="analytics-overview">
              <h2 id="analytics-overview">Operational overview</h2>
              <dl className="analytics-metrics">
                {Object.entries({
                  'Open now': data.current.open,
                  'Created in period': data.period.created,
                  'Resolution events': data.period.resolved,
                  'Closure events': data.period.closed,
                }).map(([label, value]) => (
                  <div className="panel" key={label}>
                    <dt>{label}</dt>
                    <dd>{number(value)}</dd>
                  </div>
                ))}
              </dl>
              <OpenStatusChart statuses={data.current.statuses} />
              <p className="muted">
                Open excludes resolved, closed and cancelled. Resolution and
                closure events count recorded work cycles; one ticket can
                contribute more than once after reopening.
              </p>
            </section>
            <section className="panel analytics-section">
              <h2>Volume trend</h2>
              <p className="muted">
                Daily UTC activity; first and last days may be partial.
              </p>
              <div
                className="analytics-trend"
                role="img"
                aria-label={`Daily created volume for the last ${days} days. Exact created, resolved and closed counts are in the table below.`}
              >
                {data.trend.map((row) => (
                  <div
                    key={row.date}
                    title={`${row.date}: ${row.created} created`}
                    style={{
                      height: `${Math.max(2, (row.created / Math.max(1, ...data.trend.map((day) => day.created))) * 100)}%`,
                    }}
                  />
                ))}
              </div>
              <details>
                <summary>Daily volume table</summary>
                <div
                  className="analytics-table-wrap"
                  tabIndex={0}
                  role="region"
                  aria-label="Daily volume"
                >
                  <table>
                    <caption className="sr-only">Daily volume in UTC</caption>
                    <thead>
                      <tr>
                        <th scope="col">Date</th>
                        <th scope="col">Created</th>
                        <th scope="col">Resolved</th>
                        <th scope="col">Closed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.trend.map((row) => (
                        <tr key={row.date}>
                          <th scope="row">{row.date}</th>
                          <td>{row.created}</td>
                          <td>{row.resolved}</td>
                          <td>{row.closed}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </section>
            <div className="analytics-grid">
              <section className="panel analytics-section">
                <h2>Backlog age</h2>
                <p className="muted">
                  Elapsed time since original ticket creation, including
                  reopened tickets. This is not an SLA measure.
                </p>
                <dl className="analytics-pairs">
                  {data.aging.map((row) => (
                    <div key={row.bucket}>
                      <dt>{row.bucket}</dt>
                      <dd>{number(row.count)}</dd>
                    </div>
                  ))}
                </dl>
              </section>
              <section className="panel analytics-section">
                <h2>Resolution and reopening</h2>
                <dl className="analytics-pairs">
                  <div>
                    <dt>Median resolution duration</dt>
                    <dd>{duration(data.resolution.medianHours)}</dd>
                  </div>
                  <div>
                    <dt>90th percentile</dt>
                    <dd>{duration(data.resolution.p90Hours)}</dd>
                  </div>
                  <div>
                    <dt>Eligible resolved cycles</dt>
                    <dd>{number(data.resolution.eligibleCycles)}</dd>
                  </div>
                  <div>
                    <dt>Tickets reopened in period</dt>
                    <dd>{number(data.period.reopenedTickets)}</dd>
                  </div>
                  <div>
                    <dt>Reopen events in period</dt>
                    <dd>{number(data.period.reopenEvents)}</dd>
                  </div>
                </dl>
                <p className="muted">
                  Duration runs from recorded cycle start to resolution,
                  including waiting time. Missing or invalid timestamps are
                  excluded. Reopens are process signals, not employee
                  performance scores.
                </p>
              </section>
            </div>
            <p className="muted">
              Group columns show creations and distinct reopened tickets during
              the period, alongside current open work. Tags and explicit
              multiple scopes overlap, so shares may sum above 100%. All regions
              / All departments contribute once to their own group and never to
              individual scopes. Catalog labels reflect current names.
            </p>
            <Groups
              title="Categories"
              group={data.groups.categories}
              total={data.period.created}
            />
            <Groups
              title="Tags"
              group={data.groups.tags}
              total={data.period.created}
            />
            <Groups
              title="Affected Regions"
              group={data.groups.regions}
              total={data.period.created}
            />
            <Groups
              title="Affected Departments"
              group={data.groups.departments}
              total={data.period.created}
            />
            <Groups
              title="Frequent combinations"
              group={data.groups.combinations}
              total={data.period.created}
            />
            <p className="muted">
              Category + Tag combinations are correlations for investigation,
              not confirmed root causes or supplier attribution.
            </p>
            <section className="panel analytics-section">
              <h2>Team workload and capacity</h2>
              <p>
                {number(data.current.awaitingTeam)} open tickets awaiting a Team
                · {number(data.current.awaitingAgent)} routed tickets without a
                primary Agent
              </p>
              <p className="muted">
                Active Teams and their primary tickets only; subtasks are
                excluded. Eligible Agents are active, activated Agent members.
                Membership can overlap across Teams. Tickets per Agent is a
                capacity signal, not a productivity measure.
              </p>
              <LimitNote
                count={data.teams.rows.length}
                total={data.teams.totalGroups}
              />
              {data.teams.rows.length ? (
                <div
                  className="analytics-table-wrap"
                  tabIndex={0}
                  role="region"
                  aria-label="Team capacity"
                >
                  <table>
                    <caption className="sr-only">
                      Current Team workload and eligible Agent counts
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Team / coverage</th>
                        <th scope="col">Open</th>
                        <th scope="col">Without Agent</th>
                        <th scope="col">Eligible Agents</th>
                        <th scope="col">Tickets per Agent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.teams.rows.map((row, index) => (
                        <tr key={index}>
                          <th scope="row">
                            {row.name}
                            <span className="muted">
                              {' '}
                              ·{' '}
                              {row.scope === 'GLOBAL'
                                ? 'Global'
                                : (row.region ?? 'Region unavailable')}
                            </span>
                          </th>
                          <td>{row.open}</td>
                          <td>{row.awaitingAgent}</td>
                          <td>{row.eligibleAgents}</td>
                          <td>{row.ticketsPerAgent ?? 'Not enough data'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">No active Teams configured.</p>
              )}
            </section>
            <section className="panel analytics-section">
              <h2>Expertise coverage signals</h2>
              <p className="muted">
                Actual configured Specialties only. Work counts belong to Teams
                with that Specialty; they do not prove that the tickets require
                it. Coverage counts distinct eligible members with the same
                Specialty on a matching Team. Specialties overlap. Categories
                and Tags have no configured Specialty mapping.
              </p>
              <LimitNote
                count={data.expertise.rows.length}
                total={data.expertise.totalGroups}
              />
              {data.expertise.rows.length ? (
                <div
                  className="analytics-table-wrap"
                  tabIndex={0}
                  role="region"
                  aria-label="Specialty coverage"
                >
                  <table>
                    <caption className="sr-only">
                      Specialty coverage and work on linked Teams
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Specialty</th>
                        <th scope="col">Teams</th>
                        <th scope="col">Eligible specialists</th>
                        <th scope="col">Team open work</th>
                        <th scope="col">Blocked</th>
                        <th scope="col">Without Agent</th>
                        <th scope="col">Signal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.expertise.rows.map((row, index) => (
                        <tr key={index}>
                          <th scope="row">{row.name}</th>
                          <td>{row.teams}</td>
                          <td>{row.eligibleAgents}</td>
                          <td>{row.open}</td>
                          <td>{row.blocked}</td>
                          <td>{row.awaitingAgent}</td>
                          <td>
                            {row.open > 0 && row.eligibleAgents === 0
                              ? 'Work with no configured specialist coverage'
                              : row.teams === 0
                                ? 'No matching Team'
                                : 'Review workload and coverage together'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">
                  No active Specialty data. Not enough data for expertise
                  signals.
                </p>
              )}
            </section>
          </>
        )
      )}
    </div>
  )
}
