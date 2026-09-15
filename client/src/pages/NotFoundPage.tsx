import { ArrowLeft, Compass } from 'lucide-react'
import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return <main className="flex min-h-svh items-center justify-center bg-[var(--background)] px-6 text-center"><div><div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300"><Compass className="size-7" /></div><p className="mt-8 text-sm font-semibold uppercase tracking-[0.2em] text-cyan-700 dark:text-cyan-300">404 / Not found</p><h1 className="mt-3 text-4xl font-semibold tracking-tight">This path is not in the workspace.</h1><p className="mx-auto mt-4 max-w-md leading-7 text-slate-500 dark:text-slate-400">The page may be unavailable or the address may have changed.</p><Link className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-cyan-700 hover:underline dark:text-cyan-300" to="/dashboard"><ArrowLeft className="size-4" /> Return to dashboard</Link></div></main>
}
