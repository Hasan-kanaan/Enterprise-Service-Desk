import api from './api'
import type { AnalyticsResponse } from '@/types/analytics'

export async function getAnalytics(days: string, signal: AbortSignal) {
  return (
    await api.get<AnalyticsResponse>('/analytics', { params: { days }, signal })
  ).data
}
