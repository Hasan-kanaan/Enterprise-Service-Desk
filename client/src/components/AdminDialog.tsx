import { useState, type ReactNode } from 'react'
import { Modal } from './Modal'
import { getApiErrorMessage, getApiStatus } from '@/services/api'
export function AdminDialog({
  title,
  children,
  valid = true,
  submit,
  onClose,
  onDone,
  onReload,
}: {
  title: string
  children: ReactNode
  valid?: boolean
  submit: () => Promise<unknown>
  onClose: () => void
  onDone: () => void
  onReload: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  const stale = [403, 404, 409].includes(getApiStatus(error) ?? 0)
  return (
    <Modal title={title} onClose={onClose} busy={busy}>
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          if (busy || !valid || stale) return
          setBusy(true)
          setError(undefined)
          try {
            await submit()
            onDone()
          } catch (failure) {
            setError(failure)
          } finally {
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
                        'We could not confirm the change. Reload before trying again.',
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
