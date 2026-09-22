import { useState } from 'react'
import { AssignmentFields } from './AssignmentFields'
import { compatibleAssignment } from '@/types/assignment'
import { OperationDialog } from './OperationDialog'
import {
  subtaskStatuses,
  type AssignmentTeam,
  type Subtask,
  type SubtaskInput,
} from '@/types/operations'
export function SubtaskForm({
  initial,
  teams,
  canAssignTeam,
  canAssignAgent,
  initialTeam = null,
  save,
  onClose,
  onDone,
  onReload,
}: {
  initial?: Subtask
  teams: AssignmentTeam[]
  canAssignTeam: boolean
  canAssignAgent: boolean
  initialTeam?: number | null
  save: (input: SubtaskInput) => Promise<unknown>
  onClose: () => void
  onDone: () => void
  onReload: () => void
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [status, setStatus] = useState(initial?.status ?? 'TODO')
  const [team, setTeam] = useState(
    initial ? initial.assignedTeamId : initialTeam,
  )
  const [agent, setAgent] = useState(initial?.assignedAgentId ?? null)
  return (
    <OperationDialog
      title={initial ? 'Update subtask' : 'Create subtask'}
      onClose={onClose}
      onDone={onDone}
      onReload={onReload}
      valid={
        !!title.trim() &&
        (!canAssignAgent || compatibleAssignment(teams, team, agent))
      }
      submit={() =>
        save({
          title: title.trim(),
          description,
          ...(initial ? { status } : {}),
          ...(canAssignAgent
            ? { assignedTeamId: team, assignedAgentId: agent }
            : {}),
        })
      }
    >
      <label className="field">
        Title
        <input
          aria-label="Subtask title"
          required
          maxLength={200}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <label className="field">
        Description
        <textarea
          aria-label="Subtask description"
          rows={4}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      {initial && (
        <label className="field">
          Status
          <select
            aria-label="Subtask status"
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
          >
            {subtaskStatuses.map((value) => (
              <option key={value} value={value}>
                {value.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </label>
      )}
      {canAssignAgent && (
        <AssignmentFields
          teams={teams}
          teamId={team}
          agentId={agent}
          setTeam={setTeam}
          setAgent={setAgent}
          changeTeam={canAssignTeam}
          clearTeam={canAssignTeam}
        />
      )}
      {initial &&
        (status === 'CANCELLED' ||
          (initial.status === 'COMPLETED' && status !== 'COMPLETED')) && (
          <p className="notice">
            Confirm this status change. Leaving completed clears the current
            completion timestamp and actor.
          </p>
        )}
    </OperationDialog>
  )
}
