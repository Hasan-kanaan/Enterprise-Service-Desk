import type { AssignmentTeam } from '@/types/operations'
export function AssignmentFields({
  teams,
  teamId,
  agentId,
  setTeam,
  setAgent,
  changeTeam,
  clearTeam = false,
}: {
  teams: AssignmentTeam[]
  teamId: number | null
  agentId: number | null
  setTeam: (value: number | null) => void
  setAgent: (value: number | null) => void
  changeTeam: boolean
  clearTeam?: boolean
}) {
  const agents = teams.find((team) => team.id === teamId)?.agents ?? []
  const compatible =
    agentId === null || agents.some((agent) => agent.id === agentId)
  return (
    <>
      <label className="field">
        Team
        <select
          aria-label="Assignment team"
          value={teamId ?? ''}
          disabled={!changeTeam}
          onChange={(event) =>
            setTeam(event.target.value ? Number(event.target.value) : null)
          }
        >
          <option value="" disabled={!clearTeam}>
            {clearTeam ? 'Unassigned' : 'Select team'}
          </option>
          {teams.map((team) => (
            <option value={team.id} key={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Agent
        <select
          aria-label="Assignment agent"
          value={agentId ?? ''}
          onChange={(event) =>
            setAgent(event.target.value ? Number(event.target.value) : null)
          }
        >
          <option value="">Unassigned</option>
          {!compatible && (
            <option value={agentId!} disabled>
              Previous agent - choose an eligible agent or clear
            </option>
          )}
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.username}
            </option>
          ))}
        </select>
      </label>
      {!compatible && (
        <p className="field-error" role="alert">
          Explicitly clear or replace the previous agent before saving this team
          change.
        </p>
      )}
      <p className="quiet-note">
        Only active agents in the selected team are eligible. Unassigned is a
        valid choice.
      </p>
    </>
  )
}
