import { RefreshSurface } from '@/components/RefreshSurface'
import { ActionMenu } from '@/components/ActionMenu'
import { SpecialtyLinks } from '@/components/SpecialtyLinks'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useResource } from '@/hooks/useResource'
import { getOrganization } from '@/services/administration.service'
import { usePagedList, useDebouncedValue } from '@/hooks/usePagedList'
import { ListContinuation } from '@/components/ListContinuation'
import { MultiSelectFilter } from '@/components/MultiSelectFilter'
import type { Account } from '@/types/administration'
import { ErrorState, LoadingState, EmptyState } from '@/components/TicketUI'
import {
  OrganizationCreateForm,
  OrganizationMaintenanceForm,
  type MaintenanceAction,
  TeamActionForm,
  TeamCoverageForm,
  type TeamAction,
} from '@/components/OrganizationForms'
import type { Catalog } from '@/types/administration'
export function OrganizationPage() {
  const { teamId } = useParams()
  const [params, setParams] = useSearchParams()
  const needsManager = params.get('needsManager') === 'true'
  const resource = useResource(getOrganization)
  const [tab, setTab] = useState<Catalog | 'teams'>('teams'),
    [creating, setCreating] = useState(false),
    [action, setAction] = useState<TeamAction | null>(null)
  const [maintenance, setMaintenance] = useState<MaintenanceAction | null>(null)
  const [coverage, setCoverage] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')
  const [memberSpecialtyIds, setMemberSpecialtyIds] = useState<string[]>([])
  const [memberRegionIds, setMemberRegionIds] = useState<string[]>([])
  const [memberDepartmentIds, setMemberDepartmentIds] = useState<string[]>([])
  const search = useDebouncedValue(memberSearch)
  const members = usePagedList<Account>(
    teamId ? `/organization/teams/${teamId}/members` : null,
    {
      search: search || undefined,
      ...(memberSpecialtyIds.length
        ? { specialtyIds: memberSpecialtyIds.join(',') }
        : {}),
      ...(memberRegionIds.length
        ? { regionIds: memberRegionIds.join(',') }
        : {}),
      ...(memberDepartmentIds.length
        ? { departmentIds: memberDepartmentIds.join(',') }
        : {}),
    },
  )
  const reload = () => {
    setCoverage(false)
    members.reload()
    setMaintenance(null)
    setCreating(false)
    setAction(null)
    resource.reload()
  }
  const done = () => {
    toast.success('Organization updated')
    reload()
  }
  if (resource.loading && !resource.data) return <LoadingState variant="page" label="Loading organization..." />
  if (resource.error || !resource.data)
    return (
      <ErrorState
        error={resource.error}
        resourceName="organization"
        onRetry={reload}
      />
    )
  const organization = resource.data
  const data = {
    ...organization,
    teams: needsManager
      ? organization.teams.filter(
          (team) =>
            team.scope === 'REGION' &&
            !team.archivedAt &&
            team.managers.length === 0,
        )
      : resource.data.teams,
  }
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
    <RefreshSurface busy={!!(resource.loading && resource.data)}><div className="ticket-workspace">
      <header className="page-heading">
        <div>
          <h1>{team ? team.name : 'Organization'}</h1>
          <p className="muted">
            {team
              ? 'Membership and organizational responsibilities.'
              : 'Regions, departments, specialties and team coverage.'}
          </p>
        </div>
      </header>
      {needsManager && (
        <p className="notice warning">
          Active regional Teams requiring a Manager.{' '}
          <button className="text-button" onClick={() => setParams({})}>
            Show all Teams
          </button>
        </p>
      )}
      {team ? (
        <>
          <Link className="back-link" to="/admin/organization">
            Back to organization
          </Link>
          <p className="quiet-note">
            {team.archivedAt ? 'Archived Team' : 'Active Team'}
          </p>
          <section className="panel detail-body">
            <h2>Identity and coverage</h2>
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
            <button
              className="button secondary"
              onClick={() => setCoverage(true)}
            >
              Change coverage
            </button>
          </section>
          <SpecialtyLinks
            kind="teams"
            id={team.id}
            canAdd={!team.archivedAt}
            existing={team.specialties.map((link) => link.specialty)}
            choices={data.specialties}
            onReload={reload}
          />
          <div className="form-columns team-responsibilities">
            <section className="panel detail-body">
              <h2>Team Lead</h2>
              <p className="muted">{team.teamLead?.displayName ?? 'Unassigned'}</p>
              <div className="button-row">
                <button
                  className="button secondary"
                  disabled={!!team.archivedAt}
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
              <h2>Manager</h2>
              <p className="muted">
                {team.managers[0]?.manager.displayName ?? 'Unassigned'}
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
                  disabled={!!team.archivedAt}
                  onClick={() => setAction({ kind: 'manager' })}
                >
                  Assign TeamManager
                </button>
              )}
            </section>
          </div>
          <section className="panel">
            <div className="list-heading">
              <h2>Team members</h2>
              <button
                className="button secondary"
                disabled={!!team.archivedAt}
                onClick={() => setAction({ kind: 'member' })}
              >
                Add member
              </button>
            </div>
            <div className="team-member-toolbar">
              <label className="search-field team-member-search">
                <input
                  type="search"
                  aria-label="Search team members"
                  maxLength={120}
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Search by name or email"
                />
              </label>
              <MultiSelectFilter
                label="Member specialties"
                allLabel="All specialties"
                selected={memberSpecialtyIds}
                onChange={setMemberSpecialtyIds}
                options={data.specialties.map((specialty) => ({
                  value: String(specialty.id),
                  label: specialty.archivedAt
                    ? `${specialty.name} (archived)`
                    : specialty.name,
                }))}
              />
              <MultiSelectFilter
                label="Member regions"
                allLabel="All regions"
                selected={memberRegionIds}
                onChange={setMemberRegionIds}
                options={data.regions.map((region) => ({
                  value: String(region.id),
                  label: region.archivedAt
                    ? `${region.name} (archived)`
                    : region.name,
                }))}
              />
              <MultiSelectFilter
                label="Member departments"
                allLabel="All departments"
                selected={memberDepartmentIds}
                onChange={setMemberDepartmentIds}
                options={data.departments.map((department) => ({
                  value: String(department.id),
                  label: department.archivedAt
                    ? `${department.name} (archived)`
                    : department.name,
                }))}
              />
            </div>
            {members.loading && !members.items.length ? (
              <LoadingState label="Loading team members..." />
            ) : members.error && !members.items.length ? (
              <ErrorState error={members.error} onRetry={members.retry} />
            ) : members.items.length ? (
              <div
                className="team-members-table-wrap"
                role="region"
                aria-label={`${team.name} members`}
                tabIndex={0}
              >
                <table className="team-members-table">
                  <colgroup>
                    <col className="team-member-name-column" />
                    <col className="team-member-email-column" />
                    <col className="team-member-specialties-column" />
                    <col className="team-member-region-column" />
                    <col className="team-member-department-column" />
                    <col className="team-member-status-column" />
                    <col className="team-member-actions-column" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th scope="col">Member</th>
                      <th scope="col">Email</th>
                      <th scope="col">Specialties</th>
                      <th scope="col">Region</th>
                      <th scope="col">Department</th>
                      <th scope="col">Status</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.items.map((member) => {
                      const otherLeadTeam = organization.teams.find(
                        (candidate) =>
                          candidate.id !== team.id &&
                          candidate.teamLeadId === member.id,
                      )
                      const leadLabel =
                        member.id === team.teamLeadId
                          ? 'Team Lead'
                          : otherLeadTeam
                            ? `Team Lead · ${otherLeadTeam.name}`
                            : null
                      return (
                        <tr className="admin-row team-member-row" key={member.id}>
                          <th scope="row">
                            <span>{member.displayName}</span>
                            {leadLabel && (
                              <small className="team-member-lead">
                                {leadLabel}
                              </small>
                            )}
                          </th>
                          <td className="team-member-email">{member.email}</td>
                          <td>
                            <SpecialtyBadges
                              specialties={member.specialties ?? []}
                            />
                          </td>
                          <td>{member.region?.name ?? 'Not set'}</td>
                          <td>{member.department?.name ?? 'Not set'}</td>
                          <td>
                            <span
                              className={`team-member-status ${member.status === 'ACTIVE' ? 'active' : 'inactive'}`}
                            >
                              {member.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td>
                            <button
                              className="button secondary"
                              disabled={member.id === team.teamLeadId}
                              onClick={() =>
                                setAction({
                                  kind: 'remove-member',
                                  displayName: member.displayName,
                                  userId: member.id,
                                })
                              }
                            >
                              Remove member
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="detail-body muted">
                {memberSearch.trim() ||
                memberSpecialtyIds.length ||
                memberRegionIds.length ||
                memberDepartmentIds.length
                  ? 'No team members match these filters.'
                  : 'No members assigned.'}
              </p>
            )}
            <ListContinuation resource={members} />
          </section>
          {coverage && (
            <TeamCoverageForm
              key={team.id}
              team={team}
              regions={data.regions}
              onClose={() => setCoverage(false)}
              onReload={reload}
              onDone={done}
            />
          )}
          {action && (
            <TeamActionForm
              key={`${team.id}-${action.kind}`}
              team={team}
              action={action}
              onClose={() => setAction(null)}
              onReload={reload}
              onDone={done}
            />
          )}
        </>
      ) : (
        <>
          <nav className="queue-tabs" aria-label="Organization catalogs">
            {(['teams', 'regions', 'departments', 'specialties'] as const).map(
              (value) => (
                <button
                  key={value}
                  className={tab === value ? 'selected' : ''}
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
                <div
                  className={`admin-row ${'scope' in item ? 'team-row' : 'catalog-row'} ${'managers' in item && !item.archivedAt && item.scope === 'REGION' && !item.managers.length ? 'needs-manager' : ''}`}
                  key={item.id}
                >
                  {tab === 'teams' ? (
                    <div>
                      <Link
                        className="text-button team-row-link"
                        to={`/admin/organization/teams/${item.id}`}
                      >
                        {item.name}
                      </Link>
                      {'scope' in item && (
                        <p className="quiet-note">
                          {item.scope === 'GLOBAL'
                            ? 'All regions'
                            : (item.region?.name ?? 'Region unavailable')}
                        </p>
                      )}
                    </div>
                  ) : (
                    <span>{item.name}</span>
                  )}
                  {'managers' in item && (
                    <div className="team-ownership">
                      <span>
                        Manager:{' '}
                        <strong>
                          {item.managers[0]?.manager.displayName ??
                            (item.scope === 'REGION' && !item.archivedAt
                              ? 'Needs Manager'
                              : 'Unassigned')}
                        </strong>
                      </span>
                      <span>
                        Team Lead:{' '}
                        <strong>
                          {item.teamLead?.displayName ?? 'Unassigned'}
                        </strong>
                      </span>
                    </div>
                  )}
                  <span className="small muted">
                    {item.archivedAt ? 'Archived' : 'Active'}
                  </span>
                  <ActionMenu label={`Actions for ${item.name}`}>
                    <button
                      className="button secondary"
                      onClick={() =>
                        setMaintenance({
                          catalog: tab,
                          record: item,
                          kind: 'rename',
                        })
                      }
                    >
                      Rename
                    </button>
                    <button
                      className="button secondary"
                      onClick={() =>
                        setMaintenance({
                          catalog: tab,
                          record: item,
                          kind: item.archivedAt ? 'reactivate' : 'archive',
                        })
                      }
                    >
                      {item.archivedAt ? 'Reactivate' : 'Archive'}
                    </button>
                  </ActionMenu>
                </div>
              ))
            ) : (
              <EmptyState title="No records yet">
                <p>Add a record using the create action above.</p>
              </EmptyState>
            )}
          </section>

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
      {maintenance && (
        <OrganizationMaintenanceForm
          key={`${maintenance.catalog}-${maintenance.record.id}-${maintenance.kind}`}
          action={maintenance}
          onClose={() => setMaintenance(null)}
          onReload={reload}
          onDone={done}
        />
      )}
    </div></RefreshSurface>
  )
}

function SpecialtyBadges({
  specialties,
}: {
  specialties: NonNullable<Account['specialties']>
}) {
  const visible = specialties.slice(0, 2)
  const remaining = specialties.slice(2)
  const remainingNames = remaining.map(({ specialty }) =>
    specialty.archivedAt
      ? `${specialty.name} (archived)`
      : specialty.name,
  )

  if (!specialties.length)
    return <span className="team-member-no-specialties">None</span>

  return (
    <div className="team-specialty-badges">
      {visible.map(({ specialty }) => (
        <span
          className={`team-specialty-badge ${specialty.archivedAt ? 'archived' : ''}`}
          key={specialty.id}
        >
          {specialty.name}
        </span>
      ))}
      {!!remaining.length && (
        <span
          className="team-specialty-more"
          title={remainingNames.join(', ')}
          aria-label={`Additional specialties: ${remainingNames.join(', ')}`}
          tabIndex={0}
        >
          +{remaining.length}
        </span>
      )}
    </div>
  )
}
