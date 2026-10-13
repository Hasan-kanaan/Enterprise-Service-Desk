import '@/skeleton.css'

export type SkeletonVariant = 'list' | 'table' | 'detail' | 'form' | 'cards' | 'page'
export function Skeleton({ shape = 'line' }: { shape?: 'line' | 'heading' | 'avatar' | 'control' | 'card' }) {
  return <span className={`skeleton skeleton-${shape}`} aria-hidden="true" />
}
const lines = <div className="skeleton-lines"><Skeleton /><Skeleton /></div>
export function SkeletonState({ variant = 'list', label = 'Loading content...', count = 4 }: { variant?: SkeletonVariant; label?: string; count?: number }) {
  const rows = <div className="skeleton-rows">{Array.from({ length: count }, (_, index) => <div className={`skeleton-row skeleton-row-${variant}`} key={index}>
    <Skeleton shape="avatar" />{lines}<Skeleton shape="control" />
  </div>)}</div>
  return <div className={`skeleton-state skeleton-state-${variant}`} role="status" aria-label={label} aria-busy="true">
    <span className="sr-only">{label}</span>
    <div aria-hidden="true">
      {(variant === 'page' || variant === 'detail') && <div className="skeleton-page-heading"><Skeleton shape="heading" /><Skeleton shape="control" /></div>}
      {variant === 'page' || variant === 'cards' ? <div className="skeleton-cards">{Array.from({ length: 3 }, (_, index) => <div className="skeleton-panel" key={index}><Skeleton shape="heading" />{lines}</div>)}</div> : null}
      {variant === 'form' ? <div className="skeleton-form">{Array.from({ length: count }, (_, index) => <div className="skeleton-field" key={index}><Skeleton /><Skeleton shape="control" /></div>)}<Skeleton shape="control" /></div>
        : variant === 'detail' ? <div className="skeleton-detail"><div className="skeleton-panel"><Skeleton shape="heading" /><Skeleton shape="card" />{lines}</div><div className="skeleton-panel"><Skeleton shape="heading" />{rows}</div></div>
          : variant !== 'cards' ? rows : null}
    </div>
  </div>
}
