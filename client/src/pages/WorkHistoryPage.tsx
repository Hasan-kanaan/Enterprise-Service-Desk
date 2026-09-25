import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
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
  const [page, setPage] = useState(1)
  const [contribution, setContribution] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
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
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Work History</h1>
        <p className="mt-2 text-sm text-slate-500">
          Your recorded completed work. Historical records do not grant ticket
          access.
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Only retained evidence is shown. Intermediate assignments are not
          recorded. Reopened cycles appear once ended.
        </p>
      </div>
      <div className="flex flex-wrap gap-4 rounded-xl border border-[var(--border)] p-4">
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          Contribution
          <select
            className="max-w-full rounded border p-2"
            value={contribution}
            onChange={(e) => {
              setContribution(e.target.value)
              setPage(1)
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
            className="max-w-full rounded border p-2"
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value)
              setPage(1)
            }}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          Through (UTC)
          <input
            className="max-w-full rounded border p-2"
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value)
              setPage(1)
            }}
          />
        </label>
      </div>
      {history.loading ? (
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
                Completed work with retained attribution will appear here. Try
                adjusting your filters.
              </p>
            </EmptyState>
          ) : (
            <ul className="space-y-3" aria-label="Historical work">
              {history.data.items.map((row) => (
                <li
                  key={`${row.kind}-${row.id}`}
                  className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:flex-row sm:items-center sm:justify-between"
                >
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
                    <p className="mt-1 text-sm text-slate-500">
                      {row.outcome
                        ? `Cycle ${row.outcome.toLowerCase()}`
                        : 'Cycle ongoing'}{' '}
                      · {formatDate(row.activityAt)}
                    </p>
                  </div>
                  {row.canOpenTicket ? (
                    <Link
                      className="shrink-0 text-sm font-semibold text-cyan-700"
                      to={`/work/tickets/${row.ticketId}`}
                    >
                      Open ticket
                    </Link>
                  ) : (
                    <span className="shrink-0 text-sm text-slate-500">
                      Historical record only
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <nav
            className="flex items-center justify-between gap-3"
            aria-label="History pagination"
          >
            <button
              className="rounded border px-3 py-2 disabled:opacity-40"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <span aria-live="polite">Page {page}</span>
            <button
              className="rounded border px-3 py-2 disabled:opacity-40"
              disabled={!history.data?.hasMore}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </nav>
        </>
      )}
    </section>
  )
}
