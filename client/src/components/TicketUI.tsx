import { SkeletonState, type SkeletonVariant } from './Skeleton'
import { AlertCircle, ArrowUpRight, Inbox } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { WorkOrigin } from '@/types/workNavigation'
import { getApiStatus, getApiErrorMessage } from '@/services/api'
import type { TicketStatus, TicketSummary, NamedOption } from '@/types/tickets'
import { formatDate, statusLabels } from '@/types/ticketPresentation'

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={`status-badge status-${status.toLowerCase()}`}>
      <span aria-hidden="true" />
      {statusLabels[status]}
    </span>
  )
}
// Compatibility entry point; callers select the shape appropriate to their content.
export function LoadingState({ label = 'Loading tickets...', variant = 'list' }: { label?: string; variant?: SkeletonVariant }) {
  return <SkeletonState label={label} variant={variant} />
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
          ? `This ${resourceName} changed. Reload the latest information before trying again.`
          : getApiErrorMessage(error, message)
  return (
    <div className="error-state" role="alert">
      <AlertCircle size={20} />
      <div>
        <p>{text}</p>
        {onRetry && (
          <button className="text-button" onClick={onRetry}>
            {status === 409 ? `Reload ${resourceName}` : 'Try again'}
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
  categories,
  origin,
}: {
  tickets: TicketSummary[]
  basePath?: string
  categories?: NamedOption[]
  origin?: WorkOrigin
}) {
  return (
    <div className="ticket-rows">
      {tickets.map((ticket) => (
        <Link
          key={ticket.id}
          to={`${basePath}/${ticket.id}`}
          state={origin ? { workOrigin: origin } : undefined}
          className="ticket-row"
        >
          <div className="ticket-row-main">
            <span className="ticket-number">#{ticket.id}</span>
            <div>
              <h2>{ticket.title}</h2>
              <p>
                {categories?.find((item) => item.id === ticket.categoryId)
                  ?.name ?? 'Category unavailable'}{' '}
                <span aria-hidden="true">&#183;</span> Updated{' '}
                {formatDate(ticket.updatedAt)}{' '}
                <span aria-hidden="true">&#183;</span>{' '}
                {ticket.priority.toLowerCase()} priority
                {basePath === '/work/tickets' && (
                  <>
                    {' '}
                    &#183;{' '}
                    {ticket.isCurrentCollaborator
                      ? 'Collaborating'
                      : ticket.assignedAgentId
                        ? 'Primary agent assigned'
                        : ticket.assignedManagerId
                          ? 'Manager owned'
                          : 'Unclaimed'}
                  </>
                )}
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
