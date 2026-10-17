export function Pagination({ page, hasMore, busy = false, onPage, label = 'Pagination' }: {
  page: number
  hasMore: boolean
  busy?: boolean
  onPage: (page: number) => void
  label?: string
}) {
  if (page === 1 && !hasMore) return null
  return (
    <nav className="pagination" aria-label={label}>
      <button className="button secondary" disabled={busy || page === 1} onClick={() => onPage(page - 1)}>Previous</button>
      <span aria-live="polite" aria-atomic="true">Page {page}</span>
      <button className="button secondary" disabled={busy || !hasMore} onClick={() => onPage(page + 1)}>Next</button>
    </nav>
  )
}
