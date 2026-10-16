export interface AnalyticsGroup {
  name: string
  archived: boolean
  created: number
  open: number
  reopened: number
}

export interface AnalyticsResponse {
  range: { days: number; from: string; to: string; timezone: 'UTC' }
  current: {
    open: number
    awaitingTeam: number
    awaitingAgent: number
    statuses: { status: string; count: number }[]
  }
  period: {
    created: number
    resolved: number
    closed: number
    reopenedTickets: number
    reopenEvents: number
  }
  resolution: {
    eligibleCycles: number
    medianHours: number | null
    p90Hours: number | null
  }
  trend: { date: string; created: number; resolved: number; closed: number }[]
  aging: { bucket: string; count: number }[]
  groups: Record<
    'categories' | 'tags' | 'regions' | 'departments' | 'combinations',
    { rows: AnalyticsGroup[]; totalGroups: number }
  >
  teams: {
    rows: {
      name: string
      scope: string
      region: string | null
      open: number
      awaitingAgent: number
      eligibleAgents: number
      ticketsPerAgent: number | null
    }[]
    totalGroups: number
  }
  expertise: {
    rows: {
      name: string
      teams: number
      eligibleAgents: number
      open: number
      blocked: number
      awaitingAgent: number
    }[]
    totalGroups: number
  }
}
