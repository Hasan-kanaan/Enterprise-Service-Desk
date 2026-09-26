import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAppSelector } from '@/hooks/storeHooks'
import { useResource } from '@/hooks/useResource'
import { getWorkspace } from '@/services/operations.service'
import { getTicketSummary } from '@/services/tickets.service'
import { usePagedList, useDebouncedValue } from '@/hooks/usePagedList'
import { useListFilters } from '@/hooks/useListFilters'
import { ListContinuation } from '@/components/ListContinuation'
import type { TicketSummary } from '@/types/tickets'
import type { Subtask } from '@/types/operations'
import {
  ErrorState,
  LoadingState,
  EmptyState,
  TicketRows,
} from '@/components/TicketUI'
import { SubtaskRows } from '@/components/SubtaskUI'
export function OperationalWorkspacePage({
  view = 'mine',
  overview = false,
}: {
  view?: 'intake' | 'mine' | 'team' | 'subtasks'
  overview?: boolean
}) {
  const user = useAppSelector((state) => state.auth.user)!
  const manager = user.role === 'MANAGER'
  const filters = useListFilters()
  const all = filters.get('all') === 'true'
  const query = filters.get('search')
  const search = useDebouncedValue(query)
  const workspace = useResource(getWorkspace)
  const summary = useResource(
    useCallback(
      (signal: AbortSignal) =>
        overview ? getTicketSummary(signal) : Promise.resolve({ counts: [] }),
      [overview],
    ),
  )
  // Subtask-only navigation makes no parent list/detail/history request.
  const tickets = usePagedList<TicketSummary>(
    view === 'subtasks' ? null : '/tickets',
    {
      queue:
        view === 'intake'
          ? 'intake'
          : view === 'team'
            ? 'team'
            : filters.get('queue') || 'mine',
      active: all ? undefined : 'true',
      search: search || undefined,
    },
  )
  const tasks = usePagedList<Subtask>(
    view === 'subtasks' ? '/tickets/subtasks' : null,
    {
      currentWork: all ? undefined : 'true',
      search: search || undefined,
    },
  )
  const led = workspace.data?.ledTeams ?? []
  const visible = tickets.items
  const title = overview
    ? 'Support overview'
    : view === 'intake'
      ? 'New ticket intake'
      : view === 'team'
        ? 'Led-team tickets'
        : view === 'subtasks'
          ? 'Subtask workspace'
          : manager
            ? 'My tickets'
            : 'My assigned and collaborating tickets'
  const resource = view === 'subtasks' ? tasks : tickets
  const loading = resource.loading || workspace.loading
  const error = resource.error || workspace.error
  const reload = () => {
    tickets.reload()
    workspace.reload()
    tasks.reload()
    summary.reload()
  }
  return (
    <div className="ticket-workspace">
      <header className="page-heading">
        <div>
          <p className="eyebrow">
            {manager
              ? 'Manager workspace'
              : led.length
                ? 'Agent / Team Lead workspace'
                : 'Agent workspace'}
          </p>
          <h1>{title}</h1>
          <p className="muted">
            {view === 'intake'
              ? 'Take responsibility before routing or working a request.'
              : view === 'subtasks'
                ? 'Current-cycle assignees can open the parent ticket while its cycle remains unfinished. Historical subtask access remains limited.'
                : 'Current responsibility determines the work shown here.'}
          </p>
        </div>
        <button
          className="button secondary"
          onClick={reload}
          disabled={loading}
        >
          Refresh workspace
        </button>
      </header>
      <nav className="button-row" aria-label="Work queues">
        {manager && (
          <Link className="button secondary" to="/work/intake">
            New ticket intake
          </Link>
        )}
        <Link className="button secondary" to="/work/tickets">
          {manager ? 'My tickets' : 'Assigned and collaborating tickets'}
        </Link>
        {led.length > 0 && (
          <Link className="button secondary" to="/work/team">
            Led-team tickets
          </Link>
        )}
        <Link className="button secondary" to="/work/subtasks">
          Subtasks
        </Link>
      </nav>
      {overview && (
        <section className="ticket-stats" aria-label="Operational counts">
          <div className="stat-card">
            <span>
              {manager
                ? 'Unowned intake'
                : 'Active assigned and collaborating work'}
            </span>
            <strong>{summary.data?.counts[0] ?? '-'}</strong>
          </div>
          <div className="stat-card">
            <span>
              {manager ? 'My active tickets' : 'Active led-team tickets'}
            </span>
            <strong>{summary.data?.counts[1] ?? '-'}</strong>
          </div>
          <div className="stat-card">
            <span>Authorized incomplete subtasks</span>
            <strong>{summary.data?.counts[2] ?? '-'}</strong>
          </div>
        </section>
      )}
      {overview && !!tasks.error && (
        <ErrorState error={tasks.error} onRetry={tasks.reload} />
      )}
      <section className="panel">
        <div className="list-heading">
          <h2>{overview ? 'My active tickets' : title}</h2>
          {view !== 'intake' && !overview && (
            <label className="check-option">
              <input
                type="checkbox"
                checked={all}
                onChange={(event) =>
                  filters.set('all', event.target.checked ? 'true' : '')
                }
              />
              {view === 'subtasks'
                ? 'Include completed and historical work'
                : 'Include terminal tickets'}
            </label>
          )}
        </div>
        {
          <div className="list-filters">
            <label className="search-field">
              <input
                aria-label="Search work tickets"
                value={query}
                maxLength={120}
                onChange={(event) => filters.set('search', event.target.value)}
                placeholder="Search by title or ticket number"
              />
            </label>
          </div>
        }
        {!manager && view === 'mine' && (
          <select
            aria-label="Ticket queue filter"
            value={filters.get('queue')}
            onChange={(e) => filters.set('queue', e.target.value)}
          >
            <option value="">Assigned and collaborating</option>
            <option value="primary">Primary assignments</option>
            <option value="collaboration">Collaboration</option>
          </select>
        )}
        {loading ? (
          <LoadingState />
        ) : error && !resource.items.length ? (
          <ErrorState error={error} onRetry={reload} />
        ) : view === 'subtasks' ? (
          tasks.items.length ? (
            <SubtaskRows subtasks={tasks.items} />
          ) : (
            <EmptyState title="No authorized subtask work">
              <p>There is no work in this view.</p>
            </EmptyState>
          )
        ) : visible.length ? (
          <TicketRows tickets={visible} basePath="/work/tickets" />
        ) : (
          <EmptyState title="No tickets in this queue">
            <p>
              {view === 'team' && !led.length
                ? 'You do not currently lead a team.'
                : 'Try another queue or filter.'}
            </p>
          </EmptyState>
        )}
        <ListContinuation resource={resource} />
      </section>
      {led.length > 0 && (
        <p className="quiet-note">
          Currently leading: {led.map((item) => item.name).join(', ')}. Team
          membership alone does not grant ticket access.
        </p>
      )}
    </div>
  )
}
