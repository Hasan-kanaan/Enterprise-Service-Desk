export function submission(request) {
  if (!request.postData) return { body: {}, files: [] }
  if (!request.postData.startsWith('--')) return { body: JSON.parse(request.postData), files: [] }
  const payload = request.postData.match(/name="payload"\r\n\r\n([^\r]+)/)
  const files = [...request.postData.matchAll(/filename="([^"]+)"/g)].map((match, i) => ({ id: Date.now() + i, filename: match[1], byteSize: 12, contentType: 'text/plain', createdAt: new Date().toISOString(), deletedAt: null }))
  return { body: JSON.parse(payload[1]), files }
}
// Isolated browser contract fixture; real authorization/atomicity is tested in PostgreSQL.
export function communicationFixture() {
  const records = []
  const cycles = new Map()
  let failure = null
  return {
    records,
    fail(status) {
      failure = status
    },
    respond(request, ticket, cycle, user, canRead, support) {
      const match = new URL(request.url).pathname.match(
        /^\/tickets\/(\d+)\/(messages|internal-notes)(?:\/(\d+))?(?:\/attachments\/(\d+))?$/,
      )
      if (!match) return null
      if (!canRead) return [404, { message: 'Not found' }]
      cycles.set(cycle.id, { ...cycle, ticketId: ticket.id })
      const kind = match[2]
      if (kind === 'internal-notes' && !support)
        return [403, { message: 'Forbidden' }]
      const canPost =
        !['RESOLVED', 'CLOSED', 'CANCELLED'].includes(ticket.status) &&
        (support || user.role === 'EMPLOYEE')
      const project = (record) => ({
        ...record,
        content: record.deletedAt ? null : record.content,
        attachments: (record.attachments ?? []).map(file => record.deletedAt || file.deletedAt ? { ...file, filename: null, deletedAt: file.deletedAt ?? record.deletedAt } : file),
        canDelete: canPost && !record.deletedAt && record.author.id === user.id && record.createdInCycleId === cycle.id,
        canEdit:
          !record.deletedAt && canPost &&
          record.author.id === user.id &&
          record.createdInCycleId === cycle.id,
      })
      if (request.method === 'GET')
        return [
          200,
          {
            currentCycleId: cycle.id,
            cycles: [...cycles.values()].filter(c => c.ticketId === ticket.id).sort((a, b) => b.sequenceNumber - a.sequenceNumber).map(c => ({ ...c, isEnded: c.id !== cycle.id || ['RESOLVED', 'CLOSED', 'CANCELLED'].includes(ticket.status) })),
            canPost,
            canReadNotes: support,
            records: records
              .filter(
                (record) =>
                  record.ticketId === ticket.id && record.kind === kind,
              )
              .map(project),
          },
        ]
      if (failure) {
        const status = failure
        failure = null
        return [
          status,
          {
            message:
              status === 409
                ? 'Reload before retrying'
                : 'Temporary server failure',
          },
        ]
      }
      const { body, files } = submission(request)
      if (!canPost || body.expectedCycleId !== cycle.id)
        return [409, { message: 'Work cycle changed' }]
      if (request.method === 'DELETE') {
        const record = records.find(record => record.id === Number(match[3]))
        if (!record || record.author.id !== user.id) return [403, {}]
        if (record.createdInCycleId !== cycle.id) return [409, {}]
        if (match[4]) record.attachments.find(file => file.id === Number(match[4])).deletedAt = new Date().toISOString()
        else record.deletedAt = new Date().toISOString()
        return [200, project(record)]
      }
      if (request.method === 'PATCH') {
        const record = records.find((record) => record.id === Number(match[3]))
        if (record.author.id !== user.id) return [403, {}]
        if (record.createdInCycleId !== cycle.id) return [409, {}]
        record.content = body.content
        record.editedAt = new Date().toISOString()
        return [200, project(record)]
      }
      const duplicate = records.find(
        (record) => record.clientRequestId === body.clientRequestId,
      )
      if (duplicate) return [201, project(duplicate)]
      const record = {
        ...body,
        id: records.length + 1,
        ticketId: ticket.id,
        kind,
        createdInCycleId: cycle.id,
        author: { id: user.id, username: user.username },
        createdAt: new Date().toISOString(),
        editedAt: null,
        deletedAt: null,
        attachments: files,
      }
      records.push(record)
      if (
        kind === 'messages' &&
        user.role === 'EMPLOYEE' &&
        ticket.status === 'WAITING_FOR_EMPLOYEE'
      )
        ticket.status = 'IN_PROGRESS'
      return [201, project(record)]
    },
  }
}
