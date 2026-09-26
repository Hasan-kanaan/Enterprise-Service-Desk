import { Eye, EyeOff, LockKeyhole, MoveRight } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { login } from '@/services/auth.service'
import { useAppSelector } from '@/hooks/storeHooks'
import { getApiErrorMessage } from '@/services/api'

const loginSchema = z.object({ email: z.string().email('Enter a valid company email'), password: z.string().min(1, 'Enter your password') })
type LoginForm = z.infer<typeof loginSchema>

export function LoginPage() {
  const [showPassword, setShowPassword] = useState(false)
  const user = useAppSelector((state) => state.auth.user)
  const navigate = useNavigate()
  const location = useLocation()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })
  const onSubmit = async (values: LoginForm) => {
    try {
      await login(values)
      toast.success('Signed in successfully')
      navigate((location.state as { from?: string } | null)?.from ?? '/dashboard', { replace: true })
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Unable to sign in. Check your credentials and try again.'))
    }
  }

  if (user) return <Navigate to={(location.state as { from?: string } | null)?.from ?? '/dashboard'} replace />

  return (
    <section className="grid w-full items-center gap-16 lg:grid-cols-[1.05fr_0.95fr]">
      <div className="hidden max-w-xl lg:block">
        <p className="mb-5 text-sm font-semibold uppercase tracking-[0.2em] text-cyan-700 dark:text-cyan-300">Internal service operations</p>
        <h1 className="max-w-lg text-5xl font-semibold tracking-[-0.04em] text-slate-950 dark:text-white xl:text-6xl">Make every support request feel handled.</h1>
        <p className="mt-6 max-w-md text-lg leading-8 text-slate-600 dark:text-slate-300">One calm workspace for employees, agents, managers, and administrators to move work forward.</p>
        <div className="mt-10 flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400"><span className="flex size-9 items-center justify-center rounded-full border border-cyan-200 bg-white/60 text-cyan-700 dark:border-cyan-900 dark:bg-slate-900/40 dark:text-cyan-300">01</span> Secure company access <MoveRight className="size-4" /> Role-aware workspace</div>
      </div>
      <div className="mx-auto w-full max-w-md rounded-2xl border border-white/70 bg-white/85 p-7 shadow-2xl shadow-slate-900/10 backdrop-blur sm:p-9 dark:border-slate-700/70 dark:bg-slate-900/80">
        <div className="mb-8"><div className="mb-4 inline-flex rounded-xl bg-cyan-50 p-3 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300"><LockKeyhole className="size-5" /></div><h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2><p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">Sign in with your company credentials to continue.</p></div>
        <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
          <label className="block text-sm font-medium">Company email<input {...register('email')} className="mt-2 h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm outline-none transition focus:border-cyan-600 focus:ring-4 focus:ring-cyan-600/10" placeholder="you@company.com" autoComplete="username" />{errors.email && <span className="mt-1 block text-xs text-red-600">{errors.email.message}</span>}</label>
          <label className="block text-sm font-medium">Password<div className="relative mt-2"><input {...register('password')} className="h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 pr-11 text-sm outline-none transition focus:border-cyan-600 focus:ring-4 focus:ring-cyan-600/10" type={showPassword ? 'text' : 'password'} placeholder="Enter your password" autoComplete="current-password" /><button type="button" className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div>{errors.password && <span className="mt-1 block text-xs text-red-600">{errors.password.message}</span>}</label>
          <button className="flex h-11 w-full items-center justify-center rounded-lg bg-cyan-700 text-sm font-semibold text-white shadow-sm shadow-cyan-950/15 transition hover:bg-cyan-800 focus:outline-none focus:ring-4 focus:ring-cyan-600/20 disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <p className="mt-6 text-center text-xs leading-5 text-slate-500 dark:text-slate-400">Need to initialize a new deployment? <Link className="font-semibold text-cyan-700 hover:underline dark:text-cyan-300" to="/setup">Open initial setup</Link></p>
      </div>
    </section>
  )
}
