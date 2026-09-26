import { useEffect, useState } from 'react'
import api from '@/services/api'

export type Page<T> = {
  items: T[]
  nextCursor: string | null
  hasMore: boolean
}
export function useDebouncedValue(value: string) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), 300)
    return () => clearTimeout(timer)
  }, [value])
  return debounced
}

export function usePagedList<T extends { id: number }>(
  url: string | null,
  params: Record<string, unknown> = {},
) {
  const key = JSON.stringify([url, params])
  const [request, setRequest] = useState({
    key,
    cursor: null as string | null,
    attempt: 0,
  })
  // Reset the request identity too: returning via browser history must not revive
  // a cursor from an earlier visit to the same filters.
  if (request.key !== key) {
    setRequest({ key, cursor: null, attempt: request.attempt + 1 })
  }
  const cursor = request.key === key ? request.cursor : null
  const [state, setState] = useState<{
    key: string
    cursor: string | null
    attempt: number
    items: T[]
    page?: Page<T>
    error?: unknown
  }>({ key: '', cursor: null, attempt: -1, items: [] })
  const loading =
    state.key !== key ||
    state.cursor !== cursor ||
    state.attempt !== request.attempt
  useEffect(() => {
    const controller = new AbortController()
    const [path, filters] = JSON.parse(key) as [
      string | null,
      Record<string, unknown>,
    ]
    const load = path
      ? api
          .get<Page<T>>(path, {
            params: { ...filters, cursor: cursor ?? undefined },
            signal: controller.signal,
          })
          .then((r) => r.data)
      : Promise.resolve({
          items: [],
          nextCursor: null,
          hasMore: false,
        } as Page<T>)
    load
      .then((page) => {
        if (controller.signal.aborted) return
        setState((previous) => {
          const items = cursor && previous.key === key ? previous.items : []
          const ids = new Set(items.map((item) => item.id))
          return {
            key,
            cursor,
            attempt: request.attempt,
            page,
            items: [
              ...items,
              ...page.items.filter((item) => !ids.has(item.id)),
            ],
          }
        })
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState((previous) => ({
            key,
            cursor,
            attempt: request.attempt,
            error,
            items: cursor && previous.key === key ? previous.items : [],
            page: cursor && previous.key === key ? previous.page : undefined,
          }))
      })
    return () => controller.abort()
  }, [key, cursor, request.attempt])
  return {
    items: state.key === key ? state.items : [],
    loading: loading && !cursor,
    loadingMore: loading && !!cursor,
    error: !loading && state.key === key ? state.error : undefined,
    hasMore: state.key === key && !!state.page?.hasMore,
    loadMore: () => {
      if (!loading && state.page?.nextCursor)
        setRequest({
          key,
          cursor: state.page.nextCursor,
          attempt: request.attempt + 1,
        })
    },
    reload: () =>
      setRequest({ key, cursor: null, attempt: request.attempt + 1 }),
    retry: () => setRequest({ key, cursor, attempt: request.attempt + 1 }),
  }
}
