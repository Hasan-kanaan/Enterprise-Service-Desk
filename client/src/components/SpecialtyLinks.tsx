import { useCallback, useState } from 'react'
import api from '@/services/api'
import { useResource } from '@/hooks/useResource'
import { AdminDialog } from './AdminDialog'
import { ErrorState, LoadingState } from './TicketUI'
import type { Reference } from '@/types/administration'
export function SpecialtyLinks({
  kind,
  id,
  canAdd,
  existing,
  choices,
  onReload,
}: {
  kind: 'agents' | 'teams'
  id: number
  canAdd: boolean
  existing: Reference[]
  choices: Reference[]
  onReload: () => void
}) {
  const [action, setAction] = useState<
    { remove: Reference } | { add: true } | null
  >(null)
  const [selected, setSelected] = useState('')
  const reload = () => {
    setAction(null)
    setSelected('')
    onReload()
  }
  return (
    <section className="panel detail-body">
      <div className="list-heading">
        <h2>Specialties</h2>
        <button
          className="button secondary"
          disabled={!canAdd}
          onClick={() => {
            setSelected('')
            setAction({ add: true })
          }}
        >
          Add specialty
        </button>
      </div>
      <p className="quiet-note">
        Specialties do not grant ticket authority or change team membership.
      </p>
      {existing.length ? (
        existing.map((item) => (
          <div className="admin-row" key={item.id}>
            <span>
              {item.name}
              {item.archivedAt ? ' (ARCHIVED)' : ''}
            </span>
            <button
              className="button secondary"
              onClick={() => setAction({ remove: item })}
            >
              Remove specialty
            </button>
          </div>
        ))
      ) : (
        <p>No specialties linked.</p>
      )}
      {action && (
        <AdminDialog
          title={
            'remove' in action
              ? `Remove ${action.remove.name}`
              : 'Add specialty'
          }
          valid={'remove' in action || !!selected}
          onClose={() => setAction(null)}
          onReload={reload}
          onDone={reload}
          submit={() =>
            'remove' in action
              ? api.delete(
                  `/organization/${kind}/${id}/specialties/${action.remove.id}`,
                )
              : api.post(`/organization/${kind}/${id}/specialties/${selected}`)
          }
        >
          {'remove' in action ? (
            <p>
              Confirm removal of this specialty link. Existing work and
              membership remain unchanged.
            </p>
          ) : (
            <label className="field">
              Specialty
              <select
                aria-label="Specialty"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="">Choose specialty</option>
                {choices
                  .filter(
                    (item) =>
                      !item.archivedAt &&
                      !existing.some((link) => link.id === item.id),
                  )
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
        </AdminDialog>
      )}
    </section>
  )
}
export function AgentSpecialties({
  id,
  canAdd,
}: {
  id: number
  canAdd: boolean
}) {
  const resource = useResource(
    useCallback(
      async (signal: AbortSignal) => {
        const [existing, choices] = await Promise.all([
          api.get<Reference[]>(`/organization/agents/${id}/specialties`, {
            signal,
          }),
          api.get<Reference[]>('/organization/specialties', { signal }),
        ])
        return { existing: existing.data, choices: choices.data }
      },
      [id],
    ),
  )
  if (resource.loading) return <LoadingState label="Loading specialties..." />
  if (resource.error || !resource.data)
    return <ErrorState error={resource.error} onRetry={resource.reload} />
  return (
    <SpecialtyLinks
      kind="agents"
      id={id}
      canAdd={canAdd}
      {...resource.data}
      onReload={resource.reload}
    />
  )
}
