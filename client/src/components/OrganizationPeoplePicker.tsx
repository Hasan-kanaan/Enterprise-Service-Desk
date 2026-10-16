import { useId, useState } from 'react'
import { useDebouncedValue, usePagedList } from '@/hooks/usePagedList'
import type { Person } from '@/types/tickets'
import { ListContinuation } from './ListContinuation'
import { ErrorState } from './TicketUI'

export function OrganizationPeoplePicker({ teamId, purpose, value, onChange }: {
  teamId: number
  purpose: 'member' | 'lead' | 'manager'
  value: number | null
  onChange: (id: number) => void
}) {
  const [text, setText] = useState('')
  const [selected, setSelected] = useState<Person | null>(null)
  const search = useDebouncedValue(text)
  const name = useId()
  const people = usePagedList<Person>(`/organization/teams/${teamId}/people`, { purpose, search, limit: 20 })
  const label = purpose === 'member' ? 'Eligible Agents' : purpose === 'lead' ? 'Eligible Team members' : 'Eligible Managers'
  return <fieldset className="people-picker">
    <legend>{label}</legend>
    <label className="field">Search {label.toLowerCase()}
      <input type="search" maxLength={120} value={text} onChange={event => setText(event.target.value)} placeholder="Search by display name" />
    </label>
    {selected?.id === value && <p className="quiet-note" role="status">Selected: {selected.displayName}</p>}
    {people.loading && <p className="quiet-note" role="status">Loading candidates…</p>}
    {!!people.error && !people.items.length && <ErrorState error={people.error} onRetry={people.retry} />}
    {!people.loading && !people.error && !people.items.length && <p className="quiet-note" role="status">{search.trim() ? 'No eligible matches. Try another name.' : purpose === 'member' ? 'No eligible Agents are available to add.' : `No ${label.toLowerCase()} are available.`}</p>}
    <div className="people-results">
      {people.items.map(person => <label className="people-result" key={person.id}>
        <input type="radio" name={name} value={person.id} checked={person.id === value} onChange={() => { setSelected(person); onChange(person.id) }} />
        <span>{person.displayName}</span>
      </label>)}
    </div>
    {!!people.items.length && <ListContinuation resource={people} />}
  </fieldset>
}
