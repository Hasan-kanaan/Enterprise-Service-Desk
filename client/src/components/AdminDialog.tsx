import { toast } from 'sonner'
import { useRef, useState, type ReactNode } from 'react'
import { Modal } from './Modal'
import { getApiErrorMessage, getApiStatus } from '@/services/api'
import { requiresAdministrationReload } from './admin-conflict'
export function AdminDialog({
  title,
  children,
  valid = true,
  submit,
  onClose,
  onDone,
  onReload,
  presentation = 'modal',
}: {
  title: string
  children: ReactNode
  valid?: boolean
  submit: () => Promise<unknown>
  onClose: () => void
  onDone: () => void
  onReload?: () => void
  presentation?: 'modal' | 'drawer'
}) {
  const submitting = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  // A conflict needs explicit stale-state evidence before locking the draft.
  const stale = !!onReload && requiresAdministrationReload(getApiStatus(error), getApiErrorMessage(error, ''))
  return (
    <Modal
      title={title}
      onClose={onClose}
      busy={busy}
      presentation={presentation}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          if (submitting.current || busy || !valid || stale) return
          submitting.current = true
          setBusy(true)
          setError(undefined)
          try {
            await submit()
            onDone()
          } catch (failure) {
            setError(failure)
            toast.error(getApiErrorMessage(failure, 'Could not save the change. Please try again.'))
          } finally {
            submitting.current = false
            setBusy(false)
          }
        }}
      >
        <fieldset disabled={busy || stale}>{children}</fieldset>
        {!!error && (
          <div className="error-state" role="alert">
            <div>
              <p>
                {getApiStatus(error) === 403
                  ? 'You no longer have permission for this operation.'
                  : getApiStatus(error) === 404
                    ? 'This account or organization record is no longer available.'
                    : getApiErrorMessage(
                        error,
                        'Could not save the change. Check the details and try again.',
                      )}
              </p>
              {stale && (
                <button
                  className="text-button"
                  type="button"
                  onClick={onReload}
                >
                  Reload administration
                </button>
              )}
            </div>
          </div>
        )}
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
            disabled={busy || stale || !valid}
            type="submit"
          >
            {busy ? 'Saving...' : 'Confirm'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
