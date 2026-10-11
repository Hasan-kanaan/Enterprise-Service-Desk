import { useCallback, useState } from 'react'
import api from '@/services/api'
import { useResource } from '@/hooks/useResource'
import { useDebouncedValue } from '@/hooks/usePagedList'
import { ErrorState } from './TicketUI'
import type { Person } from '@/types/tickets'

export function PeopleLookup({
  url,
  label,
  value,
  onChange,
  compatible = true,
  selectedName,
}: {
  url: string | null
  label: string
  value: number | null
  onChange: (id: number | null) => void
  compatible?: boolean
  selectedName?: string
}) {
  const [text, setText] = useState('')
  const [selected, setSelected] = useState<Person | null>(null)
  const search = useDebouncedValue(text)
  const resource = useResource(
    useCallback(
      async (signal: AbortSignal) => {
        if (!url || !search.trim()) return []
        return (await api.get<Person[]>(url, { params: { search }, signal }))
          .data
      },
      [url, search],
    ),
  )
  const choices = resource.data ?? []
  return (
    <div className="field">
      <label>
        {label} search
        <input
          aria-label={`${label} search`}
          maxLength={120}
          value={text}
          disabled={!url}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a display name"
        />
      </label>
      <label>
        {label}
        <select
          aria-label={label}
          value={value ?? ''}
          onChange={(e) => {
            const id = Number(e.target.value) || null
            setSelected(choices.find((person) => person.id === id) ?? null)
            onChange(id)
          }}
        >
          <option value="">Unassigned</option>
          {value !== null && !choices.some((person) => person.id === value) && (
            <option value={value} disabled>
              {compatible
                ? (selected?.id === value ? selected.displayName : selectedName) ?? 'Current selection'
                : 'Previous agent - choose an eligible agent or clear'}
            </option>
          )}
          {choices.map((person) => (
            <option key={person.id} value={person.id}>
              {person.displayName}
            </option>
          ))}
        </select>
      </label>
      {resource.loading ? (
        <p role="status">Searching...</p>
      ) : resource.error ? (
        <ErrorState error={resource.error} onRetry={resource.reload} />
      ) : (
        <p className="quiet-note">
          {!search.trim()
            ? 'Type to find eligible people.'
            : !choices.length
              ? 'No matching eligible people.'
              : 'Up to 20 matches. Refine your search if needed.'}
        </p>
      )}
    </div>
  )
}
