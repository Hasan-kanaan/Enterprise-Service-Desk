import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useResource } from '@/hooks/useResource'
import { getOrganization } from '@/services/administration.service'
import { listAccounts } from '@/services/users.service'
import { ErrorState, LoadingState, EmptyState } from '@/components/TicketUI'
import {
  OrganizationCreateForm,
  TeamActionForm,
  type TeamAction,
} from '@/components/OrganizationForms'
import type { Catalog } from '@/types/administration'
const load = async (signal: AbortSignal) => {
  const [organization, accounts] = await Promise.all([
    getOrganization(signal),
    listAccounts(signal),
  ])
  return { ...organization, accounts }
}
export function OrganizationPage() {
  const { teamId } = useParams()
  const resource = useResource(load)
  const [tab, setTab] = useState<Catalog | 'teams'>('teams'),
    [creating, setCreating] = useState(false),
    [action, setAction] = useState<TeamAction | null>(null)
  const reload = () => {
    setCreating(false)
    setAction(null)
    resource.reload()
  }
  const done = () => {
    toast.success('Organization updated')
    reload()
  }
  if (resource.loading) return <LoadingState label="Loading organization..." />
  if (resource.error || !resource.data)
    return (
      <ErrorState
        error={resource.error}
        resourceName="organization"
        onRetry={reload}
      />
    )
  const data = resource.data
  const team = teamId
    ? data.teams.find((item) => item.id === Number(teamId))
    : null
  if (teamId && !team)
    return (
      <div className="panel empty-state">
        <h1>Team not found</h1>
        <Link to="/admin/organization" className="button secondary">
          Back to organization
        </Link>
      </div>
    )
  return (
    <div className="ticket-workspace">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>{team ? team.name : 'Organization'}</h1>
          <p className="muted">
            {team
              ? 'Membership and organizational responsibilities.'
              : 'Regions, departments, specialties and team coverage.'}
          </p>
        </div>
        <button className="button secondary" onClick={reload}>
          Refresh organization
        </button>
      </header>
      {team ? (
        <>
          <Link className="back-link" to="/admin/organization">
            Back to organization
          </Link>
          <section className="panel detail-body">
            <dl className="metadata-grid">
              <div>
                <dt>Coverage</dt>
                <dd>
                  {team.scope === 'GLOBAL'
                    ? 'GLOBAL - all regions'
                    : `REGION - ${team.region?.name ?? 'Name unavailable'}`}
                </dd>
              </div>
              <div>
                <dt>Specialties</dt>
                <dd>
                  {team.specialties
                    .map((item) => item.specialty.name)
                    .join(', ') || 'None assigned'}
                </dd>
              </div>
            </dl>
          </section>
          <section className="panel">
            <div className="list-heading">
              <h2>Team members</h2>
              <button
                className="button secondary"
                onClick={() => setAction({ kind: 'member' })}
              >
                Add member
              </button>
            </div>
            {team.members.length ? (
              team.members.map((member) => (
                <article className="admin-row" key={member.userId}>
                  <div>
                    <h3>{member.user.username}</h3>
                    <p className="muted">
                      {member.user.role} / {member.user.status}
                    </p>
                    {member.userId === team.teamLeadId && (
                      <p className="quiet-note">
                        Remove Team Lead responsibility before removing
                        membership.
                      </p>
                    )}
                  </div>
                  <button
                    className="button secondary"
                    disabled={member.userId === team.teamLeadId}
                    onClick={() =>
                      setAction({
                        kind: 'remove-member',
                        userId: member.userId,
                      })
                    }
                  >
                    Remove member
                  </button>
                </article>
              ))
            ) : (
              <p className="detail-body muted">No members assigned.</p>
            )}
          </section>
          <div className="form-columns">
            <section className="panel detail-body">
              <h2>Team Lead</h2>
              <p className="muted">{team.teamLead?.username ?? 'Unassigned'}</p>
              <div className="button-row">
                <button
                  className="button secondary"
                  onClick={() => setAction({ kind: 'lead' })}
                >
                  Assign Team Lead
                </button>
                {team.teamLead && (
                  <button
                    className="button secondary"
                    onClick={() => setAction({ kind: 'remove-lead' })}
                  >
                    Remove Team Lead
                  </button>
                )}
              </div>
            </section>
            <section className="panel detail-body">
              <h2>TeamManager</h2>
              <p className="muted">
                {team.managers[0]?.manager.username ?? 'Unassigned'}
              </p>
              <p className="quiet-note">
                Organizational responsibility only; no ticket authority.
              </p>
              {team.managers.length ? (
                <button
                  className="button secondary"
                  onClick={() => setAction({ kind: 'remove-manager' })}
                >
                  Remove TeamManager
                </button>
              ) : (
                <button
                  className="button secondary"
                  onClick={() => setAction({ kind: 'manager' })}
                >
                  Assign TeamManager
                </button>
              )}
            </section>
          </div>
          <p className="quiet-note">
            Team coverage, names and specialty links cannot be edited here
            because the current API does not support those changes.
          </p>
          {action && (
            <TeamActionForm
              key={`${team.id}-${action.kind}`}
              team={team}
              teams={data.teams}
              accounts={data.accounts}
              action={action}
              onClose={() => setAction(null)}
              onReload={reload}
              onDone={done}
            />
          )}
        </>
      ) : (
        <>
          <nav className="button-row" aria-label="Organization catalogs">
            {(['teams', 'regions', 'departments', 'specialties'] as const).map(
              (value) => (
                <button
                  key={value}
                  className={`button ${tab === value ? 'primary' : 'secondary'}`}
                  aria-pressed={tab === value}
                  onClick={() => setTab(value)}
                >
                  {value[0].toUpperCase() + value.slice(1)}
                </button>
              ),
            )}
          </nav>
          <section className="panel">
            <div className="list-heading">
              <h2>{tab[0].toUpperCase() + tab.slice(1)}</h2>
              <button
                className="button primary"
                onClick={() => setCreating(true)}
              >
                Create{' '}
                {tab === 'teams'
                  ? 'team'
                  : tab === 'specialties'
                    ? 'specialty'
                    : tab.slice(0, -1)}
              </button>
            </div>
            {data[tab].length ? (
              data[tab].map((item) => (
                <div className="admin-row" key={item.id}>
                  {tab === 'teams' ? (
                    <Link
                      className="text-button"
                      to={`/admin/organization/teams/${item.id}`}
                    >
                      {item.name}
                    </Link>
                  ) : (
                    <span>{item.name}</span>
                  )}
                </div>
              ))
            ) : (
              <EmptyState title="No records yet">
                <p>Create a real organization record to get started.</p>
              </EmptyState>
            )}
          </section>
          <p className="quiet-note">
            Regions and departments are independent. Departments are not tied to
            a region. Rename/delete and specialty-link editing are not supported
            by the current API.
          </p>
          {creating && (
            <OrganizationCreateForm
              kind={tab}
              regions={data.regions}
              onClose={() => setCreating(false)}
              onReload={reload}
              onDone={done}
            />
          )}
        </>
      )}
    </div>
  )
}
