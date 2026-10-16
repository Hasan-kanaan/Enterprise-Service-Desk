import { toast } from 'sonner'
import { useCallback, useId, useState } from 'react'
import api from '@/services/api'
import { useResource } from '@/hooks/useResource'
import { AdminDialog } from './AdminDialog'
import { ErrorState, LoadingState } from './TicketUI'
import type { Account, Reference } from '@/types/administration'
export function SpecialtyLinks({
  kind,
  id,
  canAdd,
  unavailableReason,
  existing,
  choices,
  onReload,
}: {
  kind: 'agents' | 'teams'
  id: number
  canAdd: boolean
  unavailableReason?: string
  existing: Reference[]
  choices: Reference[]
  onReload: () => void
}) {
  const [action, setAction] = useState<
    { remove: Reference } | { add: true } | null
  >(null)
  const [selected, setSelected] = useState('')
  const explanationId = useId()
  const available = choices.filter(item => !item.archivedAt && !existing.some(link => link.id === item.id))
  const reason = !canAdd
    ? unavailableReason ?? 'Reactivate this Team before adding specialties.'
    : !available.length ? 'No active unlinked specialties are available.' : ''
  const reload = () => {
    setAction(null)
    setSelected('')
    onReload()
  }
  return (
    <section className="panel detail-body specialty-links">
      <div className="section-heading">
        <h2>{kind === 'teams' ? 'Team specialties' : 'Specialties'}</h2>
        <button
          className="button secondary"
          disabled={!!reason}
          aria-describedby={reason ? explanationId : undefined}
          onClick={() => {
            setSelected('')
            setAction({ add: true })
          }}
        >
          Add specialty
        </button>
      </div>
      <p className="quiet-note">
        {kind === 'teams' && 'Team specialty coverage is separate from individual Agent specialties. '}
        Specialties do not grant ticket authority or change team membership.
      </p>
      {reason && <p className="quiet-note" id={explanationId}>{reason}</p>}
      {kind === 'agents' && !canAdd && !!existing.length && <p className="quiet-note">
        Retained specialties are shown below and may be removed. They do not
        represent active Agent responsibilities.
      </p>}
      {existing.length ? (
        existing.map((item) => (
          <div className="specialty-row" key={item.id}>
            <span>
              {item.name}
              {item.archivedAt ? ' (ARCHIVED)' : ''}
              {((kind === 'agents' && !canAdd) || item.archivedAt) && <span className="specialty-retained">Retained link</span>}
            </span>
            <button
              className="text-button"
              aria-label={`Remove specialty ${item.name}`}
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
          onDone={() => { toast.success('remove' in action ? 'Specialty removed' : 'Specialty added'); reload() }}
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
                {available.map((item) => (
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
  account,
}: {
  account: Account
}) {
  const { id } = account
  const unavailableReason = account.role !== 'AGENT'
    ? 'New specialties can only be added to active verified Agents.'
    : account.status !== 'ACTIVE'
      ? `Reactivate this Agent before adding specialties.${!account.activatedAt ? ' The account must also complete activation.' : ''}`
      : !account.activatedAt ? "Activate this Agent's account before adding specialties." : ''
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
  if (resource.loading && !resource.data) return <LoadingState label="Loading specialties..." />
  if (resource.error || !resource.data)
    return <ErrorState error={resource.error} onRetry={resource.reload} />
  return (
    <SpecialtyLinks
      kind="agents"
      id={id}
      canAdd={!unavailableReason}
      unavailableReason={unavailableReason}
      {...resource.data}
      onReload={resource.reload}
    />
  )
}
