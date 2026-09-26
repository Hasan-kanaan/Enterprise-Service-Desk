import api from './api'
import type {
  Workspace,
  TicketOperations,
  SubtaskOperations,
  Subtask,
  SubtaskInput,
  SupportHistory,
} from '@/types/operations'
import type { TicketSummary, TicketStatus } from '@/types/tickets'
export const getWorkspace = async (signal?: AbortSignal) =>
  (await api.get<Workspace>('/ticket-workspace', { signal })).data
export const getTicketOperations = async (id: number, signal?: AbortSignal) =>
  (
    await api.get<TicketOperations>(`/ticket-workspace/tickets/${id}`, {
      signal,
    })
  ).data
export const getSubtaskOperations = async (id: number, signal?: AbortSignal) =>
  (
    await api.get<SubtaskOperations>(`/ticket-workspace/subtasks/${id}`, {
      signal,
    })
  ).data
export const getSupportHistory = async (id: number, signal?: AbortSignal) =>
  (await api.get<SupportHistory>(`/tickets/${id}/history`, { signal })).data
export const assignManager = async (id: number, assignedManagerId: number) =>
  (
    await api.patch<TicketSummary>(`/tickets/${id}/manager`, {
      assignedManagerId,
    })
  ).data
export const assignTicket = async (
  id: number,
  teamId: number,
  agentId: number | null,
) =>
  (
    await api.patch<TicketSummary>(`/tickets/${id}/assignment`, {
      teamId,
      agentId,
    })
  ).data
export const transitionTicket = async (
  id: number,
  status: TicketStatus,
  resolutionSummary?: string,
) =>
  (
    await api.patch<TicketSummary>(`/tickets/${id}/status`, {
      status,
      ...(resolutionSummary ? { resolutionSummary } : {}),
    })
  ).data
export const createSubtask = async (id: number, input: SubtaskInput) =>
  (await api.post<Subtask>(`/tickets/${id}/subtasks`, input)).data
export const updateSubtask = async (id: number, input: SubtaskInput) =>
  (await api.patch<Subtask>(`/tickets/subtasks/${id}`, input)).data
