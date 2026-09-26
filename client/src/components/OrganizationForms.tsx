import { useState } from 'react'
import { PeopleLookup } from './PeopleLookup'
import { AdminDialog } from './AdminDialog'
import type { Catalog, Reference, Team } from '@/types/administration'
import {
  createReference,
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
                {regions.map((item) => (
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
export type TeamAction = {
  kind:
    | 'member'
    | 'lead'
    | 'manager'
    | 'remove-member'
    | 'remove-lead'
    | 'remove-manager'
  userId?: number
}
export function TeamActionForm({
  team,
  action,
  ...callbacks
}: {
  team: Team
  action: TeamAction
} & Callbacks) {
  const [person, setPerson] = useState<number | null>(null)
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
      valid={removing || person !== null}
      submit={() => {
        switch (action.kind) {
          case 'member':
            return addMember(team.id, person!)
          case 'lead':
            return setTeamLead(team.id, person!)
          case 'manager':
            return setTeamManager(team.id, person!)
          case 'remove-member':
            return removeMember(team.id, action.userId!)
          case 'remove-lead':
            return removeTeamLead(team.id)
          case 'remove-manager':
            return removeTeamManager(team.id)
        }
      }}
    >
      {removing ? (
        <p className="notice">
          Confirm removal of{' '}
          {action.kind === 'remove-member'
            ? `member #${action.userId}`
            : action.kind === 'remove-lead'
              ? team.teamLead?.username
              : team.managers[0]?.manager.username}{' '}
          from this organizational responsibility. No replacement will be
          selected.
        </p>
      ) : (
        <PeopleLookup
          label="Organization assignee"
          value={person}
          onChange={setPerson}
          url={`/organization/teams/${team.id}/people?purpose=${action.kind}`}
        />
      )}
      {action.kind.includes('manager') && (
        <p className="notice">
          TeamManager is organizational only. This does not assign tickets or
          grant service-desk authority. Remove an existing TeamManager before
          assigning another.
        </p>
      )}
      {action.kind === 'lead' && (
        <p className="notice">
          The Team Lead must be an active AGENT member who leads no other team.
          This replaces the team's current lead, if any.
        </p>
      )}
      {action.kind === 'remove-member' && (
        <p className="muted">
          Membership removal does not transfer existing work assignments. The
          Team Lead responsibility must be removed first for a lead member.
        </p>
      )}
    </AdminDialog>
  )
}
