import { Plus, Search, RefreshCw, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAppSelector } from '@/hooks/storeHooks'
import { useResource } from '@/hooks/useResource'
import { usePagedList, useDebouncedValue } from '@/hooks/usePagedList'
import { useListFilters } from '@/hooks/useListFilters'
import { ListContinuation } from '@/components/ListContinuation'
import { getTicketSummary } from '@/services/tickets.service'
import {
  ticketStatuses,
  type TicketSummary,
  type TicketStatus,
} from '@/types/tickets'
import { statusLabels } from '@/types/ticketPresentation'
import {
  EmptyState,
  ErrorState,
  LoadingState,
  TicketRows,
} from '@/components/TicketUI'

export function EmployeeTicketsPage({
  overview = false,
}: {
  overview?: boolean
}) {
  const user = useAppSelector((state) => state.auth.user)
  const filters = useListFilters()
  const query = filters.get('search')
  const filter = filters.get('state') || 'all'
  const status = filters.get('status') as TicketStatus | ''
  const search = useDebouncedValue(query)
  const resource = usePagedList<TicketSummary>('/tickets', {
    search: search || undefined,
    status: status || undefined,
    active:
      filter === 'active'
        ? 'true'
        : filter === 'finished'
          ? 'false'
          : undefined,
    limit: overview ? 5 : 25,
  })
  const summary = useResource(getTicketSummary)
  const { items: tickets, error, loading } = resource
  const reload = () => {
    resource.reload()
    summary.reload()
  }
  const visible = tickets
  const counts = summary.data?.counts
  const searching = !!(query || status || filter !== 'all')
  return (
    <div className="ticket-workspace">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Employee workspace</p>
          <h1>
            {overview ? `Hello, ${user?.username ?? 'there'}.` : 'My tickets'}
          </h1>
          <p className="muted">
            {overview
              ? 'A clear view of your support requests, from the first report to the final fix.'
              : 'Track your requests and pick up where you left off.'}
          </p>
        </div>
        <Link className="button primary" to="/tickets/new">
          <Plus size={18} />
          New ticket
        </Link>
      </header>
      <section className="ticket-stats" aria-label="Ticket summary">
        {['Active requests', 'Waiting for you', 'Ready to close'].map(
          (label, index) => (
            <div className="stat-card" key={label}>
              <span>{label}</span>
              <strong>{counts ? counts[index] : '-'}</strong>
              <p>
                {
                  [
                    'Your team is working on these',
                    'Support is waiting for your input',
                    'Review the result and confirm',
                  ][index]
                }
              </p>
            </div>
          ),
        )}
      </section>
      <section className="panel">
        <div className="list-heading">
          <h2>{overview ? 'Recent requests' : 'Your requests'}</h2>
          <button
            className="icon-button"
            onClick={reload}
            disabled={loading}
            aria-label="Refresh tickets"
          >
            <RefreshCw size={18} />
          </button>
        </div>
        {!overview && (
          <>
            <div className="ticket-tabs" aria-label="Ticket filters">
              {[
                ['all', 'All requests'],
                ['active', 'Active'],
                ['finished', 'Finished'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={filter === value ? 'selected' : ''}
                  aria-pressed={filter === value}
                  onClick={() => filters.set('state', value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="list-filters">
              <label className="search-field">
                <Search size={18} />
                <input
                  aria-label="Search tickets"
                  value={query}
                  maxLength={120}
                  onChange={(event) =>
                    filters.set('search', event.target.value)
                  }
                  placeholder="Search by title or ticket number"
                />
              </label>
              <select
                aria-label="Filter by status"
                value={status}
                onChange={(event) => filters.set('status', event.target.value)}
              >
                <option value="">All statuses</option>
                {ticketStatuses.map((value) => (
                  <option key={value} value={value}>
                    {statusLabels[value]}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
        {loading ? (
          <LoadingState />
        ) : error && !tickets.length ? (
          <ErrorState error={error} onRetry={reload} />
        ) : visible.length ? (
          <TicketRows tickets={visible} />
        ) : (
          <EmptyState
            title={
              searching
                ? 'No matching requests'
                : 'Your next request starts here'
            }
          >
            <p className="muted">
              {searching
                ? 'Try a different search or filter.'
                : 'Tell us what is getting in your way. You can follow every update here.'}
            </p>
            {!searching && (
              <Link className="button secondary" to="/tickets/new">
                Create your first ticket
              </Link>
            )}
          </EmptyState>
        )}
        {!overview && <ListContinuation resource={resource} />}
        {overview && !!tickets?.length && (
          <Link className="list-footer" to="/tickets">
            View all requests <ArrowRight size={16} />
          </Link>
        )}
      </section>
      <p className="quiet-note">
        Only tickets you requested appear in this workspace.
      </p>
    </div>
  )
}
