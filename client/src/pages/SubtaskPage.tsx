import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useResource } from '@/hooks/useResource'
import {
  getSubtaskOperations,
  updateSubtask,
} from '@/services/operations.service'
import { ErrorState, LoadingState } from '@/components/TicketUI'
import { SubtaskForm } from '@/components/SubtaskForm'
import { formatDate } from '@/types/ticketPresentation'
export function SubtaskPage() {
  const id = Number(useParams().subtaskId)
  if (!Number.isSafeInteger(id) || id <= 0) return <p>Subtask not found.</p>
  return <SubtaskContent key={id} id={id} />
}
function SubtaskContent({ id }: { id: number }) {
  const resource = useResource(
    useCallback(
      (signal: AbortSignal) => getSubtaskOperations(id, signal),
      [id],
    ),
  )
  const [editing, setEditing] = useState(false)
  const reload = () => {
    setEditing(false)
    resource.reload()
  }
  if (resource.loading) return <LoadingState label="Loading subtask..." />
  if (resource.error || !resource.data)
    return (
      <ErrorState
        resourceName="subtask"
        error={resource.error}
        onRetry={reload}
      />
    )
  const {
    subtask: task,
    permissions,
    teams,
    historical,
    frozen,
  } = resource.data
  return (
    <div className="ticket-workspace">
      <Link className="back-link" to="/work/subtasks">
        Back to subtasks
      </Link>
      <header className="page-heading">
        <div>
          <p className="eyebrow">
            Subtask #{id} / Ticket #{task.ticketId}
          </p>
          <h1>{task.title}</h1>
          <p className="muted">{task.status.replaceAll('_', ' ')}</p>
        </div>
        <button className="button secondary" onClick={reload}>
          Refresh subtask
        </button>
      </header>
      {frozen && (
        <p className="notice">
          {historical
            ? 'Historical cycle: this subtask is permanently frozen.'
            : 'This ticket is terminal. Subtask changes are unavailable.'}
        </p>
      )}
      <section className="panel detail-body">
        <p className="description">{task.description}</p>
        <dl className="metadata-grid">
          <div>
            <dt>Team</dt>
            <dd>{task.assignedTeam?.name ?? 'Unassigned'}</dd>
          </div>
          <div>
            <dt>Agent</dt>
            <dd>{task.assignedAgent?.username ?? 'Unassigned'}</dd>
          </div>
          <div>
            <dt>Completed at</dt>
            <dd>{formatDate(task.completedAt, true)}</dd>
          </div>
          <div>
            <dt>Completed by</dt>
            <dd>{task.completedBy?.username ?? 'Not recorded'}</dd>
          </div>
        </dl>
      </section>
      {permissions.edit && (
        <button className="button primary" onClick={() => setEditing(true)}>
          Update subtask
        </button>
      )}
      <p className="quiet-note">
        This view contains only the authorized subtask. Parent-ticket content
        and history are not loaded.
      </p>
      {editing && (
        <SubtaskForm
          initial={task}
          teams={teams}
          canAssignTeam={permissions.assignTeam}
          canAssignAgent={permissions.assignAgent}
          save={(input) => updateSubtask(id, input)}
          onClose={() => setEditing(false)}
          onReload={reload}
          onDone={() => {
            toast.success('Subtask updated')
            reload()
          }}
        />
      )}
    </div>
  )
}
