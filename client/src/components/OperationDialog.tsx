import { useState, type ReactNode } from 'react'
import { Modal } from './Modal'
import { ErrorState } from './TicketUI'
import { getApiErrorMessage, getApiStatus } from '@/services/api'
// Closing/reloading after a conflict discards stale form state. Never retry writes automatically.
export function OperationDialog({
  title,
  children,
  submit,
  onClose,
  onDone,
  onReload,
  valid = true,
  reopen = false,
}: {
  title: string
  children: ReactNode
  submit: (returnToIntake: boolean) => Promise<unknown>
  onClose: () => void
  onDone: () => void
  onReload: () => void
  valid?: boolean
  reopen?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  const [intake, setIntake] = useState(false)
  const conflict = getApiStatus(error) === 409
  const routing =
    reopen &&
    conflict &&
    getApiErrorMessage(error, '').includes('returnToIntake')
  return (
    <Modal title={title} onClose={onClose} busy={busy}>
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          if (busy || !valid || (conflict && !(routing && intake))) return
          setBusy(true)
          setError(undefined)
          try {
            await submit(intake)
            onDone()
          } catch (failure) {
            setError(failure)
          } finally {
            setBusy(false)
          }
        }}
      >
        <fieldset disabled={busy || (conflict && !routing)}>
          {children}
        </fieldset>
        {!!error &&
          (routing ? (
            <label className="check-option">
              <input
                type="checkbox"
                checked={intake}
                disabled={busy}
                onChange={(event) => setIntake(event.target.checked)}
              />
              Previous routing is unavailable. Return to the support queue with
              no manager, team or agent.
            </label>
          ) : (
            <ErrorState
              error={error}
              onRetry={conflict ? onReload : undefined}
              message="We could not confirm this change. Reload before trying again."
            />
          ))}
        <div className="form-footer">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="button primary"
            type="submit"
            disabled={busy || !valid || (conflict && !(routing && intake))}
          >
            {busy ? 'Saving...' : 'Confirm'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
