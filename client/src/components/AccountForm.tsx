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
    [password, setPassword] = useState(''),
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
        password.length >= 8 &&
        roles.includes(role as UserRole)
      }
      submit={() =>
        createAccount({
          username: username.trim(),
          email: email.trim(),
          password,
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
        Initial password
        <input
          aria-label="Account password"
          required
          type="password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
        <span className="quiet-note">
          At least 8 characters. Share credentials through your approved secure
          channel.
        </span>
      </label>
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
