import { useState } from 'react'
import { toast } from 'sonner'
import { changePassword } from '@/services/auth.service'
import { getApiErrorMessage } from '@/services/api'

export function PasswordForm({ onDone }: { onDone?: () => void }) {
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <form
      className="panel security-form"
      onSubmit={async (event) => {
        event.preventDefault()
        if (busy) return
        if (
          password !== confirm ||
          [...password].length < 8 ||
          new TextEncoder().encode(password).length > 72
        ) {
          setError(
            'Use at least 8 characters, at most 72 UTF-8 bytes, and matching passwords.',
          )
          return
        }
        setBusy(true)
        setError('')
        try {
          await changePassword(current, password)
          setCurrent('')
          setPassword('')
          setConfirm('')
          toast.success(
            'Password updated. A fresh sign-in is required on all devices.',
          )
          onDone?.()
        } catch (failure) {
          setError(
            getApiErrorMessage(failure, 'Password could not be updated.'),
          )
        } finally {
          setBusy(false)
        }
      }}
    >
      <h2>Change password</h2>
      <p className="muted">This signs the account out on all devices.</p>
      <fieldset disabled={busy} className="form-grid">
        <label className="field">
          Current password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </label>
        <label className="field">
          New password
          <input
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label className="field">
          Confirm new password
          <input
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
      </fieldset>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <button className="button primary" disabled={busy} type="submit">
        {busy ? 'Saving...' : 'Change password'}
      </button>
    </form>
  )
}
