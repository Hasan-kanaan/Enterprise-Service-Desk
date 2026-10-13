import { KeyRound, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { PublicAuthCard, ReturnToSignIn } from '@/components/PublicAuthCard'
import { getSetupStatus, setupInitialAdmin } from '@/services/auth.service'
import { getApiErrorMessage } from '@/services/api'
import '@/setup.css'

const setupSchema = z.object({ displayName: z.string().trim().min(1).max(100), jobTitle: z.string().trim().min(1).max(100), setupSecret: z.string().min(1, 'Enter the installation secret').max(512), email: z.string().trim().email('Enter a valid company email'), restart: z.boolean() })
type SetupForm = z.infer<typeof setupSchema>
type SetupIdentity = Pick<SetupForm, 'displayName' | 'jobTitle' | 'email'>
const identityOf = (values: SetupIdentity): SetupIdentity => ({
  displayName: values.displayName.trim(), jobTitle: values.jobTitle.trim(), email: values.email.trim().toLowerCase(),
})
const identityChanged = (values: SetupIdentity, previous: SetupIdentity) => {
  const current = identityOf(values)
  return current.displayName !== previous.displayName || current.jobTitle !== previous.jobTitle || current.email !== previous.email
}

export function SetupPage() {
  const [setupAvailable, setSetupAvailable] = useState<boolean | null>(null)
  const [delivery, setDelivery] = useState<'SENT' | 'FAILED' | null>(null)
  const [statusError, setStatusError] = useState(false)
  const [error, setError] = useState('')
  const [lastIdentity, setLastIdentity] = useState<SetupIdentity | null>(null)
  const submitting = useRef(false)
  const { register, control, setValue, handleSubmit, formState: { errors, isSubmitting } } = useForm<SetupForm>({
    resolver: zodResolver(setupSchema),
    defaultValues: { displayName: '', jobTitle: '', email: '', setupSecret: '', restart: false },
  })
  const [displayName, jobTitle, email, restart] = useWatch({ control, name: ['displayName', 'jobTitle', 'email', 'restart'] })
  const changed = lastIdentity && identityChanged({ displayName, jobTitle, email }, lastIdentity)
  const correctionBlocked = !!lastIdentity && (!restart || !changed)
  const helper = lastIdentity
    ? !restart ? 'To correct the saved identity, select the confirmation above.'
      : !changed ? 'Change the display name, job title or email before restarting. Unchanged details do not need a restart.'
        : 'Ready to replace the pending identity details and invalidate all previous activation links.'
    : 'First-time setup does not require this option. After a reload, saved pending details are not available here; enter the intended identity and explicitly confirm any restart.'
  useEffect(() => {
    getSetupStatus().then(({ available }) => setSetupAvailable(available)).catch(() => setStatusError(true))
  }, [])
  const onSubmit = async (values: SetupForm) => {
    if (lastIdentity && (!values.restart || !identityChanged(values, lastIdentity))) {
      toast.warning('Confirm a restart and change the pending identity details before submitting.')
      return
    }
    setError('')
    setDelivery(null)
    try {
      const result = await setupInitialAdmin(values)
      // A successful response reserves the identity even when SMTP delivery fails.
      // Keep only normalized identity fields as the comparison baseline, never the secret.
      setLastIdentity(identityOf(values))
      setValue('restart', false)
      setDelivery(result.delivery)
      if (result.delivery === 'SENT') toast.success('Activation email sent. Check your inbox.')
      else toast.error('Activation email could not be delivered. The pending identity was saved.')
    } catch (failure) {
      const message = getApiErrorMessage(failure, 'Setup is unavailable or the account details could not be saved.')
      setError(message)
      toast.error(message)
      void getSetupStatus().then(({ available }) => setSetupAvailable(available)).catch(() => {})
    }
  }

  if (setupAvailable === null && !statusError) return <PublicAuthCard><p role="status">Checking setup availability…</p></PublicAuthCard>
  if (!setupAvailable || statusError) return <PublicAuthCard>
    <header className="public-auth-heading"><h1>{statusError ? 'Setup status unavailable' : 'Initial setup is complete'}</h1>
      <p>{statusError ? 'The system could not confirm bootstrap availability. Try again later.' : 'A Super Admin already exists for this deployment.'}</p></header>
    <ReturnToSignIn />
  </PublicAuthCard>

  return (
    <section className="setup-page mx-auto grid w-full max-w-5xl gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
      <div>
        <div className="mb-5 inline-flex rounded-xl bg-amber-100 p-3 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"><ShieldCheck className="size-6" aria-hidden="true" /></div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-700 dark:text-cyan-300">Initial configuration</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-slate-950 dark:text-white">Create the root administrator.</h1>
        <p className="mt-5 max-w-md leading-7 text-slate-600 dark:text-slate-300">This creates the first/root Super Admin, with the role assigned automatically. You must verify your email and choose your own password through the activation link. Setup closes permanently after activation.</p>
        <ReturnToSignIn />
      </div>
      <div className="min-w-0 rounded-2xl border border-white/70 bg-white/85 p-6 shadow-2xl shadow-slate-900/10 backdrop-blur sm:p-9 dark:border-slate-700/70 dark:bg-slate-900/80">
        <div className="mb-7 flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"><KeyRound className="size-5" aria-hidden="true" /></div>
          <div><h2 className="font-semibold">Super Admin identity</h2><p className="text-sm text-slate-500 dark:text-slate-400">Role is assigned automatically.</p></div>
        </div>
        {delivery && <div className={`setup-delivery ${delivery === 'SENT' ? 'is-success' : 'is-failure'}`} role={delivery === 'SENT' ? 'status' : 'alert'}>
          <h3>{delivery === 'SENT' ? 'Activation email sent.' : 'Activation email could not be delivered.'}</h3>
          <p>{delivery === 'SENT' ? 'Open the email, verify your address and choose your password. Then sign in. You can keep this page open if the identity details need correcting.' : 'The pending identity was saved. Check the SMTP configuration before requesting another email. Correct the identity below only if its details need to change.'}</p>
          {delivery === 'FAILED' && <Link className="button secondary" to="/resend-activation">Request another activation email</Link>}
        </div>}
        <form onSubmit={event => {
          event.preventDefault()
          if (submitting.current) return
          submitting.current = true
          void handleSubmit(onSubmit)(event).finally(() => { submitting.current = false })
        }} aria-busy={isSubmitting}>
          <fieldset className="setup-fields" disabled={isSubmitting}>
            {(['displayName', 'jobTitle'] as const).map(field => <label key={field} className="field">{field === 'displayName' ? 'Display name' : 'Job title'}
              <input {...register(field)} maxLength={100} required aria-invalid={!!errors[field]} aria-describedby={errors[field] ? `${field}-error` : undefined} />
              {errors[field] && <span id={`${field}-error`} role="alert">{errors[field].message}</span>}
            </label>)}
            <label className="field setup-wide">Work email
              <input {...register('email')} placeholder="admin@company.com" type="email" autoComplete="email" required aria-invalid={!!errors.email} aria-describedby={errors.email ? 'email-error' : undefined} />
              {errors.email && <span id="email-error" role="alert">{errors.email.message}</span>}
            </label>
            <label className="field setup-wide">Setup secret
              <input {...register('setupSecret')} type="password" autoComplete="off" required maxLength={512} aria-invalid={!!errors.setupSecret} aria-describedby={errors.setupSecret ? 'secret-error' : undefined} />
              {errors.setupSecret && <span id="secret-error" role="alert">{errors.setupSecret.message}</span>}
            </label>
            <div className="setup-wide setup-recovery">
              <label className="setup-restart" data-selected={restart}>
                <input type="checkbox" {...register('restart')} aria-labelledby="restart-title" aria-describedby="restart-description" />
                <span><span id="restart-title" className="setup-restart-title">Replace pending setup details</span>
                  <span id="restart-description">I intend to correct the pending identity and invalidate all previously issued activation links. This is a restart, not a resend.</span>
                  <span className="setup-restart-state" aria-hidden="true">{restart ? 'Restart confirmed' : 'Confirmation required for corrections'}</span>
                </span>
              </label>
              <p id="restart-help" className="setup-helper" aria-live="polite">{helper}</p>
            </div>
            <button className="button primary setup-wide" type="submit" disabled={isSubmitting || correctionBlocked} aria-describedby="restart-help">{isSubmitting ? 'Sending activation…' : restart || lastIdentity ? 'Restart setup and send activation' : 'Send activation email'}</button>
          </fieldset>
          {error && <p className="public-auth-error" role="alert">{error}</p>}
        </form>
      </div>
    </section>
  )
}
