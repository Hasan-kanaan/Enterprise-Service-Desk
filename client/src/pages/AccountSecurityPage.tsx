import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { completeAccountAction } from '@/services/auth.service'
import api, { getApiErrorMessage } from '@/services/api'

export function AccountSecurityPage({ action }: { action: 'activate' | 'reset-password' | 'forgot-password' | 'resend-activation' }) {
  const [token, setToken] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const consume = action === 'activate' || action === 'reset-password'
  useEffect(() => {
    window.history.replaceState(window.history.state, '', window.location.pathname)
  }, [])
  const title = { activate: 'Activate account', 'reset-password': 'Reset password', 'forgot-password': 'Forgot password', 'resend-activation': 'Resend activation' }[action]
  return <section className="panel" style={{ width: '100%', maxWidth: 480, margin: 'auto' }}>
    <h1>{title}</h1>
    {success ? <p role="status">{success}</p> : consume && !token ? <p role="alert">Invalid or missing link. Request a new email.</p> : <form onSubmit={async event => {
      event.preventDefault()
      if (busy) return
      setError('')
      if (consume && (password !== confirm || [...password].length < 8 || new TextEncoder().encode(password).length > 72)) {
        setError('Use matching passwords with at least 8 characters and at most 72 UTF-8 bytes.')
        return
      }
      setBusy(true)
      try {
        const data = consume
          ? await completeAccountAction(action, token, password)
          : (await api.post<{ message: string }>(`/auth/${action}`, { email })).data
        setSuccess(data.message)
        setToken(''); setPassword(''); setConfirm('')
      } catch (failure) { setError(getApiErrorMessage(failure, 'Unable to connect. Please try again.')) }
      finally { setBusy(false) }
    }}>
      <fieldset disabled={busy} className="form-grid">
        {consume ? <>
          <label className="field">New password<input required type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
          <label className="field">Confirm new password<input required type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} /></label>
        </> : <label className="field">Email<input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>}
        <button type="submit" className="button primary">{busy ? 'Please wait...' : consume ? 'Save password' : 'Send instructions'}</button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </form>}
    <p><Link to="/login">Go to login</Link></p>
    {consume && <p><Link to={action === 'activate' ? '/resend-activation' : '/forgot-password'}>Request a new link</Link></p>}
  </section>
}
