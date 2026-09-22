import { useCallback, useEffect, useState } from 'react'

// Keep loaders stable (module functions or useCallback). An aborted/obsolete request
// cannot replace data after navigation or a newer reload.
export function useResource<T>(loader: (signal: AbortSignal) => Promise<T>) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<{
    loader: typeof loader
    attempt: number
    data?: T
    error?: unknown
    loading: boolean
  }>({ loader, attempt, loading: true })
  useEffect(() => {
    const controller = new AbortController()
    loader(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted)
          setState({ loader, attempt, data, loading: false })
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({ loader, attempt, error, loading: false })
      })
    return () => controller.abort()
  }, [loader, attempt])
  const reload = useCallback(() => setAttempt((value) => value + 1), [])
  return {
    ...(state.loader === loader && state.attempt === attempt
      ? state
      : { loading: true, data: undefined, error: undefined }),
    reload,
  }
}
