import type { ReactNode } from 'react'
import type { WorkCycle } from '@/types/tickets'
import { cycleLabel, formatDate } from '@/types/ticketPresentation'
import { StatusBadge } from '@/components/TicketUI'

export function TicketHistory({
  cycles,
  renderWork,
}: {
  cycles: WorkCycle[]
  renderWork?: (cycle: WorkCycle) => ReactNode
}) {
  return (
    <ol className="cycle-list">
      {cycles.map((cycle) => (
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
            {cycle.outcome === 'CLOSED' && (
              <p className="muted small">
                Closed {formatDate(cycle.closedAt, true)}
                {cycle.closedBy ? ` by ${cycle.closedBy.username}` : ''}
              </p>
            )}
            {renderWork?.(cycle)}
            {cycle.ownership.basis === 'RECORDED_AT_MIGRATION' && (
              <p className="quiet-note">
                Ownership was recorded when this history was introduced. Earlier
                assignment details are not available.
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}
