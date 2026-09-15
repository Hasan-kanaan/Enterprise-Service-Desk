import { ShieldCheck } from 'lucide-react'

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-9 items-center justify-center rounded-xl bg-cyan-700 text-white shadow-sm shadow-cyan-950/15">
        <ShieldCheck className="size-5" aria-hidden="true" />
      </div>
      {!compact && (
        <div>
          <p className="text-sm font-semibold tracking-tight text-slate-950 dark:text-slate-50">
            Northstar Service Desk
          </p>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            Internal operations
          </p>
        </div>
      )}
    </div>
  )
}
