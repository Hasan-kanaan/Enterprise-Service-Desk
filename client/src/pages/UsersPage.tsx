import { useState } from 'react'
import { toast } from 'sonner'
import { useAppSelector } from '@/hooks/storeHooks'
import { useResource } from '@/hooks/useResource'
import { listAccounts } from '@/services/users.service'
import { updateAccountStatus } from '@/services/administration.service'
import { manageableRoles, type Account } from '@/types/administration'
import { AdminDialog } from '@/components/AdminDialog'
import { AccountForm } from '@/components/AccountForm'
import { ErrorState, LoadingState, EmptyState } from '@/components/TicketUI'
export function UsersPage() {
  const role = useAppSelector((state) => state.auth.user)!.role
  const resource = useResource(listAccounts)
  const [query, setQuery] = useState(''),
    [status, setStatus] = useState('')
  const [creating, setCreating] = useState(false),
    [target, setTarget] = useState<Account | null>(null)
  const reload = () => {
    setCreating(false)
    setTarget(null)
    resource.reload()
  }
  const rows =
    resource.data?.filter(
      (account) =>
        `${account.username} ${account.email} ${account.role}`
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (!status || account.status === status),
    ) ?? []
  return (
    <div className="ticket-workspace">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>Accounts</h1>
          <p className="muted">Manage identities and account access.</p>
        </div>
        <div className="button-row">
          <button
            className="button secondary"
            disabled={resource.loading}
            onClick={reload}
          >
            Refresh accounts
          </button>
          <button className="button primary" onClick={() => setCreating(true)}>
            Create account
          </button>
        </div>
      </header>
      <section className="panel">
        <div className="list-filters">
          <label className="search-field">
            <input
              aria-label="Search accounts"
              placeholder="Search identity, email or role"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <select
            aria-label="Account status filter"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="INACTIVE">INACTIVE</option>
          </select>
        </div>
        {resource.loading ? (
          <LoadingState label="Loading accounts..." />
        ) : resource.error ? (
          <ErrorState
            error={resource.error}
            resourceName="account directory"
            onRetry={reload}
          />
        ) : rows.length ? (
          rows.map((account) => (
            <article
              key={account.id}
              className="admin-row"
              data-account-id={account.id}
            >
              <div>
                <h2>{account.username}</h2>
                <p className="muted">{account.email}</p>
                <p className="quiet-note">
                  Region: {account.region?.name ?? 'Unassigned'} / Department:{' '}
                  {account.department?.name ?? 'Unassigned'}
                </p>
              </div>
              <div className="button-row">
                <span className="status-badge">{account.role}</span>
                <span className="status-badge">{account.status}</span>
                {manageableRoles(role).includes(account.role) && (
                  <button
                    className="button secondary"
                    onClick={() => setTarget(account)}
                  >
                    {account.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                  </button>
                )}
              </div>
            </article>
          ))
        ) : (
          <EmptyState title="No matching accounts">
            <p>Try another filter or create an authorized account.</p>
          </EmptyState>
        )}
      </section>
      {creating && (
        <AccountForm
          caller={role}
          onClose={() => setCreating(false)}
          onReload={reload}
          onDone={() => {
            toast.success('Account created')
            reload()
          }}
        />
      )}
      {target && (
        <AdminDialog
          title={`${target.status === 'ACTIVE' ? 'Deactivate' : 'Activate'} ${target.username}?`}
          onClose={() => setTarget(null)}
          onReload={reload}
          onDone={() => {
            toast.success(
              target.status === 'ACTIVE'
                ? 'Account is INACTIVE'
                : 'Account is ACTIVE',
            )
            reload()
          }}
          submit={() =>
            updateAccountStatus(
              target.id,
              target.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
            )
          }
        >
          {target.status === 'ACTIVE' ? (
            <>
              <p className="notice">
                This user will lose authenticated access. Deactivation
                administratively offboards their current operational
                responsibilities.
              </p>
              <p className="muted">
                The backend may return their active managed work to intake,
                clear current agent assignments, and remove Team Lead and
                TeamManager responsibilities. Historical work remains attributed
                to them. No replacement people are selected.
              </p>
            </>
          ) : (
            <p className="notice">
              Reactivation permits a fresh sign-in. Previous sessions and
              responsibilities are not restored.
            </p>
          )}
        </AdminDialog>
      )}
    </div>
  )
}
