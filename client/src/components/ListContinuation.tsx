import { ErrorState } from './TicketUI'

export function ListContinuation({
  resource,
}: {
  resource: {
    loading: boolean
    loadingMore: boolean
    error?: unknown
    hasMore: boolean
    items: { id: number }[]
    loadMore: () => void
    retry: () => void
  }
}) {
  if (resource.loading || (resource.error && !resource.items.length))
    return null
  return (
    <div className="detail-body">
      {!!resource.error && (
        <ErrorState error={resource.error} onRetry={resource.retry} />
      )}
      {resource.hasMore ? (
        <button
          className="button secondary"
          disabled={resource.loadingMore}
          onClick={resource.loadMore}
        >
          {resource.loadingMore ? 'Loading more...' : 'Load more'}
        </button>
      ) : (
        !resource.error &&
        resource.items.length > 0 && (
          <p className="quiet-note">End of results</p>
        )
      )}
    </div>
  )
}
