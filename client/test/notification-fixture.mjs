// Notification history contains only identifiers/type/times, never ticket content.
export function notificationFixture() {
  const records = []
  let nextId = 1
  return {
    records,
    add(recipientUserId, type, ticketId, subtaskId = null) {
      const record = {
        id: nextId++,
        recipientUserId,
        type,
        ticketId,
        subtaskId,
        createdAt: new Date().toISOString(),
        readAt: null,
      }
      records.push(record)
      return record
    },
    respond(request, userId) {
      const path = new URL(request.url).pathname
      if (!path.startsWith('/notifications')) return null
      const own = records.filter((n) => n.recipientUserId === userId)
      if (request.method === 'GET') {
        if (path === '/notifications/unread-count')
          return [200, { count: own.filter((n) => !n.readAt).length }]
        return [
          200,
          own
            .slice()
            .reverse()
            .slice(0, 50)
            .map(({ recipientUserId: _recipient, ...n }) => n),
        ]
      }
      const id = Number(path.split('/')[2])
      if (path !== '/notifications/read-all' && !own.some((n) => n.id === id))
        return [404, { message: 'Notification not found' }]
      own
        .filter((n) => path === '/notifications/read-all' || n.id === id)
        .forEach((n) => {
          n.readAt ??= new Date().toISOString()
        })
      return [200, { success: true }]
    },
  }
}
