import type { Reference } from './administration'

export type TicketRoutingStrategy =
  | 'EQUAL_ROUND_ROBIN'
  | 'LEAST_ACTIVE_TICKETS'

export type RoutingCategory = Reference & {
  specialties: Reference[]
}

export type TicketRoutingConfiguration = {
  enabled: boolean
  strategy: TicketRoutingStrategy
  categories: RoutingCategory[]
  specialties: Reference[]
}
