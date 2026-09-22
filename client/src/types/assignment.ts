import type { AssignmentTeam } from './operations'
export function compatibleAssignment(
  teams: AssignmentTeam[],
  teamId: number | null,
  agentId: number | null,
) {
  return (
    agentId === null ||
    !!teams
      .find((team) => team.id === teamId)
      ?.agents.some((agent) => agent.id === agentId)
  )
}
