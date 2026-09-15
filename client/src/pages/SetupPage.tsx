import { KeyRound, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { getSetupStatus, setupInitialAdmin } from '@/services/auth.service'
import { getApiErrorMessage } from '@/services/api'

const setupSchema = z.object({ username: z.string().min(3, 'Use at least 3 characters'), email: z.string().email('Enter a valid company email'), password: z.string().min(8, 'Use at least 8 characters'), confirmPassword: z.string().min(1, 'Confirm your password') }).refine((values) => values.password === values.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' })
type SetupForm = z.infer<typeof setupSchema>

export function SetupPage() {
  const navigate = useNavigate()
  const [setupAvailable, setSetupAvailable] = useState<boolean | null>(null)
  const [statusError, setStatusError] = useState(false)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<SetupForm>({ resolver: zodResolver(setupSchema) })
  useEffect(() => {
    getSetupStatus().then(({ available }) => setSetupAvailable(available)).catch(() => setStatusError(true))
  }, [])
  const onSubmit = async (values: SetupForm) => {
    try {
      await setupInitialAdmin({ username: values.username, email: values.email, password: values.password })
      toast.success('Initial setup completed. You can now sign in.')
      navigate('/login', { replace: true })
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Setup is unavailable or the account details could not be saved.'))
    }
  }

  if (setupAvailable === null && !statusError) return <section className="mx-auto w-full max-w-xl rounded-2xl border border-[var(--border)] bg-[var(--card)] p-12 text-center text-sm text-slate-500">Checking setup availability…</section>
  if (!setupAvailable || statusError) return <section className="mx-auto w-full max-w-xl rounded-2xl border border-[var(--border)] bg-[var(--card)] p-10 text-center"><h1 className="text-2xl font-semibold">{statusError ? 'Setup status unavailable' : 'Initial setup is complete'}</h1><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">{statusError ? 'The system could not confirm bootstrap availability. Try again later.' : 'A Super Admin already exists for this deployment.'}</p><Link to="/login" className="mt-6 inline-flex text-sm font-semibold text-cyan-700 hover:underline dark:text-cyan-300">Go to sign in</Link></section>

  return (
    <section className="mx-auto grid w-full max-w-5xl gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
      <div><div className="mb-5 inline-flex rounded-xl bg-amber-100 p-3 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"><ShieldCheck className="size-6" /></div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-700 dark:text-cyan-300">Initial configuration</p><h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-slate-950 dark:text-white">Create the root administrator.</h1><p className="mt-5 max-w-md leading-7 text-slate-600 dark:text-slate-300">This setup is only available during initial system configuration. The first account will be a Super Admin and setup will lock after completion.</p><Link to="/login" className="mt-7 inline-flex text-sm font-semibold text-cyan-700 hover:underline dark:text-cyan-300">Already configured? Return to sign in</Link></div>
      <div className="rounded-2xl border border-white/70 bg-white/85 p-7 shadow-2xl shadow-slate-900/10 backdrop-blur sm:p-9 dark:border-slate-700/70 dark:bg-slate-900/80"><div className="mb-7 flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"><KeyRound className="size-5" /></div><div><h2 className="font-semibold">Super Admin credentials</h2><p className="text-sm text-slate-500 dark:text-slate-400">Role is assigned automatically.</p></div></div><form className="grid gap-5 sm:grid-cols-2" onSubmit={handleSubmit(onSubmit)}><label className="text-sm font-medium">Username<input {...register('username')} className="mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm outline-none focus:border-cyan-600 focus:ring-4 focus:ring-cyan-600/10" placeholder="root.admin" />{errors.username && <span className="mt-1 block text-xs text-red-600">{errors.username.message}</span>}</label><label className="text-sm font-medium">Work email<input {...register('email')} className="mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm outline-none focus:border-cyan-600 focus:ring-4 focus:ring-cyan-600/10" placeholder="admin@company.com" type="email" />{errors.email && <span className="mt-1 block text-xs text-red-600">{errors.email.message}</span>}</label><label className="text-sm font-medium">Password<input {...register('password')} className="mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm outline-none focus:border-cyan-600 focus:ring-4 focus:ring-cyan-600/10" type="password" placeholder="At least 8 characters" />{errors.password && <span className="mt-1 block text-xs text-red-600">{errors.password.message}</span>}</label><label className="text-sm font-medium">Confirm password<input {...register('confirmPassword')} className="mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm outline-none focus:border-cyan-600 focus:ring-4 focus:ring-cyan-600/10" type="password" placeholder="Repeat password" />{errors.confirmPassword && <span className="mt-1 block text-xs text-red-600">{errors.confirmPassword.message}</span>}</label><button className="sm:col-span-2 flex h-11 items-center justify-center rounded-lg bg-cyan-700 text-sm font-semibold text-white hover:bg-cyan-800 disabled:opacity-60" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Creating administrator…' : 'Complete initial setup'}</button></form></div>
    </section>
  )
}
