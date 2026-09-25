import { postWithAttachments } from './attachments.service'
import api from '@/services/api'
import type {
  TicketDetail,
  TicketHistory,
  TicketInput,
  TicketOptions,
  TicketSummary,
} from '@/types/tickets'

export const listTickets = async (signal?: AbortSignal) =>
  (await api.get<TicketSummary[]>('/tickets', { signal })).data
export const getTicket = async (id: number, signal?: AbortSignal) =>
  (await api.get<TicketDetail>(`/tickets/${id}`, { signal })).data
export const getTicketHistory = async (id: number, signal?: AbortSignal) =>
  (await api.get<TicketHistory>(`/tickets/${id}/history`, { signal })).data
export const getTicketOptions = async (signal?: AbortSignal) =>
  (await api.get<TicketOptions>('/ticket-options', { signal })).data
export const createTicket = async (input: TicketInput, files: File[] = []) =>
  (await postWithAttachments<TicketSummary>('/tickets', input, files)).data
export const updateTicket = async (id: number, input: TicketInput) =>
  (await api.patch<TicketSummary>(`/tickets/${id}`, input)).data
export const cancelTicket = async (id: number) =>
  (await api.post<TicketSummary>(`/tickets/${id}/cancel`)).data
export const closeTicket = async (id: number) =>
  (
    await api.patch<TicketSummary>(`/tickets/${id}/status`, {
      status: 'CLOSED',
    })
  ).data
export const reopenTicket = async (
  id: number,
  reason: string,
  returnToIntake = false,
) =>
  (
    await api.post<TicketSummary>(`/tickets/${id}/reopen`, {
      reason,
      ...(returnToIntake ? { returnToIntake: true } : {}),
    })
  ).data
