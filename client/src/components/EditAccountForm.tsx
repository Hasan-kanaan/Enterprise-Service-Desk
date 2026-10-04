import { useState } from 'react'
import { AdminDialog } from './AdminDialog'
import { ErrorState, LoadingState } from './TicketUI'
import { useResource } from '@/hooks/useResource'
import api from '@/services/api'
import {
  updateAccount,
  type UpdateAccountInput,
} from '@/services/users.service'
import type { Account, Reference } from '@/types/administration'

const loadChoices = async (signal: AbortSignal) => {
  const [regions, departments] = await Promise.all([
    api.get<Reference[]>('/organization/regions', { signal }),
    api.get<Reference[]>('/organization/departments', { signal }),
  ])
  return { regions: regions.data, departments: departments.data }
}
const label = (item: Reference) =>
  `${item.name}${item.archivedAt ? ' (ARCHIVED)' : ''}`
const choices = (items: Reference[], current?: Reference | null) => {
  const active = items.filter((item) => !item.archivedAt)
  const retained =
    current && (items.find((item) => item.id === current.id) ?? current)
  return retained?.archivedAt ? [retained, ...active] : active
}

export function EditAccountForm({
  account,
  onClose,
  onDone,
  onReload,
}: {
  account: Account
  onClose: () => void
  onDone: () => void
  onReload: () => void
}) {
  const catalogs = useResource(loadChoices)
  const [username, setUsername] = useState(account.username)
  const [phone, setPhone] = useState(account.phoneNumber ?? '')
  const [region, setRegion] = useState(account.region?.id.toString() ?? '')
  const [department, setDepartment] = useState(
    account.department?.id.toString() ?? '',
  )
  const change: UpdateAccountInput = {}
  if (username !== account.username)
    change.username = username.trim().toLowerCase()
  if (phone !== (account.phoneNumber ?? ''))
    change.phoneNumber = phone.trim() || null
  if (region !== (account.region?.id.toString() ?? ''))
    change.regionId = region ? Number(region) : null
  if (department !== (account.department?.id.toString() ?? ''))
    change.departmentId = department ? Number(department) : null
  const [displayName, setDisplayName] = useState(account.displayName ?? '')
  const [jobTitle, setJobTitle] = useState(account.jobTitle ?? '')
  if (displayName !== (account.displayName ?? '')) change.displayName = displayName.trim()
  if (jobTitle !== (account.jobTitle ?? '')) change.jobTitle = jobTitle.trim()
  return (
    <AdminDialog
      title="Edit account"
      onClose={onClose}
      onDone={onDone}
      onReload={onReload}
      valid={
        !!catalogs.data &&
        username.trim().length >= 3 &&
        username.trim().length <= 50 &&
        Object.keys(change).length > 0 && (change.displayName === undefined || !!change.displayName) && (change.jobTitle === undefined || !!change.jobTitle)
      }
      submit={() => updateAccount(account.id, change)}
    >
      <p>Email (read-only): {account.email}</p>
      <p>Current role: {account.role}. This dialog does not edit roles.</p>
      <label className="field">Display name<input aria-label="Account display name" maxLength={100} value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></label>
      <label className="field">Job title<input aria-label="Account job title" maxLength={100} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} /></label>
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
        Phone number (optional)
        <input
          aria-label="Account phone"
          type="tel"
          placeholder="+961..."
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <span className="quiet-note">
          Unverified. Not used for sign-in or password recovery. Leave blank to
          clear.
        </span>
      </label>
      {catalogs.loading ? (
        <LoadingState label="Loading home organization choices..." />
      ) : catalogs.error ? (
        <ErrorState
          error={catalogs.error}
          resourceName="home organization choices"
          onRetry={catalogs.reload}
        />
      ) : (
        catalogs.data && (
          <>
            <label className="field">
              Home Region
              <select
                aria-label="Home Region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
              >
                <option value="">Unassigned</option>
                {choices(catalogs.data.regions, account.region).map((item) => (
                  <option key={item.id} value={item.id}>
                    {label(item)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Home Department
              <select
                aria-label="Home Department"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              >
                <option value="">Unassigned</option>
                {choices(catalogs.data.departments, account.department).map(
                  (item) => (
                    <option key={item.id} value={item.id}>
                      {label(item)}
                    </option>
                  ),
                )}
              </select>
            </label>
          </>
        )
      )}
      <p className="quiet-note">
        Home organization is descriptive only. It grants no ticket access and
        does not change assignments or responsibilities.
      </p>
    </AdminDialog>
  )
}
