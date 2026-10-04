import { useState } from 'react'
import { AdminDialog } from './AdminDialog'
import {
  manageableRoles,
  type Account,
  type Reference,
} from '@/types/administration'
import type { UserRole } from '@/types/auth'
import { changeAccountRole } from '@/services/users.service'

export function ChangeRoleForm({
  account,
  caller,
  onClose,
  onReload,
  onResult,
}: {
  account: Account
  caller: UserRole
  onClose: () => void
  onReload: () => void
  onResult: (teams: Reference[]) => void
}) {
  const [role, setRole] = useState<UserRole | ''>('')
  const choices = manageableRoles(caller).filter(
    (value) => value !== account.role,
  )
  return (
    <AdminDialog
      title="Change role"
      onClose={onClose}
      onReload={onReload}
      onDone={onReload}
      valid={choices.includes(role as UserRole)}
      submit={async () => {
        const result = await changeAccountRole(account.id, role as UserRole)
        onResult(result.managerlessTeams)
      }}
    >
      <p>
        {account.displayName ?? account.username} — current role: {account.role}
      </p>
      <label className="field">
        New role
        <select
          aria-label="New role"
          value={role}
          required
          onChange={(event) => setRole(event.target.value as UserRole)}
        >
          <option value="">Choose role</option>
          {choices.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
      {account.role === 'AGENT' && (
        <div className="notice">
          <strong>Leaving the Agent role</strong>
          <ul className="consequence-list">
            <li>
              Current Agent assignments and all current-cycle Agent subtask
              links will be cleared, including completed and cancelled work.
            </li>
            <li>Team Lead and Team memberships will be removed.</li>
          </ul>
          <p>
            Specialties, completion credit, history and requester tickets
            remain.
          </p>
        </div>
      )}
      {account.role === 'MANAGER' && (
        <div className="notice">
          <strong>Leaving the Manager role</strong>
          <ul className="consequence-list">
            <li>Current Manager-owned operational tickets return to intake.</li>
            <li>
              TeamManager relationships are removed. Affected active regional
              Teams may require a new Manager.
            </li>
          </ul>
          <p>History and requester tickets remain.</p>
        </div>
      )}
      <p className="muted">
        All sessions and unused activation/reset links will be revoked. The user
        must sign in again. No replacement responsibilities are assigned.
      </p>
      {!account.activatedAt && (
        <p className="notice">
          This account is pending activation. After the change, use Resend
          activation to issue fresh instructions.
        </p>
      )}
    </AdminDialog>
  )
}
