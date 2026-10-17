import { useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Pagination } from '@/components/Pagination'
import { EmptyState, ErrorState, LoadingState } from '@/components/TicketUI'
import { useResource } from '@/hooks/useResource'
import api from '@/services/api'
import { formatDate } from '@/types/ticketPresentation'

const labels: Record<string, string> = {
  RESPONSIBLE_MANAGER: 'Responsible Manager',
  PRIMARY_AGENT: 'Primary Agent',
  ENDED_WORK: 'Resolved / ended work',
  CLOSED_WORK: 'Closed work',
  REOPENED_WORK: 'Reopened work',
  COMPLETED_SUBTASK: 'Completed subtask',
}
type HistoryPage = {
  items: {
    kind: 'CYCLE' | 'SUBTASK'
    id: number
    ticketId: number
    cycleId: number
    sequenceNumber: number
    cycleType: string
    outcome: string | null
    activityAt: string
    contributions: string[]
    subtaskTitle: string | null
    subtaskStatus: string | null
    canOpenTicket: boolean
  }[]
  page: number
  pageSize: number
  hasMore: boolean
}
export function WorkHistoryPage() {
  const [params, setParams] = useSearchParams()
  const requestedPage = Number(params.get('page') ?? 1)
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const contribution = params.get('contribution') ?? ''
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const setFilter = (name: string, value: string) => setParams(previous => {
    const next = new URLSearchParams(previous)
    if (value) next.set(name, value)
    else next.delete(name)
    next.delete('page')
    return next
  })
  const setPage = (value: number) => setParams(previous => {
    const next = new URLSearchParams(previous)
    if (value === 1) next.delete('page')
    else next.set('page', String(value))
    return next
  })
  const history = useResource(
    useCallback(
      async (signal: AbortSignal) =>
        (
          await api.get<HistoryPage>('/my-work-history', {
            signal,
            params: {
              page,
              pageSize: 25,
              contribution: contribution || undefined,
              from: from ? `${from}T00:00:00.000Z` : undefined,
              to: to ? `${to}T23:59:59.999Z` : undefined,
            },
          })
        ).data,
      [page, contribution, from, to],
    ),
  )
  return (
    <section className="ticket-workspace">
      <header className="page-heading">
        <div>
          <h1>My Work History</h1>
          <p className="muted">
            Your recorded completed work. Historical records do not grant ticket
            access.
          </p>
        </div>
      </header>
      <div className="list-filters history-filters">
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          Contribution
          <select
            className="max-w-full rounded border border-[var(--border)] bg-[var(--card)] p-2"
            value={contribution}
            onChange={(e) => {
              setFilter('contribution', e.target.value)
            }}
          >
            <option value="">All contributions</option>
            {Object.entries(labels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          From (UTC)
          <input
            className="max-w-full rounded border border-[var(--border)] bg-[var(--card)] p-2"
            type="date"
            value={from}
            onChange={(e) => {
              setFilter('from', e.target.value)
            }}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          Through (UTC)
          <input
            className="max-w-full rounded border border-[var(--border)] bg-[var(--card)] p-2"
            type="date"
            value={to}
            onChange={(e) => {
              setFilter('to', e.target.value)
            }}
          />
        </label>
      </div>
      {history.loading && !history.data ? (
        <LoadingState label="Loading work history..." />
      ) : history.error ? (
        <ErrorState
          error={history.error}
          onRetry={history.reload}
          message="We could not load your work history."
        />
      ) : (
        <>
          {!history.data?.items.length ? (
            <EmptyState title="No work history found">
              <p>
                {contribution || from || to
                  ? 'No completed work matches these filters. Try a different contribution or date range.'
                  : 'Completed work with retained attribution will appear here.'}
              </p>
            </EmptyState>
          ) : (
            <ul className="history-list" aria-label="Historical work">
              {history.data.items.map((row) => (
                <li key={`${row.kind}-${row.id}`} className="admin-row">
                  <div className="min-w-0 break-words">
                    <h2 className="font-semibold">
                      Ticket #{row.ticketId} · Cycle {row.sequenceNumber} (
                      {row.cycleType.toLowerCase()})
                    </h2>
                    <p className="mt-1 text-sm">
                      {row.contributions.map((c) => labels[c]).join(' · ')}
                    </p>
                    {row.kind === 'SUBTASK' && (
                      <p className="mt-1">
                        Subtask #{row.id}: {row.subtaskTitle} · Completed
                      </p>
                    )}
                    <p className="mt-1 quiet-note">
                      {row.outcome
                        ? `Cycle ${row.outcome.toLowerCase()}`
                        : 'Cycle ongoing'}{' '}
                      · {formatDate(row.activityAt)}
                    </p>
                  </div>
                  {row.canOpenTicket ? (
                    <Link
                      className="text-button shrink-0"
                      to={`/work/tickets/${row.ticketId}`}
                    >
                      Open ticket
                    </Link>
                  ) : (
                    <span className="quiet-note shrink-0">
                      Historical record only
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <Pagination page={page} hasMore={!!history.data?.hasMore} busy={history.loading} onPage={setPage} label="History pagination" />
        </>
      )}
    </section>
  )
}
