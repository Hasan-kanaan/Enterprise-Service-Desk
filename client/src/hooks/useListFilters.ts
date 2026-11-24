import { useSearchParams } from 'react-router-dom'

export function useListFilters() {
  const [params, setParams] = useSearchParams()
  const get = (name: string) => params.get(name) ?? ''
  const getMany = (name: string) => params.getAll(name).flatMap(value => value.split(',')).filter(Boolean)
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
  const setMany = (name: string, values: string[]) =>
    setParams(previous => {
      const next = new URLSearchParams(previous)
      next.delete(name)
      values.forEach(value => next.append(name, value))
      return next
    })
  return { get, set, getMany, setMany }
}
