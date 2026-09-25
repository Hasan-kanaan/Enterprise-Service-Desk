import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppSelector } from '@/hooks/storeHooks'
import { useResource } from '@/hooks/useResource'
import { getWorkspace, listSubtasks } from '@/services/operations.service'
import { listTickets } from '@/services/tickets.service'
import { isTerminal } from '@/types/ticketPresentation'
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
  const [all, setAll] = useState(false)
  const [query, setQuery] = useState('')
  const workspace = useResource(getWorkspace)
  // Subtask-only navigation deliberately makes no parent-ticket list/detail/history requests.
  const tickets = useResource(
    useCallback(
      (signal: AbortSignal) =>
        view === 'subtasks' ? Promise.resolve([]) : listTickets(signal),
      [view],
    ),
  )
  const tasks = useResource(
    useCallback(
      (signal: AbortSignal) =>
        view === 'subtasks' || overview
          ? listSubtasks(!all, signal)
          : Promise.resolve([]),
      [view, overview, all],
    ),
  )
  const led = workspace.data?.ledTeams ?? []
  const rows = tickets.data ?? []
  const intake = rows.filter(
    (ticket) => ticket.status === 'NEW' && ticket.assignedManagerId === null,
  )
  const mine = rows.filter((ticket) =>
    manager
      ? ticket.assignedManagerId === user.id
      : ticket.assignedAgentId === user.id || ticket.isCurrentCollaborator,
  )
  const team = rows.filter((ticket) =>
    led.some((item) => item.id === ticket.assignedTeamId),
  )
  const chosen = view === 'intake' ? intake : view === 'team' ? team : mine
  const visible = chosen.filter(
    (ticket) =>
      (all || !isTerminal(ticket.status)) &&
      `${ticket.id} ${ticket.title}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  )
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
              {manager ? 'Unowned intake' : 'Active assigned and collaborating work'}
            </span>
            <strong>
              {tickets.data
                ? manager
                  ? intake.length
                  : mine.filter((t) => !isTerminal(t.status)).length
                : '-'}
            </strong>
          </div>
          <div className="stat-card">
            <span>
              {manager ? 'My active tickets' : 'Active led-team tickets'}
            </span>
            <strong>
              {tickets.data && workspace.data
                ? (manager ? mine : team).filter((t) => !isTerminal(t.status))
                    .length
                : '-'}
            </strong>
          </div>
          <div className="stat-card">
            <span>Authorized incomplete subtasks</span>
            <strong>{tasks.data ? tasks.data.length : '-'}</strong>
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
                onChange={(event) => setAll(event.target.checked)}
              />
              {view === 'subtasks'
                ? 'Include completed and historical work'
                : 'Include terminal tickets'}
            </label>
          )}
        </div>
        {view !== 'subtasks' && (
          <div className="list-filters">
            <label className="search-field">
              <input
                aria-label="Search work tickets"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by title or ticket number"
              />
            </label>
          </div>
        )}
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : view === 'subtasks' ? (
          tasks.data?.length ? (
            <SubtaskRows subtasks={tasks.data} />
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
