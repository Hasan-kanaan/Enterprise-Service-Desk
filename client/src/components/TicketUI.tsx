import { AlertCircle, ArrowUpRight, Inbox, LoaderCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { getApiStatus, getApiErrorMessage } from '@/services/api'
import type { TicketStatus, TicketSummary } from '@/types/tickets'
import { formatDate, statusLabels } from '@/types/ticketPresentation'

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={`status-badge status-${status.toLowerCase()}`}>
      <span aria-hidden="true" />
      {statusLabels[status]}
    </span>
  )
}
export function LoadingState({
  label = 'Loading tickets...',
}: {
  label?: string
}) {
  return (
    <div className="empty-state" role="status">
      <LoaderCircle className="spin" size={22} />
      <p>{label}</p>
    </div>
  )
}
export function ErrorState({
  error,
  onRetry,
  message = 'We could not load this information.',
  resourceName = 'ticket',
}: {
  error: unknown
  onRetry?: () => void
  message?: string
  resourceName?: string
}) {
  const status = getApiStatus(error)
  const text =
    status === 404
      ? `This ${resourceName} could not be found or is no longer available to you.`
      : status === 403
        ? 'You do not have access to this information.'
        : status === 409
          ? 'The ticket changed. Reload the latest information before trying again.'
          : getApiErrorMessage(error, message)
  return (
    <div className="error-state" role="alert">
      <AlertCircle size={20} />
      <div>
        <p>{text}</p>
        {onRetry && (
          <button className="text-button" onClick={onRetry}>
            {status === 409 ? 'Reload ticket' : 'Try again'}
          </button>
        )}
      </div>
    </div>
  )
}
export function EmptyState({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="empty-state">
      <Inbox size={28} />
      <h2>{title}</h2>
      {children}
    </div>
  )
}
export function TicketRows({
  tickets,
  basePath = '/tickets',
}: {
  tickets: TicketSummary[]
  basePath?: string
}) {
  return (
    <div className="ticket-rows">
      {tickets.map((ticket) => (
        <Link
          key={ticket.id}
          to={`${basePath}/${ticket.id}`}
          className="ticket-row"
        >
          <div className="ticket-row-main">
            <span className="ticket-number">#{ticket.id}</span>
            <div>
              <h2>{ticket.title}</h2>
              <p>
                Opened {formatDate(ticket.createdAt)}{' '}
                <span aria-hidden="true">&#183;</span>{' '}
                {ticket.priority.toLowerCase()} priority
              </p>
            </div>
          </div>
          <div className="ticket-row-end">
            <StatusBadge status={ticket.status} />
            <ArrowUpRight size={18} aria-hidden="true" />
          </div>
        </Link>
      ))}
    </div>
  )
}
