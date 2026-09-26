import { useRef, useState } from 'react'

// Responses belong to the seed and revision that started them. Refreshes,
// navigation and successful mutations invalidate an in-flight older page.
export function useOlderPages<T>(
  seed: T | undefined,
  merge: (current: T, older: T) => T,
) {
  const [state, setState] = useState<{
    seed: T | undefined
    data?: T
    loading: boolean
    error?: unknown
  }>({ seed, data: seed, loading: false })
  const revision = useRef(0)
  const active =
    state.seed === seed ? state : { seed, data: seed, loading: false }
  const update = (change: (data: T) => T) => {
    revision.current++
    setState((previous) => ({
      seed,
      data: change(
        previous.seed === seed && previous.data ? previous.data : seed!,
      ),
      loading: false,
    }))
  }
  const load = async (fetch: () => Promise<T>) => {
    if (!active.data || active.loading) return
    const version = ++revision.current
    setState({ ...active, loading: true, error: undefined })
    try {
      const older = await fetch()
      if (version === revision.current)
        setState((previous) =>
          previous.seed === seed && previous.data
            ? { seed, data: merge(previous.data, older), loading: false }
            : previous,
        )
    } catch (error) {
      if (version === revision.current)
        setState((previous) =>
          previous.seed === seed
            ? { ...previous, loading: false, error }
            : previous,
        )
    }
  }
  return { ...active, load, update }
}

export function uniqueById<T extends { id: number }>(items: T[]) {
  return [...new Map(items.map((item) => [item.id, item])).values()]
}
