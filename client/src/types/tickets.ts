export const ticketStatuses = [
  'NEW',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING_FOR_EMPLOYEE',
  'BLOCKED',
  'RESOLVED',
  'CLOSED',
  'CANCELLED',
] as const
export type TicketStatus = (typeof ticketStatuses)[number]
export const ticketPriorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const
export type TicketPriority = (typeof ticketPriorities)[number]
export type NamedOption = { id: number; name: string }
export type Person = {
  id: number
  username: string
  status?: 'ACTIVE' | 'INACTIVE'
}
export type Ownership = {
  manager: Person | null
  team: NamedOption | null
  agent: Person | null
}
export type TicketSummary = {
  id: number
  title: string
  description: string
  status: TicketStatus
  priority: TicketPriority
  requesterId: number
  categoryId: number
  allRegions: boolean
  allDepartments: boolean
  assignedManagerId: number | null
  assignedTeamId: number | null
  assignedAgentId: number | null
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
  closedAt: string | null
}
export type WorkCycle = {
  id: number
  sequenceNumber: number
  type: 'ORIGINAL' | 'REOPENED'
  isCurrent: boolean
  isEnded: boolean
  startedAt: string
  startedBy: Person | null
  startReason: string | null
  startDisposition: 'CONTINUE' | 'RETURN_TO_INTAKE' | null
  outcome: 'RESOLVED' | 'CLOSED' | 'CANCELLED' | null
  endedAt: string | null
  endedBy: Person | null
  closedAt: string | null
  closedBy: Person | null
  resolutionSummary: string | null
  ownership: Ownership & {
    basis: 'CURRENT' | 'END_OF_WORK' | 'RECORDED_AT_MIGRATION' | null
    capturedAt: string | null
  }
}
export type TicketDetail = TicketSummary & {
  tagIds: number[]
  affectedRegionIds: number[]
  affectedDepartmentIds: number[]
  ownership: Ownership
  currentCycle: WorkCycle | null
}
// The employee UI deliberately has no support-subtask or internal-note contract.
export type TicketHistory = {
  ticketId: number
  currentCycleId: number | null
  subtasksAccess: 'NONE' | 'FILTERED' | 'ALL'
  cycles: WorkCycle[]
}
export type TicketOptions = {
  categories: NamedOption[]
  tags: NamedOption[]
  regions: NamedOption[]
  departments: NamedOption[]
}
export type TicketInput = {
  title: string
  description: string
  categoryId: number
  priority: TicketPriority
  tagIds: number[]
  allRegions: boolean
  affectedRegionIds: number[]
  allDepartments: boolean
  affectedDepartmentIds: number[]
}
