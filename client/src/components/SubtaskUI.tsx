import { Link } from 'react-router-dom'
import { formatDate } from '@/types/ticketPresentation'
import type { Subtask } from '@/types/operations'
export function SubtaskRows({
  subtasks,
  frozen = false,
}: {
  subtasks: Subtask[]
  frozen?: boolean
}) {
  return (
    <div className="ticket-rows">
      {subtasks.map((task) => (
        <Link
          className="ticket-row"
          key={task.id}
          to={`/work/subtasks/${task.id}`}
        >
          <div className="ticket-row-main">
            <span className="ticket-number">#{task.id}</span>
            <div>
              <h3>{task.title}</h3>
              <p>
                {task.status.replaceAll('_', ' ')}
                {frozen ? ' / Frozen history' : ''}
              </p>
              <p>
                Team:{' '}
                {task.assignedTeam?.name ??
                  (task.assignedTeamId === null
                    ? 'Unassigned'
                    : `#${task.assignedTeamId}`)}{' '}
                / Agent:{' '}
                {task.assignedAgent?.username ??
                  (task.assignedAgentId === null
                    ? 'Unassigned'
                    : `#${task.assignedAgentId}`)}
              </p>
              {task.status === 'COMPLETED' && (
                <p>
                  Completed {formatDate(task.completedAt, true)} by{' '}
                  {task.completedBy?.username ??
                    (task.completedById === null
                      ? 'Not recorded'
                      : `#${task.completedById}`)}
                </p>
              )}
            </div>
          </div>
          <span className="text-button">View subtask</span>
        </Link>
      ))}
    </div>
  )
}
