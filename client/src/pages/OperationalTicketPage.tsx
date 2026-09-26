import { TicketAttachments } from '@/components/Attachments'
import { useCallback, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useAppSelector } from '@/hooks/storeHooks'
import { useResource } from '@/hooks/useResource'
import {
  getTicket,
  getTicketOptions,
  updateTicket,
} from '@/services/tickets.service'
import {
  getSupportHistory,
  getTicketOperations,
  createSubtask,
} from '@/services/operations.service'
import { getApiStatus } from '@/services/api'
import { cycleLabel, formatDate, isTerminal } from '@/types/ticketPresentation'
import { TicketForm } from '@/components/TicketForm'
import { TicketHistory } from '@/components/TicketHistory'
import { TicketCommunication } from '@/components/TicketCommunication'
import { CycleSubtasks } from '@/components/CycleSubtasks'
import type { SupportCycle } from '@/types/operations'
import { SubtaskForm } from '@/components/SubtaskForm'
import {
  TicketOperationForm,
  type TicketAction,
} from '@/components/TicketOperationForm'
import { ErrorState, LoadingState, StatusBadge } from '@/components/TicketUI'
export function OperationalTicketPage() {
  const id = Number(useParams().ticketId)
  if (!Number.isSafeInteger(id) || id <= 0) return <p>Ticket not found.</p>
  return <OperationalTicket key={id} id={id} />
}
function OperationalTicket({ id }: { id: number }) {
  const user = useAppSelector((state) => state.auth.user)!
  const navigate = useNavigate()
  // Fetch one authorized snapshot per endpoint, then refresh all views after writes.
  const resource = useResource(
    useCallback(
      async (signal: AbortSignal) => {
        const [ticket, operations, history, options] = await Promise.all([
          getTicket(id, signal),
          getTicketOperations(id, signal),
          getSupportHistory(id, signal),
          getTicketOptions(signal),
        ])
        return { ticket, operations, history, options }
      },
      [id],
    ),
  )
  const [editing, setEditing] = useState(false)
  const [action, setAction] = useState<TicketAction | null>(null)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  const reload = () => {
    setEditing(false)
    setAction(null)
    setCreating(false)
    setError(undefined)
    resource.reload()
  }
  if (resource.loading)
    return <LoadingState label="Loading ticket workspace..." />
  if (resource.error || !resource.data)
    return (
      <div className="ticket-workspace">
        <Link className="back-link" to="/work/tickets">
          Back to work
        </Link>
        <ErrorState error={resource.error} onRetry={reload} />
      </div>
    )
  const { ticket, operations, history, options } = resource.data
  const p = operations.permissions
  const current = history.cycles.find((cycle) => cycle.isCurrent)
  const names = (ids: number[], items: { id: number; name: string }[]) =>
    ids
      .map(
        (id) =>
          items.find((item) => item.id === id)?.name ?? 'Name unavailable',
      )
      .join(', ') || 'None selected'
  return (
    <div className="ticket-workspace">
      <Link className="back-link" to="/work/tickets">
        Back to work
      </Link>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Ticket #{id}</p>
          <h1>{ticket.title}</h1>
          <div className="button-row">
            <StatusBadge status={ticket.status} />
            <span className="muted">
              {ticket.currentCycle
                ? cycleLabel(ticket.currentCycle)
                : 'History unavailable'}{' '}
              / Opened {formatDate(ticket.createdAt)}
            </span>
          </div>
        </div>
        <button className="button secondary" disabled={busy} onClick={reload}>
          Refresh ticket
        </button>
      </header>
      {p.take && (
        <p className="notice">
          Shared intake. Take responsibility before editing, routing, or
          creating subtasks.
        </p>
      )}
      {isTerminal(ticket.status) && (
        <p className="notice">
          This ticket is frozen.{' '}
          {p.reopen
            ? 'Use explicit reopening to start another work cycle.'
            : 'Operational changes are unavailable.'}
        </p>
      )}
      <div className="ticket-detail-grid">
        <div className="detail-main">
          <section className="panel">
            <div className="list-heading">
              <h2>Ticket details</h2>
              {p.edit && !editing && (
                <button
                  className="text-button"
                  onClick={() => setEditing(true)}
                >
                  Edit details
                </button>
              )}
            </div>
            {!!error && (
              <ErrorState
                error={error}
                onRetry={getApiStatus(error) === 409 ? reload : undefined}
              />
            )}
            {editing ? (
              <TicketForm
                initial={{
                  title: ticket.title,
                  description: ticket.description,
                  priority: ticket.priority,
                  categoryId: ticket.categoryId,
                  tagIds: ticket.tagIds,
                  allRegions: ticket.allRegions,
                  allDepartments: ticket.allDepartments,
                  affectedRegionIds: ticket.affectedRegionIds,
                  affectedDepartmentIds: ticket.affectedDepartmentIds,
                }}
                options={options}
                submitLabel="Save changes"
                locked={getApiStatus(error) === 409}
                onCancel={() => setEditing(false)}
                onSave={async (input) => {
                  setBusy(true)
                  setError(undefined)
                  try {
                    await updateTicket(id, input)
                    toast.success('Ticket updated')
                    reload()
                  } catch (failure) {
                    setError(failure)
                  } finally {
                    setBusy(false)
                  }
                }}
              />
            ) : (
              <div className="detail-body">
                <p className="description">{ticket.description}</p>
                <dl className="metadata-grid">
                  <div>
                    <dt>Category</dt>
                    <dd>
                      {options.categories.find(
                        (item) => item.id === ticket.categoryId,
                      )?.name ?? 'Name unavailable'}
                    </dd>
                  </div>
                  <div>
                    <dt>Priority</dt>
                    <dd>{ticket.priority}</dd>
                  </div>
                  <div>
                    <dt>Affected regions</dt>
                    <dd>
                      {ticket.allRegions
                        ? 'All regions'
                        : names(ticket.affectedRegionIds, options.regions)}
                    </dd>
                  </div>
                  <div>
                    <dt>Affected departments</dt>
                    <dd>
                      {ticket.allDepartments
                        ? 'All departments'
                        : names(
                            ticket.affectedDepartmentIds,
                            options.departments,
                          )}
                    </dd>
                  </div>
                  <div>
                    <dt>Tags</dt>
                    <dd>{names(ticket.tagIds, options.tags)}</dd>
                  </div>
                </dl>
              </div>
            )}
          </section>
          <section className="panel">
            <div className="list-heading">
              <h2>Current-cycle subtasks</h2>
              {p.createSubtask && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => setCreating(true)}
                >
                  Create subtask
                </button>
              )}
            </div>
            {history.subtasksAccess === 'NONE' ? (
              <p className="detail-body muted">
                Subtasks are not available with your current relationship to
                this ticket.
              </p>
            ) : current && (current.subtasks?.length || current.subtasksHasMore) ? (
              <CycleSubtasks ticketId={id} cycle={current} />
            ) : (
              <p className="detail-body muted">
                No authorized subtasks in this cycle.
              </p>
            )}
            {history.subtasksAccess === 'FILTERED' && (
              <p className="detail-body quiet-note">
                Only subtasks assigned to you or your currently led team are
                shown.
              </p>
            )}
          </section>
          <section className="panel">
            <div className="list-heading">
              <h2>Work history</h2>
            </div>
            <TicketAttachments ticketId={id} /><TicketCommunication ticketId={id} cycles={history.cycles} onChanged={reload} />
            <TicketHistory
              history={history}
              renderWork={(cycle) => <CycleSubtasks ticketId={id} cycle={cycle as SupportCycle} />}
            />
          </section>
        </div>
        <aside className="detail-aside">
          <section className="panel detail-body">
            <h2>Current responsibility</h2>
            <dl className="owner-list">
              <div>
                <dt>Responsible manager</dt>
                <dd>{ticket.ownership.manager?.username ?? 'Unassigned'}</dd>
              </div>
              <div>
                <dt>Primary team</dt>
                <dd>{ticket.ownership.team?.name ?? 'Unassigned'}</dd>
              </div>
              <div>
                <dt>Primary agent</dt>
                <dd>{ticket.ownership.agent?.username ?? 'Unassigned'}</dd>
              </div>
            </dl>
          </section>
          <section className="panel detail-body">
            <h2>Available actions</h2>
            <div className="ticket-actions">
              {p.take && (
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => setAction('take')}
                >
                  Take responsibility
                </button>
              )}
              {p.assignAgent && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setAction('assignment')}
                >
                  Change assignment
                </button>
              )}
              {p.transfer && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setAction('transfer')}
                >
                  Transfer responsibility
                </button>
              )}
              {p.statuses.length > 0 && (
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => setAction('status')}
                >
                  Change status
                </button>
              )}
              {p.reopen && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setAction('reopen')}
                >
                  Reopen ticket
                </button>
              )}
              {!p.take &&
                !p.assignAgent &&
                !p.transfer &&
                !p.statuses.length &&
                !p.reopen && (
                  <p className="muted">
                    No lifecycle or assignment actions are available.
                  </p>
                )}
            </div>
          </section>
        </aside>
      </div>
      {action && (
        <TicketOperationForm
          action={action}
          ticket={ticket}
          operations={operations}
          userId={user.id}
          onClose={() => setAction(null)}
          onReload={reload}
          onDone={(left) => {
            toast.success('Ticket updated')
            if (left) navigate('/work/tickets', { replace: true })
            else reload()
          }}
        />
      )}
      {creating && (
        <SubtaskForm
          ticketId={ticket.id}
          teams={operations.subtaskTeams}
          canAssignTeam={p.assignTeam}
          canAssignAgent
          initialTeam={p.assignTeam ? null : ticket.assignedTeamId}
          save={(input) => createSubtask(id, input)}
          onClose={() => setCreating(false)}
          onReload={reload}
          onDone={() => {
            toast.success('Subtask created')
            reload()
          }}
        />
      )}
    </div>
  )
}
