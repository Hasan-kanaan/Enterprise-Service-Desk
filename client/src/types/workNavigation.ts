export type WorkOrigin = 'intake' | 'mine' | 'team'
export function workOrigin(state: unknown): WorkOrigin | null {
  if (!state || typeof state !== 'object' || !('workOrigin' in state)) return null
  return state.workOrigin === 'intake' || state.workOrigin === 'mine' || state.workOrigin === 'team' ? state.workOrigin : null
}
export const workPaths = { intake: '/work/intake', mine: '/work/tickets', team: '/work/team' }
export const workLabels = { intake: 'Intake', mine: 'My Work', team: 'Led-team tickets' }
