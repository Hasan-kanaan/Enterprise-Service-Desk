import { useState } from 'react'
import type { TicketDetail, TicketStatus } from '@/types/tickets'
import type { TicketOperations } from '@/types/operations'
import { OperationDialog } from './OperationDialog'
import { AssignmentFields } from './AssignmentFields'
import { compatibleAssignment } from '@/types/assignment'
import {
  assignManager,
  assignTicket,
  transitionTicket,
} from '@/services/operations.service'
import { reopenTicket } from '@/services/tickets.service'
import { statusLabels } from '@/types/ticketPresentation'
export type TicketAction =
  'take' | 'transfer' | 'assignment' | 'status' | 'reopen'
export function TicketOperationForm({
  action,
  ticket,
  operations,
  userId,
  onClose,
  onDone,
  onReload,
}: {
  action: TicketAction
  ticket: TicketDetail
  operations: TicketOperations
  userId: number
  onClose: () => void
  onDone: (leftTicket: boolean) => void
  onReload: () => void
}) {
  const [team, setTeam] = useState(
    operations.teams.some((choice) => choice.id === ticket.assignedTeamId)
      ? ticket.assignedTeamId
      : null,
  )
  const [agent, setAgent] = useState(ticket.assignedAgentId)
  const [manager, setManager] = useState<number | null>(null)
  const [status, setStatus] = useState<TicketStatus | ''>('')
  const [reason, setReason] = useState('')
  const [summary, setSummary] = useState('')
  const titles = {
    take: 'Take responsibility',
    transfer: 'Transfer responsibility',
    assignment: 'Change assignment',
    status: 'Change ticket status',
    reopen: 'Reopen ticket',
  }
  return (
    <OperationDialog
      title={titles[action]}
      reopen={action === 'reopen'}
      onClose={onClose}
      onReload={onReload}
      onDone={() => onDone(action === 'transfer' && manager !== userId)}
      valid={
        action === 'assignment'
          ? team !== null && compatibleAssignment(operations.teams, team, agent)
          : action === 'transfer'
            ? manager !== null
            : action === 'status'
              ? status !== ''
              : action === 'reopen'
                ? !!reason.trim()
                : true
      }
      submit={async (intake) => {
        if (action === 'take') return assignManager(ticket.id, userId)
        if (action === 'transfer') return assignManager(ticket.id, manager!)
        if (action === 'assignment')
          return assignTicket(ticket.id, team!, agent)
        if (action === 'status')
          return transitionTicket(
            ticket.id,
            status as TicketStatus,
            status === 'RESOLVED' ? summary.trim() : undefined,
          )
        return reopenTicket(ticket.id, reason.trim(), intake)
      }}
    >
      {action === 'take' && (
        <p className="muted">
          You will become the responsible manager. The ticket stays NEW until a
          primary team is assigned.
        </p>
      )}
      {action === 'transfer' && (
        <>
          <p className="notice">
            The selected manager will take responsibility. This ticket will
            leave your workspace; its team and agent remain unchanged.
          </p>
          <label className="field">
            New responsible manager
            <select
              aria-label="Responsible manager"
              required
              value={manager ?? ''}
              onChange={(event) =>
                setManager(Number(event.target.value) || null)
              }
            >
              <option value="">Choose manager</option>
              {operations.managers
                .filter((person) => person.id !== userId)
                .map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.username}
                  </option>
                ))}
            </select>
          </label>
        </>
      )}
      {action === 'assignment' && (
        <>
          {operations.permissions.assignTeam && (
            <p className="quiet-note">
              Choose a team you manage or a GLOBAL team. Transferring manager
              responsibility is a separate action.
            </p>
          )}
          <AssignmentFields
            teams={operations.teams}
            teamId={team}
            agentId={agent}
            setTeam={setTeam}
            setAgent={setAgent}
            changeTeam={operations.permissions.assignTeam}
          />
        </>
      )}
      {action === 'status' && (
        <>
          <label className="field">
            Next status
            <select
              aria-label="Next ticket status"
              required
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as TicketStatus)
              }
            >
              <option value="">Choose status</option>
              {operations.permissions.statuses.map((value) => (
                <option key={value} value={value}>
                  {statusLabels[value]}
                </option>
              ))}
            </select>
          </label>
          {status === 'RESOLVED' && (
            <>
              <p className="notice">
                Resolving ends this work cycle and freezes ticket details and
                all subtasks, including unfinished subtasks.
              </p>
              <label className="field">
                Resolution summary (visible to requester)
                <textarea
                  aria-label="Resolution summary"
                  rows={4}
                  maxLength={4000}
                  value={summary}
                  onChange={(event) => setSummary(event.target.value)}
                />
              </label>
            </>
          )}
          {status === 'CLOSED' && (
            <p className="notice">
              Confirm closure of the resolved ticket. Its work history will be
              preserved.
            </p>
          )}
        </>
      )}
      {action === 'reopen' && (
        <>
          <p className="muted">
            Start a new work cycle. Previous subtasks remain unchanged.
          </p>
          <label className="field">
            Reopening reason (visible to requester)
            <textarea
              aria-label="Reopening reason"
              required
              rows={4}
              maxLength={2000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
        </>
      )}
    </OperationDialog>
  )
}
