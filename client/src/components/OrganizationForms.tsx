import { useState } from 'react'
import { OrganizationPeoplePicker } from './OrganizationPeoplePicker'
import { AdminDialog } from './AdminDialog'
import { getApiErrorMessage, getApiStatus } from '@/services/api'
import { requiresAdministrationReload } from './admin-conflict'
import type { Catalog, Reference, Team } from '@/types/administration'
import {
  createReference,
  changeTeamCoverage,
  maintainOrganization,
  createTeam,
  addMember,
  removeMember,
  setTeamLead,
  removeTeamLead,
  setTeamManager,
  removeTeamManager,
} from '@/services/administration.service'
type Callbacks = {
  onClose: () => void
  onDone: () => void
  onReload: () => void
}
export function OrganizationCreateForm({
  kind,
  regions,
  ...callbacks
}: { kind: Catalog | 'teams'; regions: Reference[] } & Callbacks) {
  const [name, setName] = useState(''),
    [scope, setScope] = useState<'' | 'REGION' | 'GLOBAL'>(''),
    [region, setRegion] = useState<number | null>(null)
  return (
    <AdminDialog
      presentation="drawer"
      title={`Create ${kind === 'teams' ? 'team' : kind === 'specialties' ? 'specialty' : kind.slice(0, -1)}`}
      {...callbacks}
      valid={
        !!name.trim() &&
        (kind !== 'teams' ||
          (!!scope && (scope === 'GLOBAL' || region !== null)))
      }
      submit={() =>
        kind === 'teams'
          ? createTeam(name.trim(), scope as 'REGION' | 'GLOBAL', region)
          : createReference(kind, name.trim())
      }
    >
      <label className="field">
        Name
        <input
          aria-label="Organization name"
          required
          maxLength={kind === 'teams' ? 150 : 100}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      {kind === 'teams' && (
        <>
          <label className="field">
            Coverage
            <select
              aria-label="Team coverage"
              required
              value={scope}
              onChange={(e) => setScope(e.target.value as typeof scope)}
            >
              <option value="">Choose coverage</option>
              <option value="REGION">REGION</option>
              <option value="GLOBAL">GLOBAL</option>
            </select>
          </label>
          {scope === 'REGION' && (
            <label className="field">
              Region
              <select
                aria-label="Team region"
                required
                value={region ?? ''}
                onChange={(e) => setRegion(Number(e.target.value) || null)}
              >
                <option value="">Choose region</option>
                {regions
                  .filter((item) => !item.archivedAt)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {scope === 'GLOBAL' && (
            <p className="quiet-note">
              Global coverage includes all regions. No region record is
              assigned.
            </p>
          )}
        </>
      )}
    </AdminDialog>
  )
}
export function TeamCoverageForm({
  team,
  regions,
  ...callbacks
}: { team: Team; regions: Reference[] } & Callbacks) {
  const activeRegions = regions.filter((region) => !region.archivedAt)
  const [scope, setScope] = useState(team.scope)
  const [regionId, setRegionId] = useState<number | null>(
    activeRegions.some((region) => region.id === team.regionId)
      ? team.regionId
      : null,
  )
  return (
    <AdminDialog
      presentation="drawer"
      title="Change coverage"
      {...callbacks}
      valid={
        scope === 'GLOBAL' ||
        activeRegions.some((region) => region.id === regionId)
      }
      submit={() => changeTeamCoverage(team.id, scope, regionId)}
    >
      <p className="quiet-note">
        Changing coverage affects future routing eligibility. Existing ticket
        assignments, memberships, responsibilities, specialties and history are
        preserved.
      </p>
      <label className="field">
        Coverage
        <select
          aria-label="Team coverage"
          value={scope}
          onChange={(event) => {
            const next = event.target.value as typeof scope
            setScope(next)
            if (next === 'GLOBAL') setRegionId(null)
          }}
        >
          <option value="GLOBAL">GLOBAL</option>
          <option value="REGION">REGION</option>
        </select>
      </label>
      {scope === 'REGION' && (
        <label className="field">
          Region
          <select
            aria-label="Team region"
            required
            value={regionId ?? ''}
            onChange={(event) =>
              setRegionId(Number(event.target.value) || null)
            }
          >
            <option value="">Choose active region</option>
            {activeRegions.map((region) => (
              <option key={region.id} value={region.id}>
                {region.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="quiet-note">
        {scope === 'GLOBAL'
          ? 'GLOBAL Teams may be selected by any responsible Manager for future routing.'
          : 'REGION Teams may be selected for future routing only by their organizational TeamManager.'}
      </p>
    </AdminDialog>
  )
}

export type TeamAction = {
  kind:
    | 'member'
    | 'lead'
    | 'manager'
    | 'remove-member'
    | 'remove-lead'
    | 'remove-manager'
  userId?: number
  displayName?: string
}
export function TeamActionForm({
  team,
  action,
  ...callbacks
}: {
  team: Team
  action: TeamAction
} & Callbacks) {
  const [person, setPerson] = useState<number | number[] | null>(action.kind === 'member' ? [] : null)
  const removing = action.kind.startsWith('remove-')
  const labels = {
    member: 'Add team member',
    lead: 'Assign Team Lead',
    manager: 'Assign TeamManager',
    'remove-member': 'Remove team member',
    'remove-lead': 'Remove Team Lead',
    'remove-manager': 'Remove TeamManager',
  }
  return (
    <AdminDialog
      title={labels[action.kind]}
      {...callbacks}
      valid={removing || (action.kind === 'member' ? Array.isArray(person) && person.length > 0 : typeof person === 'number')}
      submit={async () => {
        switch (action.kind) {
          case 'member': {
            const results = await Promise.allSettled((person as number[]).map(id => addMember(team.id, id)))
            const failed = results.flatMap((result, index) => result.status === 'rejected' ? [(person as number[])[index]] : [])
            if (failed.length) {
              const staleFailure = results.find(
                (result) =>
                  result.status === 'rejected' &&
                  requiresAdministrationReload(
                    getApiStatus(result.reason),
                    getApiErrorMessage(result.reason, ''),
                  ),
              )
              if (staleFailure?.status === 'rejected') throw staleFailure.reason
              throw new Error(`${results.length - failed.length} added; ${failed.length} could not be added. Reload the team and try again.`)
            }
            return
          }
          case 'lead':
            return setTeamLead(team.id, person as number)
          case 'manager':
            return setTeamManager(team.id, person as number)
          case 'remove-member':
            return removeMember(team.id, action.userId!)
          case 'remove-lead':
            return removeTeamLead(team.id)
          case 'remove-manager':
            return removeTeamManager(team.id)
        }
      }}
    >
      {!removing && (
        <div className="team-action-context" aria-label="Team details">
          <strong>{team.name}</strong>
          <span>{team.scope === 'GLOBAL' ? 'Global coverage · all regions' : `Region · ${team.region?.name ?? 'Region unavailable'}`}</span>
        </div>
      )}
      {removing ? (
        <p className="notice warning">
          Confirm removal of{' '}
          {action.kind === 'remove-member'
            ? action.displayName ?? 'this member'
            : action.kind === 'remove-lead'
              ? team.teamLead?.displayName
              : team.managers[0]?.manager.displayName}{' '}
          from this organizational responsibility. No replacement will be
          selected.
        </p>
      ) : (
        <OrganizationPeoplePicker
          teamId={team.id}
          purpose={action.kind as 'member' | 'lead' | 'manager'}
          value={person}
          onChange={setPerson}
        />
      )}
      {action.kind.includes('manager') && (
        <p className="notice warning">
          TeamManager is organizational only. This does not assign tickets or
          grant service-desk authority. Managers do not need Team membership. Remove an existing TeamManager before
          assigning another.
        </p>
      )}
      {action.kind === 'lead' && (
        <p className="notice warning">
          Only active, fully activated Agents on this team who do not already
          lead another team are eligible. Each Agent may lead one team. This
          replaces the team's current lead, if any.
        </p>
      )}
      {action.kind === 'remove-member' && (
        <p className="muted">
          Membership removal clears the Agent from current operational
          assignments in this Team. Team, Manager, status and historical
          evidence remain; no replacement is selected. The Team Lead
          responsibility must be removed first for a lead member.
        </p>
      )}
    </AdminDialog>
  )
}

export type MaintenanceAction = {
  catalog: Catalog | 'teams'
  record: Reference
  kind: 'rename' | 'archive' | 'reactivate'
}
export function OrganizationMaintenanceForm({
  action,
  ...callbacks
}: { action: MaintenanceAction } & Callbacks) {
  const [name, setName] = useState(action.record.name)
  const label = action.kind[0].toUpperCase() + action.kind.slice(1)
  return (
    <AdminDialog
      presentation={action.kind === 'rename' ? 'drawer' : 'modal'}
      title={`${label} ${action.record.name}`}
      {...callbacks}
      valid={action.kind !== 'rename' || !!name.trim()}
      submit={() =>
        maintainOrganization(
          action.catalog,
          action.record.id,
          action.kind,
          name.trim(),
        )
      }
    >
      {action.kind === 'rename' ? (
        <label className="field">
          Name
          <input
            aria-label="Organization name"
            required
            maxLength={action.catalog === 'teams' ? 150 : 100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      ) : action.kind === 'archive' ? (
        <p className="notice warning">
          Confirm archival. This record will be unavailable for new selections.
          Historical records and references remain intact.
          {action.catalog === 'teams' &&
            ' Current Team/Agent operational assignments may be cleared. Team Lead and TeamManager responsibility will be removed. No replacement is selected.'}
        </p>
      ) : (
        <p className="notice warning">
          Restore eligibility for future selections. Previously cleared
          assignments, Team Lead and TeamManager responsibilities will not be
          restored.
        </p>
      )}
    </AdminDialog>
  )
}
