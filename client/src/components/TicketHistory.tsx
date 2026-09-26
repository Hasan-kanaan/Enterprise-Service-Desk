import api from '@/services/api'
import { useOlderPages, uniqueById } from '@/hooks/useOlderPages'
import type { TicketHistory as HistoryPage } from '@/types/tickets'
import { ErrorState } from './TicketUI'
import type { ReactNode } from 'react'
import type { WorkCycle } from '@/types/tickets'
import { cycleLabel, formatDate } from '@/types/ticketPresentation'
import { StatusBadge } from '@/components/TicketUI'

export function TicketHistory({
  history,
  renderWork,
}: {
  history: HistoryPage
  renderWork?: (cycle: WorkCycle) => ReactNode
}) {
  const pages = useOlderPages(history, (current, older) => ({
    ...current,
    hasMore: older.hasMore,
    nextCursor: older.nextCursor,
    cycles: uniqueById([...current.cycles, ...older.cycles]),
  }))
  const data = pages.data ?? history
  const loadOlder = () =>
    pages.load(
      async () =>
        (
          await api.get<HistoryPage>(`/tickets/${history.ticketId}/history`, {
            params: { cursor: data.nextCursor },
          })
        ).data,
    )
  return (
    <>
      <ol className="cycle-list">
        {data.cycles.map((cycle) => (
          <li key={cycle.id} className="cycle-card">
            <div className="cycle-marker" aria-hidden="true">
              {cycle.sequenceNumber}
            </div>
            <div className="cycle-content">
              <div className="cycle-heading">
                <h3>
                  {cycle.isCurrent && !cycle.isEnded ? 'Current work - ' : ''}
                  {cycleLabel(cycle)}
                </h3>
                {cycle.outcome && <StatusBadge status={cycle.outcome} />}
              </div>
              <p className="muted small">
                Started {formatDate(cycle.startedAt, true)}
                {cycle.startedBy ? ` by ${cycle.startedBy.username}` : ''}
              </p>
              {cycle.startReason && (
                <div className="history-text">
                  <span className="detail-label">Reason for reopening</span>
                  <p>{cycle.startReason}</p>
                </div>
              )}
              {cycle.startDisposition === 'RETURN_TO_INTAKE' && (
                <p className="muted small">
                  Returned to the support queue for a new assignment.
                </p>
              )}
              {cycle.resolutionSummary && (
                <div className="resolution-note">
                  <span className="detail-label">Resolution</span>
                  <p>{cycle.resolutionSummary}</p>
                </div>
              )}
              <dl className="history-owners">
                <div>
                  <dt>Manager</dt>
                  <dd>{cycle.ownership.manager?.username ?? 'Not recorded'}</dd>
                </div>
                <div>
                  <dt>Team</dt>
                  <dd>{cycle.ownership.team?.name ?? 'Not recorded'}</dd>
                </div>
                <div>
                  <dt>Agent</dt>
                  <dd>{cycle.ownership.agent?.username ?? 'Not recorded'}</dd>
                </div>
              </dl>
              {cycle.isEnded && (
                <p className="muted small">
                  {cycle.outcome === 'CANCELLED' ? 'Cancelled' : 'Resolved'}{' '}
                  {formatDate(cycle.endedAt, true)}
                  {cycle.endedBy ? ` by ${cycle.endedBy.username}` : ''}
                </p>
              )}
              {cycle.closedAt && (
                <p className="muted small">
                  {cycle.closeSource === 'AUTO_TIMEOUT'
                    ? 'Automatically closed'
                    : 'Closed'}{' '}
                  {formatDate(cycle.closedAt, true)}
                  {cycle.closedBy ? ` by ${cycle.closedBy.username}` : ''}
                </p>
              )}
              {renderWork?.(cycle)}
              {cycle.ownership.basis === 'RECORDED_AT_MIGRATION' && (
                <p className="quiet-note">
                  Ownership was recorded when this history was introduced.
                  Earlier assignment details are not available.
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
      {data.hasMore ? (
        <button
          className="button secondary"
          disabled={pages.loading}
          onClick={() => void loadOlder()}
        >
          {pages.loading ? 'Loading older history...' : 'Load older history'}
        </button>
      ) : (
        <p className="muted small">Beginning of work history.</p>
      )}
      {!!pages.error && (
        <ErrorState error={pages.error} onRetry={() => void loadOlder()} />
      )}
    </>
  )
}
