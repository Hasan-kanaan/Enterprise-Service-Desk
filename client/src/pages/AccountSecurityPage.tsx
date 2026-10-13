import { Check, Circle, KeyRound, Mail, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { PublicAuthCard, ReturnToSignIn } from '@/components/PublicAuthCard'
import { completeAccountAction } from '@/services/auth.service'
import api, { getApiErrorMessage, getApiStatus } from '@/services/api'

const copy = {
  activate: {
    title: 'Activate account', description: 'Choose a password to verify your account and get started with Kino Service Desk.',
    submit: 'Save password', done: 'Your account is verified',
    message: 'Your password has been set. You can now sign in to Kino Service Desk.',
  },
  'reset-password': {
    title: 'Reset password', description: 'Choose a new password for your Kino Service Desk account.',
    submit: 'Save password', done: 'Your password has been changed',
    message: 'Sign in with your new password to continue to Kino Service Desk.',
  },
  'forgot-password': {
    title: 'Forgot password?', description: 'Enter your company email and we’ll send instructions to reset your password.',
    submit: 'Send reset instructions', done: 'Check your inbox',
    message: 'If this email is associated with an eligible Kino Service Desk account, reset instructions have been sent. Check your inbox.',
  },
  'resend-activation': {
    title: 'Resend activation', description: 'Enter your company email to request a new account activation link.',
    submit: 'Send activation instructions', done: 'Check your inbox',
    message: 'If this email is associated with an eligible Kino Service Desk account, activation instructions have been sent. Check your inbox.',
  },
}

export function AccountSecurityPage({ action }: { action: keyof typeof copy }) {
  const [token, setToken] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [success, setSuccess] = useState(false)
  const [unusable, setUnusable] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const consume = action === 'activate' || action === 'reset-password'
  const content = copy[action]
  const longEnough = [...password].length >= 8
  const withinLimit = new TextEncoder().encode(password).length <= 72
  const matches = !!confirm && password === confirm
  const passwordError = password || submitted
    ? !longEnough ? 'Use at least 8 characters.' : !withinLimit ? 'Use at most 72 UTF-8 bytes. Some characters use more than one byte.' : ''
    : ''
  const confirmError = (confirm || submitted) && !matches ? 'Both password fields must match.' : ''
  const needsLink = consume && (!token || unusable)

  useEffect(() => {
    window.history.replaceState(window.history.state, '', window.location.pathname)
  }, [])
  useEffect(() => {
    if (success || unusable) heading.current?.focus()
  }, [success, unusable])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current) return
    setSubmitted(true)
    setError('')
    if (consume && (!longEnough || !withinLimit || !matches)) {
      const message = !longEnough ? 'Use at least 8 characters.' : !withinLimit ? 'Use at most 72 UTF-8 bytes.' : 'Both password fields must match.'
      toast.warning(message)
      event.currentTarget.querySelector<HTMLInputElement>(!longEnough || !withinLimit ? '#new-password' : '#confirm-password')?.focus()
      return
    }
    submitting.current = true
    setBusy(true)
    try {
      if (consume) await completeAccountAction(action, token, password)
      else await api.post(`/auth/${action}`, { email })
      setSuccess(true)
      setToken(''); setPassword(''); setConfirm(''); setEmail('')
      toast.success(consume ? content.done : 'Request received. Check your inbox for instructions.')
    } catch (failure) {
      // Only this explicit server response establishes that the link is unusable.
      // Other 400s, conflicts, rate limits and network failures remain retryable.
      const detail = getApiErrorMessage(failure, 'Unable to connect. Please try again.')
      const invalidLink = consume && getApiStatus(failure) === 400 && detail === 'Invalid, expired or used link'
      if (invalidLink) {
        setUnusable(true)
        setToken(''); setPassword(''); setConfirm('')
      }
      // Public email requests never display account-specific backend details.
      const message = consume ? detail : getApiStatus(failure) === 429
        ? 'Too many requests. Please wait and try again.'
        : 'Unable to send the request. Please try again.'
      setError(message)
      toast.error(message)
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  const Icon = success ? consume ? ShieldCheck : Mail : consume ? KeyRound : Mail
  return <PublicAuthCard>
    <div className={`public-auth-icon${success ? ' is-success' : ''}`}><Icon aria-hidden="true" size={24} /></div>
    <header className="public-auth-heading">
      <h1 ref={heading} tabIndex={-1}>{success ? content.done : needsLink ? 'You need a new link' : content.title}</h1>
      <p>{success ? content.message : needsLink
        ? unusable ? 'This link is invalid, expired or already used. Request a new email to continue.' : 'No link was supplied. Open the link in your email or request a new one.'
        : content.description}</p>
    </header>
    {success ? <>
      {consume ? <Link className="button primary public-auth-primary" to="/login">Sign in</Link> : <ReturnToSignIn />}
      {consume && <p className="public-auth-note">You may close this tab. Sign in whenever you’re ready.</p>}
    </> : needsLink ? <>
      <Link className="button primary public-auth-primary" to={action === 'activate' ? '/resend-activation' : '/forgot-password'}>Request a new link</Link>
      <ReturnToSignIn />
    </> : <>
      <form onSubmit={submit} aria-busy={busy}>
        <fieldset disabled={busy} className="public-auth-fields">
          {consume ? <>
            <label className="field" htmlFor="new-password">New password
              <input id="new-password" name="newPassword" required type="password" autoComplete="new-password" aria-describedby="password-requirements password-feedback" aria-invalid={!!passwordError} value={password} onChange={e => setPassword(e.target.value)} />
            </label>
            <label className="field" htmlFor="confirm-password">Confirm new password
              <input id="confirm-password" name="confirmPassword" required type="password" autoComplete="new-password" aria-describedby="confirm-feedback" aria-invalid={!!confirmError} value={confirm} onChange={e => setConfirm(e.target.value)} />
            </label>
            <div className="public-auth-guidance" id="password-requirements">
              <p className="public-auth-guidance-title">Password requirements</p>
              <ul>{[
                [longEnough, 'At least 8 characters'],
                [!!password && withinLimit, 'At most 72 UTF-8 bytes'],
                [matches, 'Both password fields must match'],
              ].map(([met, text]) => <li key={String(text)} data-met={met}>
                {met ? <Check size={16} aria-hidden="true" /> : <Circle size={16} aria-hidden="true" />}
                <span>{text}<span className="sr-only">{met ? ': met' : ': not yet met'}</span></span>
              </li>)}</ul>
              <p>Some characters use more than one byte. You can use your password manager’s suggested password.</p>
            </div>
            <div className="public-auth-feedback" aria-live="polite" aria-atomic="true">
              <p id="password-feedback" className={password && !passwordError ? 'is-valid' : undefined}>{passwordError || (password ? 'Password meets the length requirements.' : 'Use a unique password you don’t use elsewhere.')}</p>
              <p id="confirm-feedback" className={matches ? 'is-valid' : undefined}>{confirmError || (matches ? 'Passwords match.' : '')}</p>
            </div>
          </> : <label className="field" htmlFor="email">Company email
            <input id="email" name="email" required type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} />
          </label>}
          <button type="submit" className="button primary public-auth-primary">{busy ? 'Please wait…' : content.submit}</button>
        </fieldset>
        {error && <p className="public-auth-error" role="alert">{error}</p>}
      </form>
      <ReturnToSignIn />
    </>}
  </PublicAuthCard>
}
