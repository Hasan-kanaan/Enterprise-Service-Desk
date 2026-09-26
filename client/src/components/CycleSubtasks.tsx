import api from '@/services/api'
import { useOlderPages, uniqueById } from '@/hooks/useOlderPages'
import type { SupportCycle, Subtask } from '@/types/operations'
import { SubtaskRows } from './SubtaskUI'
import { ErrorState } from './TicketUI'

type Page = { items: Subtask[]; hasMore: boolean; nextCursor: string | null }
export function CycleSubtasks({
  ticketId,
  cycle,
}: {
  ticketId: number
  cycle: SupportCycle
}) {
  const pages = useOlderPages(cycle, (current, older) => ({
    ...current,
    subtasks: uniqueById([
      ...(current.subtasks ?? []),
      ...(older.subtasks ?? []),
    ]),
    subtasksHasMore: older.subtasksHasMore,
    subtasksNextCursor: older.subtasksNextCursor,
  }))
  const data = pages.data ?? cycle
  const loadOlder = () =>
    pages.load(async () => {
      const page = (
        await api.get<Page>(
          `/tickets/${ticketId}/history/${cycle.id}/subtasks`,
          { params: { cursor: data.subtasksNextCursor } },
        )
      ).data
      return {
        ...cycle,
        subtasks: page.items,
        subtasksHasMore: page.hasMore,
        subtasksNextCursor: page.nextCursor,
      }
    })
  return (
    <>
      {!!data.subtasks?.length && (
        <SubtaskRows
          subtasks={data.subtasks}
          frozen={!cycle.isCurrent || cycle.isEnded}
        />
      )}
      {data.subtasksHasMore && (
        <>
          <p className="muted small">
            More authorized subtasks may be available in this cycle.
          </p>
          <button
            className="button secondary"
            disabled={pages.loading}
            onClick={() => void loadOlder()}
          >
            {pages.loading ? 'Loading subtasks...' : 'Load older subtasks'}
          </button>
        </>
      )}
      {!!pages.error && (
        <ErrorState error={pages.error} onRetry={() => void loadOlder()} />
      )}
    </>
  )
}
