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
        /^\/tickets\/(\d+)\/(messages|internal-notes)(?:\/(\d+))?$/,
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
        canEdit:
          canPost &&
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
      const body = JSON.parse(request.postData)
      if (!canPost || body.expectedCycleId !== cycle.id)
        return [409, { message: 'Work cycle changed' }]
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
