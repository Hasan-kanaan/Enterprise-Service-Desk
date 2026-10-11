import { PhoneField } from './PhoneField'
import { useState } from 'react'
import { AdminDialog } from './AdminDialog'
import { createAccount } from '@/services/users.service'
import { creatableRoles } from '@/types/administration'
import type { UserRole } from '@/types/auth'
export function AccountForm({
  caller,
  onClose,
  onDone,
  onReload,
}: {
  caller: UserRole
  onClose: () => void
  onDone: () => void
  onReload: () => void
}) {
  const roles = creatableRoles(caller)
  const [email, setEmail] = useState(''),
    [phoneNumber, setPhoneNumber] = useState(''),
    [role, setRole] = useState<UserRole | ''>('')
  const [phoneValid, setPhoneValid] = useState(true)
  const [displayName, setDisplayName] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  return (
    <AdminDialog
      presentation="drawer"
      title="Create account"
      onClose={onClose}
      onDone={onDone}
      onReload={onReload}
      valid={
        phoneValid &&
        !!displayName.trim() && !!jobTitle.trim() &&
        !!email.trim() &&
        roles.includes(role as UserRole)
      }
      submit={() =>
        createAccount({
          displayName: displayName.trim(), jobTitle: jobTitle.trim(),
          email: email.trim(),
          ...(phoneNumber.trim() ? { phoneNumber: phoneNumber.trim() } : {}),
          role: role as UserRole,
        })
      }
    >
      <label className="field">Display name<input aria-label="Account display name" maxLength={100} value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></label>
      <label className="field">Job title<input aria-label="Account job title" maxLength={100} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} /></label>
      <label className="field">
        Email
        <input
          aria-label="Account email"
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="off"
        />
      </label>
      <PhoneField value={phoneNumber} onChange={setPhoneNumber} onValidityChange={setPhoneValid} />
      <p>The user will receive an activation email to choose their own password.</p>
      <label className="field">
        Role
        <select
          aria-label="Account role"
          required
          value={role}
          onChange={(e) => setRole(e.target.value as UserRole)}
        >
          <option value="">Select role</option>
          {roles.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
    </AdminDialog>
  )
}
