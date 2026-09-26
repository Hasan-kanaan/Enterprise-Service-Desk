import { useSearchParams } from 'react-router-dom'

export function useListFilters() {
  const [params, setParams] = useSearchParams()
  const get = (name: string) => params.get(name) ?? ''
  const set = (name: string, value: string) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        if (value) next.set(name, value)
        else next.delete(name)
        return next
      },
      { replace: name === 'search' },
    )
  return { get, set }
}
