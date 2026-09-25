import api from './api'

export type Notification = {
  id: number
  type:
    | 'PRIMARY_AGENT_ASSIGNED'
    | 'SUBTASK_ASSIGNED'
    | 'REQUESTER_MESSAGE'
    | 'SUPPORT_MESSAGE'
    | 'WAITING_FOR_EMPLOYEE'
    | 'RESOLVED'
    | 'REOPENED'
    | 'MANAGER_TRANSFERRED'
  ticketId: number | null
  subtaskId: number | null
  createdAt: string
  readAt: string | null
}

export async function getNotifications(signal: AbortSignal) {
  const [list, count] = await Promise.all([
    api.get<Notification[]>('/notifications', { signal }),
    api.get<{ count: number }>('/notifications/unread-count', { signal }),
  ])
  return { records: list.data, unread: count.data.count }
}
export async function markNotificationRead(id: number) {
  await api.patch(`/notifications/${id}/read`)
}
export async function markAllNotificationsRead() {
  await api.patch('/notifications/read-all')
}

export function notificationText(record: Notification) {
  const ticket = `ticket #${record.ticketId}`
  switch (record.type) {
    case 'PRIMARY_AGENT_ASSIGNED':
      return `You were assigned ${ticket}.`
    case 'SUBTASK_ASSIGNED':
      return `You were assigned a subtask on ${ticket}.`
    case 'REQUESTER_MESSAGE':
      return `The requester replied on ${ticket}.`
    case 'SUPPORT_MESSAGE':
      return `Support replied on ${ticket}.`
    case 'WAITING_FOR_EMPLOYEE':
      return `Ticket #${record.ticketId} is waiting for your response.`
    case 'RESOLVED':
      return `Ticket #${record.ticketId} was resolved.`
    case 'REOPENED':
      return `Ticket #${record.ticketId} was reopened.`
    case 'MANAGER_TRANSFERRED':
      return `Responsibility for ${ticket} was transferred to you.`
    default:
      return 'Service desk update.'
  }
}
