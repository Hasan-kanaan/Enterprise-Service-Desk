import { TriangleAlert } from 'lucide-react'
import type { UserRole } from '@/types/auth'

export function DeactivationConsequences({ role }: { role: UserRole }) {
  return <div className="account-lifecycle-warning">
    <strong><TriangleAlert size={18} aria-hidden="true" />Deactivating this account</strong>
    <p>The user will lose authenticated access while inactive. Active sessions,
      refresh tokens and unused activation/reset links will be revoked.</p>
    {role === 'AGENT' && <ul className="consequence-list">
      <li>Current primary Agent assignments and pending or in-progress subtask
        assignments in the current work cycle will be cleared.</li>
      <li>Team Lead responsibility will be removed. Team memberships,
        specialties and completed or cancelled subtask assignments remain.</li>
    </ul>}
    {role === 'MANAGER' && <ul className="consequence-list">
      <li>Current managed operational tickets will return to intake.</li>
      <li>Any Team Manager responsibilities will be removed. Affected active
        regional Teams may need another Manager.</li>
    </ul>}
    <p>Historical attribution, completion credit and requester history remain.
      No replacement person is selected automatically.</p>
  </div>
}
