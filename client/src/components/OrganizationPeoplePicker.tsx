import { useId, useState } from 'react'
import { useDebouncedValue, usePagedList } from '@/hooks/usePagedList'
import type { Person } from '@/types/tickets'
import { useResource } from '@/hooks/useResource'
import api from '@/services/api'
import type { Reference } from '@/types/administration'
import { ListContinuation } from './ListContinuation'
import { ErrorState } from './TicketUI'
import { MultiSelectFilter } from './MultiSelectFilter'

export function OrganizationPeoplePicker({ teamId, purpose, value, onChange }: {
  teamId: number
  purpose: 'member' | 'lead' | 'manager'
  value: number | number[] | null
  onChange: (id: number | number[]) => void
}) {
  const [text, setText] = useState('')
  const [specialtyIds, setSpecialtyIds] = useState<string[]>([])
  const [regionIds, setRegionIds] = useState<string[]>([])
  const [departmentIds, setDepartmentIds] = useState<string[]>([])
  const search = useDebouncedValue(text)
  const name = useId()
  const filters = useResource(loadPeopleFilters)
  const people = usePagedList<Person>(`/organization/teams/${teamId}/people`, { purpose, search, limit: 20, ...(purpose === 'member' && specialtyIds.length ? { specialtyIds: specialtyIds.join(',') } : {}), ...(purpose === 'member' && regionIds.length ? { regionIds: regionIds.join(',') } : {}), ...(purpose === 'member' && departmentIds.length ? { departmentIds: departmentIds.join(',') } : {}) })
  const selectedIds = purpose === 'member' ? (Array.isArray(value) ? value : []) : (typeof value === 'number' ? [value] : [])
  const label = purpose === 'member' ? 'Eligible Agents' : purpose === 'lead' ? 'Eligible Team members' : 'Eligible Managers'
  return <fieldset className="people-picker">
    <legend>{label}</legend>
    <label className="field">Search {label.toLowerCase()}
      <input type="search" maxLength={120} value={text} onChange={event => setText(event.target.value)} placeholder="Search by display name" />
    </label>
    {purpose === 'member' && filters.data && <div className="people-filters">
      <MultiSelectFilter label="Specialty" allLabel="All specialties" selected={specialtyIds} onChange={setSpecialtyIds} options={filters.data.specialties.map(item => ({ value: String(item.id), label: item.name }))} />
      <MultiSelectFilter label="Home region" allLabel="All regions" selected={regionIds} onChange={setRegionIds} options={filters.data.regions.map(item => ({ value: String(item.id), label: item.name }))} />
      <MultiSelectFilter label="Department" allLabel="All departments" selected={departmentIds} onChange={setDepartmentIds} options={filters.data.departments.map(item => ({ value: String(item.id), label: item.name }))} />
    </div>}
    {purpose === 'member' && <p className="quiet-note people-selection-count" role="status">Selected: {selectedIds.length}</p>}
    <div className="people-results">
      {people.loading && <p className="quiet-note" role="status">Loading candidates…</p>}
      {!!people.error && !people.items.length && <ErrorState error={people.error} onRetry={people.retry} />}
      {!people.loading && !people.error && !people.items.length && <p className="quiet-note" role="status">{search.trim() ? 'No eligible matches. Try another name.' : purpose === 'member' ? 'No eligible Agents are available to add.' : `No ${label.toLowerCase()} are available.`}</p>}
      {people.items.map(person => <label className="people-result" key={person.id}>
        <input type={purpose === 'member' ? 'checkbox' : 'radio'} name={name} value={person.id} checked={selectedIds.includes(person.id)} onChange={() => {
          if (purpose === 'member') onChange(selectedIds.includes(person.id) ? selectedIds.filter(id => id !== person.id) : [...selectedIds, person.id])
          else onChange(person.id)
        }} />
        <span>{person.displayName}<small className="people-specialties">{person.department?.name ? `Department: ${person.department.name}` : 'No department'}</small>{person.specialties?.length ? <small className="people-specialties">{person.specialties.map(link => link.specialty.name).join(', ')}</small> : <small className="people-specialties">No specialty</small>}</span>
      </label>)}
      {!!people.items.length && <ListContinuation resource={people} />}
    </div>
  </fieldset>
}

async function loadPeopleFilters(signal: AbortSignal) {
  const [specialties, regions, departments] = await Promise.all([
    api.get<Reference[]>('/organization/specialties', { signal }),
    api.get<Reference[]>('/organization/regions', { signal }),
    api.get<Reference[]>('/organization/departments', { signal }),
  ])
  return {
    specialties: specialties.data.filter(item => !item.archivedAt),
    regions: regions.data.filter(item => !item.archivedAt),
    departments: departments.data.filter(item => !item.archivedAt),
  }
}
