import api from './api'
import type {
  TicketRoutingConfiguration,
  TicketRoutingStrategy,
} from '@/types/ticketRouting'

export const getTicketRoutingConfiguration = async (signal?: AbortSignal) =>
  (
    await api.get<TicketRoutingConfiguration>('/ticket-configuration/routing', {
      signal,
    })
  ).data

export const updateTicketRoutingConfiguration = async (change: {
  enabled: boolean
  strategy: TicketRoutingStrategy
}) =>
  (
    await api.patch<{ enabled: boolean; strategy: TicketRoutingStrategy }>(
      '/ticket-configuration/routing',
      change,
    )
  ).data

export const updateCategorySpecialties = async (
  categoryId: number,
  specialtyIds: number[],
) =>
  api.patch(`/ticket-configuration/routing/categories/${categoryId}/specialties`, {
    specialtyIds,
  })
