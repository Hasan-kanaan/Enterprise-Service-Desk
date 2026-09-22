import type { TicketStatus, WorkCycle } from './tickets'
export const statusLabels: Record<TicketStatus, string> = {
  NEW: 'New',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In progress',
  WAITING_FOR_EMPLOYEE: 'Waiting for you',
  BLOCKED: 'Blocked',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
}
export const isTerminal = (status: TicketStatus) =>
  ['RESOLVED', 'CLOSED', 'CANCELLED'].includes(status)
export const canCancel = (status: TicketStatus) =>
  status === 'NEW' || status === 'ASSIGNED'
export const canReopen = (status: TicketStatus) =>
  status === 'RESOLVED' || status === 'CLOSED'
export const cycleLabel = (
  cycle: Pick<WorkCycle, 'sequenceNumber' | 'type'>,
) =>
  cycle.type === 'ORIGINAL'
    ? 'Original investigation'
    : `Reopening #${cycle.sequenceNumber - 1}`
export function formatDate(value: string | null, time = false) {
  if (!value) return 'Not recorded'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    ...(time ? { timeStyle: 'short' as const } : {}),
  }).format(new Date(value))
}
