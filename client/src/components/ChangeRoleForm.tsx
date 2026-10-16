import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'
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
        {account.displayName} — current role: {account.role}
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
        <div className="account-lifecycle-warning">
          <strong><TriangleAlert size={18} aria-hidden="true" />Leaving the Agent role</strong>
          <ul className="consequence-list">
            <li>
              Current primary Agent assignments will be cleared. Subtask
              assignments in the current work cycle will also be cleared,
              including completed and cancelled subtasks.
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
        <div className="account-lifecycle-warning">
          <strong><TriangleAlert size={18} aria-hidden="true" />Leaving the Manager role</strong>
          <ul className="consequence-list">
            <li>Current Manager-owned operational tickets return to intake.</li>
            <li>
              Team Manager responsibilities are removed. Affected active regional
              Teams may require a new Manager.
            </li>
          </ul>
          <p>History and requester tickets remain.</p>
        </div>
      )}
      <p className="muted">
        All sessions and unused activation/reset links will be revoked. The user
        must sign in again. No replacement person is selected automatically.
      </p>
      {!account.activatedAt && (
        <p className="notice">
          This account has not been activated yet. Changing the role will
          invalidate its current activation link. After the role change, send
          new activation instructions to the user using Resend activation.
        </p>
      )}
    </AdminDialog>
  )
}
