import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { ErrorState, LoadingState } from '@/components/TicketUI'
import { RefreshSurface } from '@/components/RefreshSurface'
import { useResource } from '@/hooks/useResource'
import {
  getTicketRoutingConfiguration,
  updateCategorySpecialties,
  updateTicketRoutingConfiguration,
} from '@/services/ticket-routing.service'
import { getApiErrorMessage } from '@/services/api'
import type {
  TicketRoutingConfiguration,
  TicketRoutingStrategy,
} from '@/types/ticketRouting'

const strategyDescriptions: Record<TicketRoutingStrategy, string> = {
  EQUAL_ROUND_ROBIN:
    'Give every eligible Manager an equal turn, rotating across ticket categories.',
  LEAST_ACTIVE_TICKETS:
    'Choose the eligible Manager with the fewest active tickets. Equal counts use the same fair rotation.',
}

type RoutingDraft = {
  base: TicketRoutingConfiguration
  enabled: boolean
  strategy: TicketRoutingStrategy
  mappings: Record<number, number[]>
}

function createDraft(base: TicketRoutingConfiguration): RoutingDraft {
  return {
    base,
    enabled: base.enabled,
    strategy: base.strategy,
    mappings: Object.fromEntries(
      base.categories.map((category) => [
        category.id,
        category.specialties
          .filter((specialty) => !specialty.archivedAt)
          .map((specialty) => specialty.id),
      ]),
    ),
  }
}

export function TicketRoutingPage() {
  const resource = useResource(getTicketRoutingConfiguration)
  const [storedDraft, setStoredDraft] = useState<RoutingDraft>()
  const [savingSettings, setSavingSettings] = useState(false)
  const [savingCategory, setSavingCategory] = useState<number | null>(null)
  const [settingsError, setSettingsError] = useState('')
  const [mappingErrors, setMappingErrors] = useState<Record<number, string>>({})

  if (resource.loading && !resource.data)
    return <LoadingState variant="page" label="Loading ticket routing..." />
  if (resource.error || !resource.data)
    return (
      <ErrorState
        error={resource.error}
        onRetry={resource.reload}
        resourceName="routing configuration"
      />
    )

  const data = resource.data
  const draft = storedDraft?.base === data ? storedDraft : createDraft(data)
  const updateDraft = (change: (current: RoutingDraft) => RoutingDraft) => {
    setStoredDraft((current) =>
      change(current?.base === data ? current : createDraft(data)),
    )
  }
  const settingsChanged =
    draft.enabled !== data.enabled || draft.strategy !== data.strategy
  const activeSpecialties = data.specialties.filter(
    (specialty) => !specialty.archivedAt,
  )

  const saveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (savingSettings || !settingsChanged) return
    if (
      draft.enabled &&
      !data.enabled &&
      !window.confirm(
        'Enable automatic routing for new tickets? Existing tickets will not be changed.',
      )
    )
      return
    setSavingSettings(true)
    setSettingsError('')
    try {
      await updateTicketRoutingConfiguration({
        enabled: draft.enabled,
        strategy: draft.strategy,
      })
      toast.success('Routing settings saved')
      resource.reload()
    } catch (error) {
      const message = getApiErrorMessage(
        error,
        'Routing settings could not be saved. Check your connection and try again.',
      )
      setSettingsError(message)
      toast.error(message)
    } finally {
      setSavingSettings(false)
    }
  }

  const toggleSpecialty = (categoryId: number, specialtyId: number) => {
    updateDraft((current) => {
      const selected = new Set(current.mappings[categoryId] ?? [])
      if (selected.has(specialtyId)) selected.delete(specialtyId)
      else selected.add(specialtyId)
      return {
        ...current,
        mappings: {
          ...current.mappings,
          [categoryId]: [...selected].sort((a, b) => a - b),
        },
      }
    })
  }

  const saveMappings = async (categoryId: number) => {
    if (savingCategory !== null) return
    setSavingCategory(categoryId)
    setMappingErrors((current) => ({ ...current, [categoryId]: '' }))
    try {
      await updateCategorySpecialties(
        categoryId,
        draft.mappings[categoryId] ?? [],
      )
      toast.success('Specialty mappings saved')
      resource.reload()
    } catch (error) {
      const message = getApiErrorMessage(
        error,
        'Specialty mappings could not be saved. Reload and try again.',
      )
      setMappingErrors((current) => ({ ...current, [categoryId]: message }))
      toast.error(message)
    } finally {
      setSavingCategory(null)
    }
  }

  return (
    <RefreshSurface busy={!!(resource.loading && resource.data)}>
      <div className="ticket-workspace ticket-routing-page">
        <header className="page-heading">
          <div>
            <h1>Ticket routing</h1>
            <p className="muted">
              Choose how new tickets reach a responsible Manager. Routing never
              assigns a Team or Agent or changes ticket status.
            </p>
          </div>
        </header>

        <section className="panel ticket-routing-settings">
          <div className="list-heading">
            <div>
              <h2>Automatic routing</h2>
              <p className="quiet-note">
                Tickets without an eligible Manager stay unassigned.
              </p>
            </div>
            <span
              className={`ticket-routing-state${draft.enabled ? ' is-enabled' : ''}`}
              role="status"
            >
              {draft.enabled ? 'On for new tickets' : 'Off'}
            </span>
          </div>
          <form onSubmit={saveSettings}>
            <fieldset
              className="ticket-routing-settings-fields"
              disabled={savingSettings}
            >
              <label className="check-option ticket-routing-toggle">
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(event) =>
                    updateDraft((current) => ({
                      ...current,
                      enabled: event.target.checked,
                    }))
                  }
                />
                Enable automatic routing
              </label>
              <fieldset className="ticket-routing-strategies">
                <legend>Routing strategy</legend>
                {(
                  [
                    'EQUAL_ROUND_ROBIN',
                    'LEAST_ACTIVE_TICKETS',
                  ] as const
                ).map((option) => (
                  <label
                    className="ticket-routing-strategy"
                    key={option}
                    data-selected={draft.strategy === option}
                  >
                    <input
                      type="radio"
                      name="routing-strategy"
                      value={option}
                      checked={draft.strategy === option}
                      onChange={() =>
                        updateDraft((current) => ({
                          ...current,
                          strategy: option,
                        }))
                      }
                    />
                    <span>
                      <strong>
                        {option === 'EQUAL_ROUND_ROBIN'
                          ? 'Equal Round Robin'
                          : 'Least Active Tickets'}
                      </strong>
                      <span>{strategyDescriptions[option]}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            </fieldset>
            {settingsError && (
              <p className="field-error" role="alert">
                {settingsError}
              </p>
            )}
            <div className="ticket-routing-form-footer">
              <button
                className="button primary"
                type="submit"
                disabled={savingSettings || !settingsChanged}
              >
                {savingSettings
                  ? 'Saving settings...'
                  : 'Save routing settings'}
              </button>
            </div>
          </form>
        </section>

        <section className="panel ticket-routing-mappings">
          <div className="list-heading">
            <div>
              <h2>Category specialty mappings</h2>
              <p className="quiet-note">
                A Manager is eligible only when their Team covers an active
                specialty mapped to the ticket category.
              </p>
            </div>
          </div>
          {data.categories.length ? (
            data.categories.map((category) => {
              const retainedSpecialties = category.specialties.filter(
                (specialty) => !!specialty.archivedAt,
              )
              const selectedIds = draft.mappings[category.id] ?? []
              const initialIds = category.specialties
                .filter((specialty) => !specialty.archivedAt)
                .map((specialty) => specialty.id)
                .sort((a, b) => a - b)
              const changed =
                selectedIds.slice().sort((a, b) => a - b).join(',') !==
                initialIds.join(',')
              return (
                <article
                  className="ticket-routing-category"
                  key={category.id}
                >
                  <header className="ticket-routing-category-heading">
                    <div>
                      <h3>{category.name}</h3>
                      <span
                        className={
                          category.archivedAt
                            ? 'ticket-routing-archived'
                            : 'quiet-note'
                        }
                      >
                        {category.archivedAt
                          ? 'Archived'
                          : `${selectedIds.length} active ${
                              selectedIds.length === 1
                                ? 'specialty'
                                : 'specialties'
                            } mapped`}
                      </span>
                    </div>
                    {!category.archivedAt && (
                      <button
                        className="button secondary"
                        type="button"
                        disabled={!changed || savingCategory !== null}
                        onClick={() => void saveMappings(category.id)}
                      >
                        {savingCategory === category.id
                          ? 'Saving...'
                          : 'Save mappings'}
                      </button>
                    )}
                  </header>
                  {category.archivedAt ? (
                    <div>
                      <p className="quiet-note">
                        This category is archived. Its mappings are retained
                        and will be available again if it is reactivated.
                      </p>
                      <p className="quiet-note">
                        Retained mappings:{' '}
                        {category.specialties.length
                          ? category.specialties
                              .map(
                                (specialty) =>
                                  `${specialty.name}${
                                    specialty.archivedAt ? ' (archived)' : ''
                                  }`,
                              )
                              .join(', ')
                          : 'None'}
                      </p>
                    </div>
                  ) : activeSpecialties.length ? (
                    <fieldset
                      className="ticket-routing-specialties"
                      disabled={savingCategory !== null}
                      aria-label={`${category.name} specialties`}
                    >
                      {activeSpecialties.map((specialty) => (
                        <label
                          className="check-option"
                          key={specialty.id}
                        >
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(specialty.id)}
                            onChange={() =>
                              toggleSpecialty(category.id, specialty.id)
                            }
                          />
                          {specialty.name}
                        </label>
                      ))}
                    </fieldset>
                  ) : (
                    <p className="quiet-note">
                      No active specialties are available. Tickets in this
                      category will stay unassigned.
                    </p>
                  )}
                  {!category.archivedAt && selectedIds.length === 0 && (
                    <p className="ticket-routing-unmapped">
                      No active specialty is mapped. Tickets in this category
                      will stay unassigned.
                    </p>
                  )}
                  {retainedSpecialties.length > 0 && (
                    <p className="quiet-note ticket-routing-retained">
                      Retained archived specialties:{' '}
                      {retainedSpecialties
                        .map((specialty) => specialty.name)
                        .join(', ')}
                      . They do not qualify for routing while archived.
                    </p>
                  )}
                  {mappingErrors[category.id] && (
                    <p className="field-error" role="alert">
                      {mappingErrors[category.id]}
                    </p>
                  )}
                </article>
              )
            })
          ) : (
            <p className="ticket-routing-empty">
              Create a ticket category before configuring routing coverage.
            </p>
          )}
        </section>
      </div>
    </RefreshSurface>
  )
}
