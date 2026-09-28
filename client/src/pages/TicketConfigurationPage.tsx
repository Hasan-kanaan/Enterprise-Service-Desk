import { useState } from 'react'
import api from '@/services/api'
import { useResource } from '@/hooks/useResource'
import { AdminDialog } from '@/components/AdminDialog'
import { ErrorState, LoadingState, EmptyState } from '@/components/TicketUI'
import type { Reference } from '@/types/administration'
type Catalog = 'categories' | 'tags'
type Action = {
  catalog: Catalog
  kind: 'create' | 'rename' | 'archive' | 'reactivate'
  record?: Reference
}
const load = async (signal: AbortSignal) => {
  const [categories, tags] = await Promise.all(
    ['categories', 'tags'].map((kind) =>
      api.get<Reference[]>(`/ticket-configuration/${kind}`, { signal }),
    ),
  )
  return { categories: categories.data, tags: tags.data }
}
export function TicketConfigurationPage() {
  const resource = useResource(load)
  const [action, setAction] = useState<Action | null>(null)
  const reload = () => {
    setAction(null)
    resource.reload()
  }
  if (resource.loading)
    return <LoadingState label="Loading ticket configuration..." />
  if (resource.error || !resource.data)
    return <ErrorState error={resource.error} onRetry={reload} />
  return (
    <div className="ticket-workspace">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>Ticket configuration</h1>
          <p className="muted">
            Categories and tags describe support issues. Archived names remain
            reserved.
          </p>
        </div>
        <button className="button secondary" onClick={reload}>
          Refresh configuration
        </button>
      </header>
      {(['categories', 'tags'] as const).map((catalog) => (
        <section className="panel" key={catalog}>
          <div className="list-heading">
            <h2>{catalog === 'categories' ? 'Categories' : 'Tags'}</h2>
            <button
              className="button primary"
              onClick={() => setAction({ catalog, kind: 'create' })}
            >
              Create {catalog === 'categories' ? 'category' : 'tag'}
            </button>
          </div>
          {resource.data![catalog].length ? (
            resource.data![catalog].map((record) => (
              <article className="admin-row" key={record.id}>
                <span>{record.name}</span>
                <span>{record.archivedAt ? 'ARCHIVED' : 'ACTIVE'}</span>
                <div className="button-row">
                  <button
                    className="button secondary"
                    onClick={() =>
                      setAction({ catalog, record, kind: 'rename' })
                    }
                  >
                    Rename
                  </button>
                  <button
                    className="button secondary"
                    onClick={() =>
                      setAction({
                        catalog,
                        record,
                        kind: record.archivedAt ? 'reactivate' : 'archive',
                      })
                    }
                  >
                    {record.archivedAt ? 'Reactivate' : 'Archive'}
                  </button>
                </div>
              </article>
            ))
          ) : (
            <EmptyState title="No records yet">
              <p>Create a category or tag for your service desk.</p>
            </EmptyState>
          )}
        </section>
      ))}
      {action && (
        <ConfigurationDialog
          key={`${action.catalog}-${action.kind}-${action.record?.id}`}
          action={action}
          onClose={() => setAction(null)}
          onReload={reload}
        />
      )}
    </div>
  )
}
function ConfigurationDialog({
  action,
  onClose,
  onReload,
}: {
  action: Action
  onClose: () => void
  onReload: () => void
}) {
  const [name, setName] = useState(action.record?.name ?? '')
  const naming = action.kind === 'create' || action.kind === 'rename'
  const url = `/ticket-configuration/${action.catalog}`
  return (
    <AdminDialog
      title={`${action.kind[0].toUpperCase() + action.kind.slice(1)} ${action.record?.name ?? (action.catalog === 'categories' ? 'category' : 'tag')}`}
      onClose={onClose}
      onReload={onReload}
      onDone={onReload}
      valid={!naming || !!name.trim()}
      submit={() =>
        action.kind === 'create'
          ? api.post(url, { name: name.trim() })
          : action.kind === 'rename'
            ? api.patch(`${url}/${action.record!.id}`, { name: name.trim() })
            : api.post(`${url}/${action.record!.id}/${action.kind}`)
      }
    >
      {naming ? (
        <label className="field">
          Name
          <input
            aria-label="Configuration name"
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      ) : (
        <p className="notice">
          {action.kind === 'archive'
            ? 'Confirm archival. Existing references remain intact. This record will be unavailable for new selections.'
            : 'Restore eligibility for future selections.'}
        </p>
      )}
    </AdminDialog>
  )
}
