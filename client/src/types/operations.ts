import type { NamedOption, Person, TicketStatus, WorkCycle } from './tickets'
export type AssignmentTeam = NamedOption
export type Workspace = { ledTeams: NamedOption[] }
export type TicketOperations = {
  permissions: {
    edit: boolean
    take: boolean
    transfer: boolean
    assignTeam: boolean
    assignAgent: boolean
    createSubtask: boolean
    reopen: boolean
    statuses: TicketStatus[]
  }
  teams: AssignmentTeam[]
  subtaskTeams: AssignmentTeam[]
}
export const subtaskStatuses = [
  'TODO',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
] as const
export type SubtaskStatus = (typeof subtaskStatuses)[number]
export type Subtask = {
  id: number
  ticketId: number
  createdInCycleId: number
  title: string
  description: string
  status: SubtaskStatus
  assignedTeamId: number | null
  assignedAgentId: number | null
  completedById: number | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  assignedTeam?: NamedOption | null
  assignedAgent?: Person | null
  completedBy?: Person | null
}
export type SubtaskOperations = {
  parentVisible: boolean
  subtask: Subtask
  historical: boolean
  frozen: boolean
  permissions: { edit: boolean; assignTeam: boolean; assignAgent: boolean }
  teams: AssignmentTeam[]
}
export type SubtaskInput = {
  title: string
  description: string
  status?: SubtaskStatus
  assignedTeamId?: number | null
  assignedAgentId?: number | null
}
export type SupportCycle = WorkCycle & { subtasks?: Subtask[] }
export type SupportHistory = {
  ticketId: number
  currentCycleId: number | null
  subtasksAccess: 'NONE' | 'FILTERED' | 'ALL'
  cycles: SupportCycle[]
}
