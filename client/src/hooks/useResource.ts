import { useCallback, useEffect, useRef, useState } from 'react'

// Keep loaders stable (module functions or useCallback). An aborted/obsolete request
// cannot replace data after navigation or a newer reload.
// refreshKey lets retained child sections revalidate when their parent reloads,
// without relying on unmounting the page (or losing conversation drafts).
export function useResource<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  refreshKey = 0,
) {
  const refreshVersion = useRef(0)
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<{
    loader: typeof loader
    attempt: number
    refreshKey: number
    data?: T
    error?: unknown
    loading: boolean
  }>({ loader, attempt, refreshKey, loading: true })
  useEffect(() => {
    const controller = new AbortController()
    loader(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted)
          setState({ loader, attempt, refreshKey, data, loading: false })
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({ loader, attempt, refreshKey, error, loading: false })
      })
    return () => controller.abort()
  }, [loader, attempt, refreshKey])
  const reload = useCallback(() => setAttempt((value) => value + 1), [])
  return {
    ...(state.loader === loader &&
    state.attempt === attempt &&
    state.refreshKey === refreshKey
      ? state
      : {
          loading: true,
          data: state.loader === loader ? state.data : undefined,
          error: undefined,
        }),
    reload,
    revision: attempt,
    refresh: async () => {
      const version = ++refreshVersion.current
      const controller = new AbortController()
      try {
        const data = await loader(controller.signal)
        setState((previous) =>
          version === refreshVersion.current &&
          previous.loader === loader &&
          previous.attempt === attempt &&
          previous.refreshKey === refreshKey
            ? { ...previous, data }
            : previous,
        )
      } catch {
        if (version === refreshVersion.current) reload()
      }
    },
  }
}
