import { PeopleLookup } from './PeopleLookup'
import type { AssignmentTeam } from '@/types/operations'
export function AssignmentFields({
  lookupUrl,
  compatible,
  teams,
  teamId,
  agentId,
  setTeam,
  setAgent,
  changeTeam,
  clearTeam = false,
}: {
  lookupUrl: string
  compatible: boolean
  teams: AssignmentTeam[]
  teamId: number | null
  agentId: number | null
  setTeam: (value: number | null) => void
  setAgent: (value: number | null) => void
  changeTeam: boolean
  clearTeam?: boolean
}) {
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
      <PeopleLookup
        key={teamId ?? 'none'}
        label="Assignment agent"
        value={agentId}
        onChange={setAgent}
        compatible={compatible}
        url={teamId === null ? null : `${lookupUrl}&teamId=${teamId}`}
      />
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
