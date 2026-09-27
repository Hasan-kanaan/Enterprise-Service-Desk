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
  const [username, setUsername] = useState(''),
    [email, setEmail] = useState(''),
    [phoneNumber, setPhoneNumber] = useState(''),
    [role, setRole] = useState<UserRole | ''>('')
  return (
    <AdminDialog
      title="Create account"
      onClose={onClose}
      onDone={onDone}
      onReload={onReload}
      valid={
        username.trim().length >= 3 &&
        !!email.trim() &&
        roles.includes(role as UserRole)
      }
      submit={() =>
        createAccount({
          username: username.trim(),
          email: email.trim(),
          ...(phoneNumber.trim() ? { phoneNumber: phoneNumber.trim() } : {}),
          role: role as UserRole,
        })
      }
    >
      <label className="field">
        Username
        <input
          aria-label="Account username"
          required
          minLength={3}
          maxLength={50}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="off"
        />
      </label>
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
      <label className="field">
        Phone number (optional)
        <input aria-label="Account phone" type="tel" placeholder="+961..." value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} />
        <span className="quiet-note">Unverified. Not used for sign-in or password recovery.</span>
      </label>
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
