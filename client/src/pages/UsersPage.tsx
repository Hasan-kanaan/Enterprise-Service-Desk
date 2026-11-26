import { Avatar } from '@/components/Avatar'
import { RefreshSurface } from '@/components/RefreshSurface'
import { ActionMenu } from '@/components/ActionMenu'
import { Link } from 'react-router-dom'
import { ChangeRoleForm } from '@/components/ChangeRoleForm'
import { DeactivationConsequences } from '@/components/DeactivationConsequences'
import type { Reference } from '@/types/administration'
import { AgentSpecialties } from '@/components/SpecialtyLinks'
import api, { getApiErrorMessage } from '@/services/api'
import { Fragment, useState } from 'react'
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
import { MultiSelectFilter } from '@/components/MultiSelectFilter'
import { CircleCheck, CircleSlash2, Pencil } from 'lucide-react'
export function UsersPage() {
  const role = useAppSelector((state) => state.auth.user)!.role
  const filters = useListFilters()
  const query = filters.get('search'),
    status = filters.getMany('status'),
    accountRole = filters.getMany('role')
  const search = useDebouncedValue(query)
  const resource = usePagedList<Account>('/users', {
    search: search || undefined,
    status: status.length ? status.join(',') : undefined,
    role: accountRole.length ? accountRole.join(',') : undefined,
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
    <RefreshSurface busy={!!(resource.loading && resource.items.length)}><div className="ticket-workspace">
      <header className="page-heading">
        <div>
          <h1>Accounts</h1>
          <p className="muted">Manage identities and account access.</p>
        </div>
        <div className="button-row">
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
              placeholder="Search display name or email"
              value={query}
              maxLength={120}
              onChange={(e) => filters.set('search', e.target.value)}
            />
          </label>
          <MultiSelectFilter label="Account status filter" allLabel="All statuses" selected={status} onChange={values => filters.setMany('status', values)} options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive' }]} />
          <MultiSelectFilter label="Account role filter" allLabel="All roles" selected={accountRole} onChange={values => filters.setMany('role', values)} options={['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'AGENT', 'EMPLOYEE'].map(value => ({ value, label: value }))} />
        </div>
        {resource.loading && !resource.items.length ? (
          <LoadingState variant="table" label="Loading accounts..." />
        ) : resource.error && !rows.length ? (
          <ErrorState
            error={resource.error}
            resourceName="account directory"
            onRetry={reload}
          />
        ) : rows.length ? (
          <div
            className="account-directory-wrap"
            role="region"
            aria-label="Accounts"
            tabIndex={0}
          >
            <table className="account-directory-table">
              <colgroup>
                <col className="account-column" />
                <col className="account-email-column" />
                <col className="account-department-column" />
                <col className="account-region-column" />
                <col className="account-role-column" />
                <col className="account-status-column" />
                <col className="account-actions-column" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">Account</th>
                  <th scope="col">Email</th>
                  <th scope="col">Department</th>
                  <th scope="col">Region</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                  <th scope="col" aria-label="Account options" />
                </tr>
              </thead>
              <tbody>
                {rows.map((account) => (
                  <Fragment key={account.id}>
                    <tr
                      className="admin-row directory-row"
                      data-account-id={account.id}
                    >
                      <th scope="row">
                        <div className="directory-identity">
                          <Avatar displayName={account.displayName} />
                          <span>
                            {account.displayName}
                            <small>{account.jobTitle ?? 'Job title not set'}</small>
                          </span>
                        </div>
                      </th>
                      <td className="account-email">{account.email}</td>
                      <td>
                        {account.department?.name ?? 'Unassigned'}
                        {account.department?.archivedAt ? ' (ARCHIVED)' : ''}
                      </td>
                      <td>
                        {account.region?.name ?? 'Unassigned'}
                        {account.region?.archivedAt ? ' (ARCHIVED)' : ''}
                      </td>
                      <td className="account-role">
                        {account.role
                          .replaceAll('_', ' ')
                          .toLowerCase()
                          .replace(/\b\w/g, (letter) => letter.toUpperCase())}
                      </td>
                      <td>
                        <div className="directory-state">
                          <span>
                            {account.status === 'ACTIVE' ? 'Active' : 'Inactive'}{' '}
                            &#183;{' '}
                            {account.activatedAt
                              ? 'Verified'
                              : 'Pending verification'}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="directory-actions">
                          {manageableRoles(role).includes(account.role) && (
                            <button
                              type="button"
                              className="button secondary admin-row-icon-action"
                              aria-label={`Edit ${account.displayName}`}
                              title={`Edit ${account.displayName}`}
                              onClick={() => setEditing(account)}
                            >
                              <Pencil size={16} aria-hidden="true" />
                            </button>
                          )}
                          {manageableRoles(role).includes(account.role) && (
                            <ActionMenu
                              label={`More options for ${account.displayName}`}
                            >
                  {manageableRoles(role).includes(account.role) && (
                    <button
                      className="button secondary"
                      title={`Edit ${account.displayName}`}
                      onClick={() => setEditing(account)}
                    >
                      <Pencil size={16} aria-hidden="true" />
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
                              toast.warning(
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
                      className={`button secondary${account.status === 'ACTIVE' ? ' account-deactivate' : ''}`}
                      title={`${account.status === 'ACTIVE' ? 'Deactivate' : 'Activate'} ${account.displayName}`}
                      onClick={() => setTarget(account)}
                    >
                      {account.status === 'ACTIVE' ? (
                        <CircleSlash2 size={16} aria-hidden="true" />
                      ) : (
                        <CircleCheck size={16} aria-hidden="true" />
                      )}
                      {account.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                    </button>
                  )}
                            </ActionMenu>
                          )}
                        </div>
                      </td>
                    </tr>
                    {manageableRoles(role).includes(account.role) &&
                      specialties === account.id && (
                        <tr className="account-specialty-row">
                          <td colSpan={7}>
                            <AgentSpecialties account={account} />
                          </td>
                        </tr>
                      )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
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
          onDone={() => {
            reload()
          }}
        />
      )}
      {target && (
        <AdminDialog
          title={`${target.status === 'ACTIVE' ? 'Deactivate' : 'Activate'} ${target.displayName}?`}
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
            <DeactivationConsequences role={target.role} />
          ) : (
            <p className="notice warning">
              ACTIVE status permits sign-in only after account activation.
              Previous sessions and responsibilities are not restored.
            </p>
          )}
        </AdminDialog>
      )}
    </div></RefreshSurface>
  )
}
