import { ActionMenu } from '@/components/ActionMenu'
import { Link } from 'react-router-dom'
import { ChangeRoleForm } from '@/components/ChangeRoleForm'
import type { Reference } from '@/types/administration'
import { AgentSpecialties } from '@/components/SpecialtyLinks'
import api, { getApiErrorMessage } from '@/services/api'
import { useState } from 'react'
import { toast } from 'sonner'
import { useAppSelector } from '@/hooks/storeHooks'
import { usePagedList, useDebouncedValue } from '@/hooks/usePagedList'
import { useListFilters } from '@/hooks/useListFilters'
import { ListContinuation } from '@/components/ListContinuation'
import { updateAccountStatus } from '@/services/administration.service'
import { manageableRoles, type Account } from '@/types/administration'
import { AdminDialog } from '@/components/AdminDialog'
import { AccountForm } from '@/components/AccountForm'
import { EditAccountForm } from '@/components/EditAccountForm'
import { ErrorState, LoadingState, EmptyState } from '@/components/TicketUI'
export function UsersPage() {
  const role = useAppSelector((state) => state.auth.user)!.role
  const filters = useListFilters()
  const query = filters.get('search'),
    status = filters.get('status'),
    accountRole = filters.get('role')
  const search = useDebouncedValue(query)
  const resource = usePagedList<Account>('/users', {
    search: search || undefined,
    status: status || undefined,
    role: accountRole || undefined,
  })
  const [changingRole, setChangingRole] = useState<Account | null>(null)
  const [managerlessTeams, setManagerlessTeams] = useState<Reference[]>([])
  const [specialties, setSpecialties] = useState<number | null>(null)
  const [editing, setEditing] = useState<Account | null>(null)
  const [sending, setSending] = useState<number | null>(null)
  const [creating, setCreating] = useState(false),
    [target, setTarget] = useState<Account | null>(null)
  const reload = () => {
    setCreating(false)
    setEditing(null)
    setChangingRole(null)
    setSpecialties(null)
    setTarget(null)
    resource.reload()
  }
  const rows = resource.items
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
      {!!managerlessTeams.length && (
        <div className="notice warning" role="status">
          <p>These active regional Teams now require a Manager</p>
          <ul>
            {managerlessTeams.map((team) => (
              <li key={team.id}>{team.name}</li>
            ))}
          </ul>
          <Link
            className="button secondary"
            to="/admin/organization?needsManager=true"
          >
            Review Teams
          </Link>
        </div>
      )}
      <section className="panel">
        <div className="list-filters">
          <label className="search-field">
            <input
              aria-label="Search accounts"
              placeholder="Search name, username or email"
              value={query}
              maxLength={120}
              onChange={(e) => filters.set('search', e.target.value)}
            />
          </label>
          <select
            aria-label="Account status filter"
            value={status}
            onChange={(e) => filters.set('status', e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="INACTIVE">INACTIVE</option>
          </select>
          <select
            aria-label="Account role filter"
            value={accountRole}
            onChange={(e) => filters.set('role', e.target.value)}
          >
            <option value="">All roles</option>
            {['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'AGENT', 'EMPLOYEE'].map(
              (value) => (
                <option key={value}>{value}</option>
              ),
            )}
          </select>
        </div>
        {resource.loading ? (
          <LoadingState label="Loading accounts..." />
        ) : resource.error && !rows.length ? (
          <ErrorState
            error={resource.error}
            resourceName="account directory"
            onRetry={reload}
          />
        ) : rows.length ? (
          rows.map((account) => (
            <article
              key={account.id}
              className="admin-row directory-row"
              data-account-id={account.id}
            >
              <div>
                <h2>{account.displayName ?? account.username}</h2>
                <p className="quiet-note">
                  {account.jobTitle ?? 'Job title not set'}
                </p>
                <p className="muted small">{account.email}</p>
                <p className="quiet-note">
                  Region: {account.region?.name ?? 'Unassigned'}
                  {account.region?.archivedAt ? ' (ARCHIVED)' : ''} /
                  Department: {account.department?.name ?? 'Unassigned'}
                  {account.department?.archivedAt ? ' (ARCHIVED)' : ''}
                </p>
              </div>
              <div className="directory-state">
                <strong>
                  {account.role.replaceAll('_', ' ').toLowerCase()}
                </strong>
                <span>
                  {account.status === 'ACTIVE' ? 'Active' : 'Inactive'} &#183;{' '}
                  {account.activatedAt ? 'Activated' : 'Pending activation'}
                </span>
              </div>
              {manageableRoles(role).includes(account.role) && (
                <ActionMenu
                  label={`Actions for ${account.displayName ?? account.username}`}
                >
                  {manageableRoles(role).includes(account.role) && (
                    <button
                      className="button secondary"
                      onClick={() => setEditing(account)}
                    >
                      Edit account
                    </button>
                  )}
                  {manageableRoles(role).includes(account.role) && (
                    <button
                      className="button secondary"
                      onClick={() => setChangingRole(account)}
                    >
                      Change role
                    </button>
                  )}
                  {manageableRoles(role).includes(account.role) && (
                    <button
                      className="button secondary"
                      onClick={() =>
                        setSpecialties(
                          specialties === account.id ? null : account.id,
                        )
                      }
                    >
                      Manage specialties
                    </button>
                  )}
                  {manageableRoles(role).includes(account.role) &&
                    account.status === 'ACTIVE' && (
                      <button
                        className="button secondary"
                        disabled={sending !== null}
                        onClick={async () => {
                          setSending(account.id)
                          try {
                            const { data } = await api.post<{
                              delivery: string
                            }>(
                              `/auth/accounts/${account.id}/${account.activatedAt ? 'reset-password' : 'resend-activation'}`,
                            )
                            if (data.delivery === 'FAILED')
                              toast.error(
                                'Email delivery failed. Please retry later.',
                              )
                            else if (data.delivery === 'NOT_SENT')
                              toast.info(
                                'Please wait at least one minute before resending. Account must be eligible.',
                              )
                            else
                              toast.success(
                                'Instructions sent to the account email.',
                              )
                          } catch (error) {
                            toast.error(
                              getApiErrorMessage(
                                error,
                                'Could not send instructions.',
                              ),
                            )
                          } finally {
                            setSending(null)
                          }
                        }}
                      >
                        {sending === account.id
                          ? 'Sending...'
                          : account.activatedAt
                            ? 'Send password reset'
                            : 'Resend activation'}
                      </button>
                    )}
                  {manageableRoles(role).includes(account.role) && (
                    <button
                      className="button secondary"
                      onClick={() => setTarget(account)}
                    >
                      {account.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                    </button>
                  )}
                </ActionMenu>
              )}
              {manageableRoles(role).includes(account.role) &&
                specialties === account.id && (
                  <AgentSpecialties
                    id={account.id}
                    canAdd={
                      account.role === 'AGENT' &&
                      account.status === 'ACTIVE' &&
                      !!account.activatedAt
                    }
                  />
                )}
            </article>
          ))
        ) : (
          <EmptyState title="No matching accounts">
            <p>Try a different search or filter.</p>
          </EmptyState>
        )}
        <ListContinuation resource={resource} />
      </section>
      {changingRole && (
        <ChangeRoleForm
          account={changingRole}
          caller={role}
          onClose={() => setChangingRole(null)}
          onReload={reload}
          onResult={(teams) => {
            setManagerlessTeams(teams)
            toast.success(
              changingRole.activatedAt
                ? 'Role changed. Fresh sign-in required.'
                : 'Role changed. Resend activation instructions from the directory.',
            )
          }}
        />
      )}
      {editing && (
        <EditAccountForm
          account={editing}
          onClose={() => setEditing(null)}
          onReload={reload}
          onDone={() => {
            toast.success('Account updated')
            reload()
          }}
        />
      )}
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
          submit={async () => {
            const result = await updateAccountStatus(
              target.id,
              target.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
            )
            setManagerlessTeams(result.managerlessTeams ?? [])
          }}
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
              ACTIVE status permits sign-in only after account activation.
              Previous sessions and responsibilities are not restored.
            </p>
          )}
        </AdminDialog>
      )}
    </div>
  )
}
