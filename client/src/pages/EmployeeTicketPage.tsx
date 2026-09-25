import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Pencil, RefreshCw, RotateCcw, X } from 'lucide-react'
import { toast } from 'sonner'
import { useResource } from '@/hooks/useResource'
import {
  cancelTicket,
  closeTicket,
  getTicket,
  getTicketHistory,
  getTicketOptions,
  reopenTicket,
  updateTicket,
} from '@/services/tickets.service'
import { getApiErrorMessage, getApiStatus } from '@/services/api'
import {
  canCancel,
  canReopen,
  cycleLabel,
  formatDate,
  isTerminal,
} from '@/types/ticketPresentation'
import { ErrorState, LoadingState, StatusBadge } from '@/components/TicketUI'
import { TicketForm } from '@/components/TicketForm'
import { TicketHistory } from '@/components/TicketHistory'
import { TicketCommunication } from '@/components/TicketCommunication'
import { Modal } from '@/components/Modal'
import type { NamedOption, TicketInput } from '@/types/tickets'

type Action = 'cancel' | 'close' | 'reopen'
export function EmployeeTicketPage() {
  const { ticketId } = useParams()
  const id = Number(ticketId)
  if (!Number.isSafeInteger(id) || id <= 0)
    return (
      <div className="panel empty-state">
        <h1>Ticket not found</h1>
        <Link className="button secondary" to="/tickets">
          My tickets
        </Link>
      </div>
    )
  return <TicketContent key={id} id={id} />
}
function TicketContent({ id }: { id: number }) {
  const ticketResource = useResource(
    useCallback((signal: AbortSignal) => getTicket(id, signal), [id]),
  )
  const history = useResource(
    useCallback((signal: AbortSignal) => getTicketHistory(id, signal), [id]),
  )
  const options = useResource(getTicketOptions)
  const [editing, setEditing] = useState(false)
  const [action, setAction] = useState<Action | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  const [actionError, setActionError] = useState<unknown>()
  const [returnToIntake, setReturnToIntake] = useState(false)
  const ticket = ticketResource.data
  const reload = () => {
    setEditing(false)
    setAction(null)
    setError(undefined)
    setActionError(undefined)
    ticketResource.reload()
    history.reload()
    options.reload()
  }
  const save = async (input: TicketInput) => {
    setError(undefined)
    setBusy(true)
    try {
      await updateTicket(id, input)
      toast.success('Ticket updated')
      reload()
    } catch (failure) {
      setError(failure)
    } finally {
      setBusy(false)
    }
  }
  const confirm = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy || (action === 'reopen' && !reason.trim())) return
    setBusy(true)
    setActionError(undefined)
    try {
      if (action === 'cancel') await cancelTicket(id)
      if (action === 'close') await closeTicket(id)
      const reopened =
        action === 'reopen'
          ? await reopenTicket(id, reason.trim(), returnToIntake)
          : null
      toast.success(
        reopened?.status === 'NEW'
          ? 'Ticket reopened and returned to the support queue'
          : action === 'reopen'
            ? 'Ticket reopened'
            : action === 'close'
              ? 'Ticket closed'
              : 'Ticket cancelled',
      )
      reload()
    } catch (failure) {
      setActionError(failure)
    } finally {
      setBusy(false)
    }
  }
  if (ticketResource.loading)
    return <LoadingState label="Loading your ticket..." />
  if (ticketResource.error || !ticket)
    return (
      <div className="ticket-workspace">
        <Link className="back-link" to="/tickets">
          <ArrowLeft size={16} />
          My tickets
        </Link>
        <div className="panel">
          <ErrorState
            error={ticketResource.error}
            onRetry={ticketResource.reload}
          />
        </div>
      </div>
    )
  const names = (ids: number[], items?: NamedOption[]) =>
    ids
      .map(
        (value) =>
          items?.find((item) => item.id === value)?.name ?? 'Name unavailable',
      )
      .join(', ') || 'None selected'
  const initial: TicketInput = {
    title: ticket.title,
    description: ticket.description,
    categoryId: ticket.categoryId,
    priority: ticket.priority,
    tagIds: ticket.tagIds,
    allRegions: ticket.allRegions,
    allDepartments: ticket.allDepartments,
    affectedRegionIds: ticket.affectedRegionIds,
    affectedDepartmentIds: ticket.affectedDepartmentIds,
  }
  const openAction = (next: Action) => {
    setActionError(undefined)
    setReason('')
    setReturnToIntake(false)
    setAction(next)
  }
  const conflict = getApiStatus(actionError) === 409
  const routingConflict =
    conflict && getApiErrorMessage(actionError, '').includes('returnToIntake')
  return (
    <div className="ticket-workspace">
      <Link className="back-link" to="/tickets">
        <ArrowLeft size={16} />
        My tickets
      </Link>
      <header className="page-heading ticket-detail-heading">
        <div>
          <div className="button-row">
            <p className="eyebrow">Request #{ticket.id}</p>
            <StatusBadge status={ticket.status} />
          </div>
          <h1>{ticket.title}</h1>
          <p className="muted">
            Opened {formatDate(ticket.createdAt, true)}{' '}
            <span aria-hidden="true">&#183;</span>{' '}
            {ticket.currentCycle
              ? cycleLabel(ticket.currentCycle)
              : 'History unavailable'}
          </p>
        </div>
        <button className="button secondary" disabled={busy} onClick={reload}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </header>
      {ticket.status === 'RESOLVED' && (
        <div className="notice success">
          <Check size={20} />
          <div>
            <strong>Your request has been resolved.</strong>
            <p>
              Review the result below. Close the ticket if it is fixed, or
              reopen it if you still need help.
            </p>
          </div>
        </div>
      )}
      {ticket.status === 'CANCELLED' && (
        <div className="notice">
          This ticket was cancelled. Its history is preserved, and it cannot be
          edited or reopened.
        </div>
      )}
      {ticket.status === 'CLOSED' && (
        <div className="notice">
          This request is closed. If the issue returns, you can reopen it with a
          reason.
        </div>
      )}
      {ticket.status === 'WAITING_FOR_EMPLOYEE' && (
        <div className="notice">
          Support is waiting for your input. Send a new message in the conversation
          below to resume work.
        </div>
      )}
      <div className="ticket-detail-grid">
        <div className="detail-main">
          <section className="panel">
            <div className="list-heading">
              <h2>{editing ? 'Edit request' : 'Request details'}</h2>
              {!isTerminal(ticket.status) && !editing && (
                <button
                  className="text-button"
                  disabled={!options.data}
                  onClick={() => setEditing(true)}
                >
                  <Pencil size={15} />
                  Edit details
                </button>
              )}
            </div>
            {!!error && (
              <ErrorState
                error={error}
                onRetry={getApiStatus(error) === 409 ? reload : undefined}
                message="We could not confirm the update. Refresh this ticket before trying again."
              />
            )}
            {editing && options.data ? (
              <TicketForm
                key={ticket.updatedAt}
                initial={initial}
                options={options.data}
                onSave={save}
                onCancel={() => {
                  setEditing(false)
                  setError(undefined)
                }}
                submitLabel="Save changes"
                locked={getApiStatus(error) === 409}
              />
            ) : (
              <div className="detail-body">
                <p className="description">{ticket.description}</p>
                <dl className="metadata-grid">
                  <div>
                    <dt>Category</dt>
                    <dd>
                      {options.data?.categories.find(
                        (item) => item.id === ticket.categoryId,
                      )?.name ?? 'Name unavailable'}
                    </dd>
                  </div>
                  <div>
                    <dt>Priority</dt>
                    <dd className="capitalize">
                      {ticket.priority.toLowerCase()}
                    </dd>
                  </div>
                  <div>
                    <dt>Affected regions</dt>
                    <dd>
                      {ticket.allRegions
                        ? 'All regions'
                        : names(
                            ticket.affectedRegionIds,
                            options.data?.regions,
                          )}
                    </dd>
                  </div>
                  <div>
                    <dt>Affected departments</dt>
                    <dd>
                      {ticket.allDepartments
                        ? 'All departments'
                        : names(
                            ticket.affectedDepartmentIds,
                            options.data?.departments,
                          )}
                    </dd>
                  </div>
                  {ticket.tagIds.length > 0 && (
                    <div>
                      <dt>Tags</dt>
                      <dd>{names(ticket.tagIds, options.data?.tags)}</dd>
                    </div>
                  )}
                </dl>
                {!!options.error && (
                  <ErrorState
                    error={options.error}
                    onRetry={options.reload}
                    message="Category and scope names could not be loaded."
                  />
                )}
              </div>
            )}
          </section>
          <section className="panel">
            <div className="list-heading">
              <div>
                <h2>Work history</h2>
                <p className="muted small">
                  Every attempt stays connected to your request.
                </p>
              </div>
            </div>
            {history.loading ? (
              <LoadingState label="Loading history..." />
            ) : history.error ? (
              <ErrorState error={history.error} onRetry={history.reload} />
            ) : (
              history.data && <><TicketCommunication ticketId={id} cycles={history.data.cycles} onChanged={reload} /><TicketHistory cycles={history.data.cycles} /></>
            )}
          </section>
        </div>
        <aside className="detail-aside">
          <section className="panel detail-body">
            <p className="eyebrow">Your support team</p>
            <dl className="owner-list">
              <div>
                <dt>Responsible manager</dt>
                <dd>
                  {ticket.ownership.manager?.username ?? 'Awaiting assignment'}
                </dd>
              </div>
              <div>
                <dt>Team</dt>
                <dd>{ticket.ownership.team?.name ?? 'Awaiting assignment'}</dd>
              </div>
              <div>
                <dt>Primary agent</dt>
                <dd>{ticket.ownership.agent?.username ?? 'Not assigned'}</dd>
              </div>
            </dl>
            <p className="quiet-note">
              {ticket.status === 'NEW' && !ticket.assignedManagerId
                ? 'Your request is in the shared support queue.'
                : 'The support team coordinates assignments for your request.'}
            </p>
          </section>
          <section className="panel detail-body">
            <h2>Next steps</h2>
            <div className="ticket-actions">
              {ticket.status === 'RESOLVED' && (
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => openAction('close')}
                >
                  <Check size={16} />
                  Close ticket
                </button>
              )}
              {canReopen(ticket.status) && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => openAction('reopen')}
                >
                  <RotateCcw size={16} />
                  Reopen ticket
                </button>
              )}
              {canCancel(ticket.status) && (
                <button
                  className="button danger-outline"
                  disabled={busy}
                  onClick={() => openAction('cancel')}
                >
                  <X size={16} />
                  Cancel ticket
                </button>
              )}
              {!canReopen(ticket.status) && !canCancel(ticket.status) && (
                <p className="muted small">
                  {ticket.status === 'CANCELLED'
                    ? 'Need help with a new issue?'
                    : 'Work is underway. You can review updates in the history below.'}
                </p>
              )}
              {ticket.status === 'CANCELLED' && (
                <Link className="button secondary" to="/tickets/new">
                  Create a new ticket
                </Link>
              )}
            </div>
          </section>
        </aside>
      </div>
      {action && (
        <Modal
          title={
            action === 'cancel'
              ? 'Cancel this ticket?'
              : action === 'close'
                ? 'Is the issue resolved?'
                : 'Reopen your ticket'
          }
          busy={busy}
          onClose={() => setAction(null)}
        >
          <form onSubmit={confirm}>
            <p className="muted">
              {action === 'cancel'
                ? 'Cancellation is permanent. Your request and its history will be kept, but this ticket cannot be reopened.'
                : action === 'close'
                  ? 'Confirm that the solution worked. You can reopen this ticket later if the issue returns.'
                  : 'Tell the support team what happened. Your previous work history will be preserved.'}
            </p>
            {action === 'reopen' && (
              <label className="field" htmlFor="reopen-reason">
                Reason for reopening
                <textarea
                  id="reopen-reason"
                  required
                  maxLength={2000}
                  rows={4}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  disabled={busy}
                  placeholder="What still is not working?"
                />
                <span className="muted small">
                  Visible to you and the support team.
                </span>
              </label>
            )}
            {!!actionError &&
              (routingConflict ? (
                <div className="notice" role="alert">
                  <p>
                    The previous assignment is no longer available. This ticket
                    can return to the support queue for a fresh assignment.
                  </p>
                  <label className="check-option">
                    <input
                      type="checkbox"
                      checked={returnToIntake}
                      onChange={(event) =>
                        setReturnToIntake(event.target.checked)
                      }
                    />
                    Return to the support queue
                  </label>
                </div>
              ) : (
                <ErrorState
                  error={actionError}
                  onRetry={conflict ? reload : undefined}
                  message="We could not confirm the change. Refresh this ticket before trying again."
                />
              ))}
            <div className="form-footer">
              <button
                className="button secondary"
                type="button"
                disabled={busy}
                onClick={() => setAction(null)}
              >
                Keep ticket
              </button>
              <button
                className={`button ${action === 'cancel' ? 'danger' : 'primary'}`}
                disabled={
                  busy ||
                  (action === 'reopen' && !reason.trim()) ||
                  (conflict && !(routingConflict && returnToIntake))
                }
                type="submit"
              >
                {busy
                  ? 'Saving...'
                  : action === 'cancel'
                    ? 'Confirm cancellation'
                    : action === 'close'
                      ? 'Confirm closure'
                      : 'Confirm reopening'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
