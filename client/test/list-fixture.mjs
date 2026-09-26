// Browser-only API fixture: filter before slicing, and expose the real envelope.
export function pageFixture(rows, url, dated = true) {
  const p = url.searchParams
  const search = (p.get('search') ?? '').trim().toLowerCase()
  let matches = rows.filter(row => {
    if (search && !(row.title ? row.title.toLowerCase().includes(search) || String(row.id) === search.replace(/^#/, '') : `${row.username} ${row.email ?? ''}`.toLowerCase().includes(search))) return false
    if (p.get('status') && row.status !== p.get('status')) return false
    if (p.get('role') && row.role !== p.get('role')) return false
    if (p.has('active') && (p.get('active') === 'true') === ['RESOLVED', 'CLOSED', 'CANCELLED'].includes(row.status)) return false
    return true
  }).sort((a, b) => (dated ? (b.createdAt ?? '').localeCompare(a.createdAt ?? '') : 0) || b.id - a.id)
  if (p.get('cursor')) {
    const [, id, createdAt] = JSON.parse(Buffer.from(p.get('cursor'), 'base64url').toString())
    matches = matches.filter(row => dated ? row.createdAt < createdAt || (row.createdAt === createdAt && row.id < id) : row.id < id)
  }
  const limit = Number(p.get('limit') || 25)
  const items = matches.slice(0, limit)
  const last = items.at(-1)
  const hasMore = matches.length > limit
  return { items, hasMore, nextCursor: hasMore ? Buffer.from(JSON.stringify(dated ? [1, last.id, last.createdAt] : [1, last.id])).toString('base64url') : null }
}
