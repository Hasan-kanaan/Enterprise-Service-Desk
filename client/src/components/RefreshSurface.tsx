import type { ReactNode } from 'react'

// Retained content is read-only until the replacement snapshot arrives.
export function RefreshSurface({
  busy,
  children,
}: {
  busy: boolean
  children: ReactNode
}) {
  return (
    <div className="refresh-surface" aria-busy={busy}>
      {busy && (
        <p className="refresh-status" role="status">
          Refreshing…
        </p>
      )}
      <div inert={busy}>{children}</div>
    </div>
  )
}
