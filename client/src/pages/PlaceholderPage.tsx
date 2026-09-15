import { ArrowLeft, Construction } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'

export function PlaceholderPage() {
  const { pathname } = useLocation()
  const title = pathname.slice(1).replace(/-/g, ' ') || 'workspace'
  return <div className="flex min-h-[60vh] items-center justify-center text-center"><div><div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"><Construction className="size-5" /></div><h1 className="mt-5 text-2xl font-semibold capitalize">{title} is next</h1><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">This surface is reserved for the next service-desk implementation phase.</p><Link to="/dashboard" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-cyan-700 hover:underline dark:text-cyan-300"><ArrowLeft className="size-4" /> Back to dashboard</Link></div></div>
}
