import { useForm, useWatch } from 'react-hook-form'
import type {
  TicketInput,
  TicketOptions,
  TicketPriority,
  NamedOption,
} from '@/types/tickets'
import { ticketPriorities } from '@/types/tickets'

type Props = {
  options: TicketOptions
  initial?: TicketInput
  onSave: (values: TicketInput) => Promise<void>
  onCancel: () => void
  submitLabel: string
  locked?: boolean
}
const blank: TicketInput = {
  title: '',
  description: '',
  categoryId: 0,
  priority: 'MEDIUM',
  tagIds: [],
  allRegions: false,
  allDepartments: false,
  affectedRegionIds: [],
  affectedDepartmentIds: [],
}
export function TicketForm({
  options,
  initial,
  onSave,
  onCancel,
  submitLabel,
  locked = false,
}: Props) {
  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<TicketInput>({ defaultValues: initial ?? blank })
  const values = useWatch({ control })
  const selections = (
    field: 'tagIds' | 'affectedRegionIds' | 'affectedDepartmentIds',
    items: NamedOption[],
  ) => (
    <div className="selection-grid">
      {items.map((item) => (
        <label key={item.id} className="check-option">
          <input
            type="checkbox"
            checked={(values[field] ?? []).includes(item.id)}
            onChange={(event) => {
              setValue(
                field,
                event.target.checked
                  ? [...(values[field] ?? []), item.id]
                  : (values[field] ?? []).filter((id) => id !== item.id),
                { shouldDirty: true },
              )
              clearErrors(field)
            }}
          />
          {item.name}
        </label>
      ))}
    </div>
  )
  const submit = handleSubmit(async (input) => {
    if (!input.allRegions && input.affectedRegionIds.length === 0) {
      setError('affectedRegionIds', {
        message: 'Select an affected region or choose all regions.',
      })
      return
    }
    if (!input.allDepartments && input.affectedDepartmentIds.length === 0) {
      setError('affectedDepartmentIds', {
        message: 'Select an affected department or choose all departments.',
      })
      return
    }
    await onSave({
      ...input,
      title: input.title.trim(),
      description: input.description.trim(),
      affectedRegionIds: input.allRegions ? [] : input.affectedRegionIds,
      affectedDepartmentIds: input.allDepartments
        ? []
        : input.affectedDepartmentIds,
    })
  })
  return (
    <form onSubmit={submit} className="ticket-form" noValidate>
      <fieldset disabled={isSubmitting || locked}>
        <div className="form-section">
          <h2>What can we help with?</h2>
          <p>
            Share enough detail for the support team to understand the issue.
          </p>
          <label className="field" htmlFor="ticket-title">
            Title{' '}
            <input
              id="ticket-title"
              {...register('title', {
                validate: (value) =>
                  value.trim().length > 0 || 'Enter a title.',
                maxLength: {
                  value: 200,
                  message: 'Use no more than 200 characters.',
                },
              })}
              maxLength={200}
              placeholder="For example, VPN disconnects when I join a call"
              aria-invalid={!!errors.title}
              aria-describedby={errors.title ? 'title-error' : undefined}
            />
          </label>
          {errors.title && (
            <p id="title-error" className="field-error">
              {errors.title.message}
            </p>
          )}
          <label className="field" htmlFor="ticket-description">
            Description{' '}
            <textarea
              id="ticket-description"
              {...register('description', {
                validate: (value) =>
                  value.trim().length > 0 || 'Describe the issue.',
              })}
              rows={6}
              placeholder="What happened? When did it start? What have you already tried?"
              aria-invalid={!!errors.description}
              aria-describedby={
                errors.description ? 'description-error' : undefined
              }
            />
          </label>
          {errors.description && (
            <p id="description-error" className="field-error">
              {errors.description.message}
            </p>
          )}
          <div className="form-columns">
            <div>
              <label className="field" htmlFor="ticket-category">
                Category
                <select
                  id="ticket-category"
                  {...register('categoryId', {
                    valueAsNumber: true,
                    validate: (value) =>
                      options.categories.some((item) => item.id === value) ||
                      'Choose a category.',
                  })}
                  aria-invalid={!!errors.categoryId}
                >
                  <option value={0}>Select a category</option>
                  {options.categories.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              {errors.categoryId && (
                <p className="field-error">{errors.categoryId.message}</p>
              )}
            </div>
            <label className="field" htmlFor="ticket-priority">
              Priority
              <select id="ticket-priority" {...register('priority')}>
                {ticketPriorities.map((priority: TicketPriority) => (
                  <option key={priority} value={priority}>
                    {priority[0] + priority.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="form-section">
          <h2>Who is affected?</h2>
          <p>Choose the locations and departments experiencing the issue.</p>
          <fieldset className="scope-field">
            <legend>Regions</legend>
            <label className="check-option">
              <input type="checkbox" {...register('allRegions')} />
              All regions
            </label>
            {!values.allRegions &&
              (options.regions.length ? (
                selections('affectedRegionIds', options.regions)
              ) : (
                <p className="muted">
                  No individual regions are available. Choose all regions only
                  if that describes the impact.
                </p>
              ))}
            {errors.affectedRegionIds && (
              <p className="field-error" role="alert">
                {errors.affectedRegionIds.message}
              </p>
            )}
          </fieldset>
          <fieldset className="scope-field">
            <legend>Departments</legend>
            <label className="check-option">
              <input type="checkbox" {...register('allDepartments')} />
              All departments
            </label>
            {!values.allDepartments &&
              (options.departments.length ? (
                selections('affectedDepartmentIds', options.departments)
              ) : (
                <p className="muted">
                  No individual departments are available. Choose all
                  departments only if that describes the impact.
                </p>
              ))}
            {errors.affectedDepartmentIds && (
              <p className="field-error" role="alert">
                {errors.affectedDepartmentIds.message}
              </p>
            )}
          </fieldset>
          {options.tags.length > 0 && (
            <fieldset className="scope-field">
              <legend>
                Tags <span className="muted">(optional)</span>
              </legend>
              {selections('tagIds', options.tags)}
            </fieldset>
          )}
        </div>
        <div className="form-footer">
          <button className="button secondary" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="button primary"
            type="submit"
            disabled={isSubmitting || options.categories.length === 0}
          >
            {isSubmitting ? 'Saving...' : submitLabel}
          </button>
        </div>
      </fieldset>
    </form>
  )
}
