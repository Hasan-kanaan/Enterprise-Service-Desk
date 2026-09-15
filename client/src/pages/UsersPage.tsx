import { zodResolver } from '@hookform/resolvers/zod'
import { AlertCircle, Plus, RefreshCw, Search, UserRound, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { useAppSelector } from '@/hooks/storeHooks'
import { createAccount, listAccounts } from '@/services/users.service'
import type { AuthUser, UserRole } from '@/types/auth'

const accountSchema = z.object({
  username: z.string().min(3, 'Use at least 3 characters').max(50),
  email: z.string().email('Enter a valid company email'),
  password: z.string().min(8, 'Use at least 8 characters'),
  role: z.enum(['ADMIN', 'MANAGER', 'AGENT', 'EMPLOYEE']),
})
type AccountForm = z.infer<typeof accountSchema>

const roleLabels: Record<UserRole, string> = { SUPER_ADMIN: 'Super Admin', ADMIN: 'Admin', MANAGER: 'Manager', AGENT: 'Agent', EMPLOYEE: 'Employee' }

export function UsersPage() {
  const currentRole = useAppSelector((state) => state.auth.user?.role)
  const [accounts, setAccounts] = useState<AuthUser[]>([])
  const [query, setQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const availableRoles = currentRole === 'SUPER_ADMIN' ? ['ADMIN'] : currentRole === 'ADMIN' ? ['EMPLOYEE', 'AGENT', 'MANAGER'] : []
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<AccountForm>({ resolver: zodResolver(accountSchema) })

  useEffect(() => {
    let active = true
    listAccounts().then((data) => {
      if (active) { setAccounts(data); setLoadError(false) }
    }).catch(() => {
      if (active) { setLoadError(true); toast.error('Unable to load the account directory.') }
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])

  const retryLoad = () => {
    setLoadError(false)
    setLoading(true)
    listAccounts().then(setAccounts).catch(() => { setLoadError(true); toast.error('Unable to load the account directory.') }).finally(() => setLoading(false))
  }

  const filteredAccounts = useMemo(() => accounts.filter((account) => `${account.username} ${account.email} ${account.role}`.toLowerCase().includes(query.toLowerCase())), [accounts, query])

  const onSubmit = async (values: AccountForm) => {
    try {
      const created = await createAccount(values)
      setAccounts((current) => [...current, created])
      reset()
      setDialogOpen(false)
      toast.success(`${roleLabels[created.role]} account created`)
    } catch {
      toast.error('The account could not be created. Check your permissions and details.')
    }
  }

  return <div className="space-y-8"><header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-300">Administration</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">Accounts</h1><p className="mt-2 text-slate-500 dark:text-slate-400">Provision and review access across the service desk.</p></div><button onClick={() => setDialogOpen(true)} disabled={!availableRoles.length} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-cyan-700 px-4 text-sm font-semibold text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-50"><Plus className="size-4" /> Create account</button></header><div className="rounded-xl border border-[var(--border)] bg-[var(--card)]"><div className="flex flex-col gap-3 border-b border-[var(--border)] p-4 sm:flex-row"><label className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] pl-9 pr-3 text-sm outline-none focus:border-cyan-600 focus:ring-4 focus:ring-cyan-600/10" placeholder="Search accounts" aria-label="Search accounts" /></label><div className="flex items-center gap-2 text-sm text-slate-500"><span className="size-2 rounded-full bg-emerald-500" /> Live directory</div></div>{loading ? <div className="p-12 text-center text-sm text-slate-500">Loading accounts…</div> : loadError ? <div className="p-10 text-center"><AlertCircle className="mx-auto size-6 text-amber-600" /><p className="mt-3 font-medium">The directory could not be loaded.</p><button onClick={retryLoad} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-cyan-700 hover:underline dark:text-cyan-300"><RefreshCw className="size-4" /> Try again</button></div> : filteredAccounts.length ? <div className="divide-y divide-[var(--border)]">{filteredAccounts.map((account) => <div key={account.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center"><div className="flex size-10 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{account.username.slice(0, 2).toUpperCase()}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{account.username}</p><p className="truncate text-sm text-slate-500 dark:text-slate-400">{account.email}</p></div><span className="w-fit rounded-full border border-[var(--border)] px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300">{roleLabels[account.role]}</span></div>)}</div> : <div className="p-8 text-center sm:p-14"><div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300"><UserRound className="size-5" /></div><h2 className="mt-4 font-semibold">{query ? 'No matching accounts' : 'No accounts loaded'}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">{query ? `No accounts match “${query}”.` : 'The account directory is empty.'}</p></div>}</div>{availableRoles.length ? <p className="text-xs text-slate-500 dark:text-slate-400">Your role can create: {availableRoles.map((role) => roleLabels[role as UserRole]).join(', ')}</p> : null}{dialogOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-5" role="presentation"><div className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="create-account-title"><div className="flex items-start justify-between"><div><h2 id="create-account-title" className="text-xl font-semibold">Create account</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">The server will enforce your provisioning permissions.</p></div><button onClick={() => setDialogOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-[var(--muted)]" aria-label="Close dialog"><X className="size-5" /></button></div><form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit(onSubmit)}><label className="text-sm font-medium">Username<input {...register('username')} className="mt-2 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm outline-none focus:border-cyan-600 focus:ring-4 focus:ring-cyan-600/10" />{errors.username && <span className="mt-1 block text-xs text-red-600">{errors.username.message}</span>}</label><label className="text-sm font-medium">Email<input {...register('email')} type="email" className="mt-2 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm outline-none focus:border-cyan-600 focus:ring-4 focus:ring-cyan-600/10" />{errors.email && <span className="mt-1 block text-xs text-red-600">{errors.email.message}</span>}</label><label className="text-sm font-medium">Temporary password<input {...register('password')} type="password" className="mt-2 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm outline-none focus:border-cyan-600 focus:ring-4 focus:ring-cyan-600/10" />{errors.password && <span className="mt-1 block text-xs text-red-600">{errors.password.message}</span>}</label><label className="text-sm font-medium">Role<select {...register('role')} defaultValue="" className="mt-2 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm outline-none focus:border-cyan-600 focus:ring-4 focus:ring-cyan-600/10"><option value="" disabled>Select role</option>{availableRoles.map((role) => <option key={role} value={role}>{roleLabels[role as UserRole]}</option>)}</select>{errors.role && <span className="mt-1 block text-xs text-red-600">Select a role</span>}</label><button type="submit" disabled={isSubmitting} className="sm:col-span-2 h-10 rounded-lg bg-cyan-700 text-sm font-semibold text-white hover:bg-cyan-800 disabled:opacity-60">{isSubmitting ? 'Creating…' : 'Create account'}</button></form></div></div>}</div>
}
