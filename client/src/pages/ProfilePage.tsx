import { Avatar } from '@/components/Avatar'
import { ArrowLeft } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { SessionsPanel } from '@/components/SessionsPanel'
import { PasswordForm } from '@/components/PasswordForm'
import { useState } from 'react'
import { useAppDispatch, useAppSelector } from '@/hooks/storeHooks'
import { AdminDialog } from '@/components/AdminDialog'
import { PhoneField } from '@/components/PhoneField'
import { updateOwnProfile } from '@/services/users.service'
import { profileUpdated } from '@/store/authSlice'
import { useResource } from '@/hooks/useResource'
import api from '@/services/api'
import type { Reference } from '@/types/administration'

const loadRegions = async (signal: AbortSignal) =>
  (await api.get<Reference[]>('/organization/regions', { signal })).data

export function ProfilePage() {
  const location = useLocation()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const from = (location.state as { profileReturnTo?: unknown } | null)?.profileReturnTo
  const canGoBack = typeof from === 'string' && /^\/(tickets|work|work-history|admin|dashboard|settings)([/?#]|$)/.test(from) && window.history.state?.idx > 0
  const user = useAppSelector((state) => state.auth.user)
  const identity = user?.displayName?.trim() || 'Account'
  const [editing, setEditing] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [phone, setPhone] = useState('')
  const [phoneValid, setPhoneValid] = useState(true)
  const regions = useResource(loadRegions)
  const [regionId, setRegionId] = useState('')
  return (
    <div className="ticket-workspace profile-page">
      <button className="back-link" onClick={() => canGoBack ? navigate(-1) : navigate('/dashboard', { replace: true })}>
        <ArrowLeft size={16} aria-hidden="true" />{canGoBack ? 'Back' : 'Back to workspace'}
      </button>
      <header className="page-heading">
        <div>
          <h1>Account settings</h1>
        </div>
      </header>
      <section className="panel detail-body">
        <div className="profile-header">
          <Avatar displayName={user?.displayName} />
          <div>
            <h2>{identity}</h2>
            <p className="muted small">
              {user?.jobTitle ?? 'Job title not set'}
            </p>
          </div>
        </div>
        <div className="profile-identity">
          <dl className="metadata-grid">
            <div>
              <dt>Email</dt>
              <dd>{user?.email ?? 'Not set'}</dd>
            </div>
          </dl>
          <dl className="metadata-grid">
            <div>
              <dt>Display name</dt>
              <dd>{user?.displayName ?? 'Not set'}</dd>
            </div>
            <div>
              <dt>Workspace role</dt>
              <dd className="capitalize">
                {user?.role.replaceAll('_', ' ').toLowerCase() ?? 'Not set'}
              </dd>
            </div>
          </dl>
        </div>
        <button className="button secondary mt-2" onClick={() => {
          setDisplayName(user?.displayName ?? '')
          setJobTitle(user?.jobTitle ?? '')
          setPhone(user?.phoneNumber ?? '')
          setRegionId(user?.regionId?.toString() ?? '')
          setEditing(true)
        }}>Edit account details</button>
      </section>
      {editing && user && (
        <AdminDialog
          title="Edit account details"
          onClose={() => setEditing(false)}
          onDone={() => {
            dispatch(profileUpdated({ displayName: displayName.trim(), jobTitle: jobTitle.trim() || null, phoneNumber: phone.trim() || null, regionId: regionId ? Number(regionId) : null }))
            setEditing(false)
          }}
          submit={async () => {
            await updateOwnProfile({
              ...(displayName.trim() !== user.displayName ? { displayName: displayName.trim() } : {}),
              ...(jobTitle.trim() !== (user.jobTitle ?? '') ? { jobTitle: jobTitle.trim() } : {}),
              ...(phone.trim() !== (user.phoneNumber ?? '') ? { phoneNumber: phone.trim() || null } : {}),
              ...(regionId !== (user.regionId?.toString() ?? '') ? { regionId: regionId ? Number(regionId) : null } : {}),
            })
          }}
          valid={!!displayName.trim() && phoneValid && !!regions.data && (displayName.trim() !== user.displayName || jobTitle.trim() !== (user.jobTitle ?? '') || phone.trim() !== (user.phoneNumber ?? '') || regionId !== (user.regionId?.toString() ?? ''))}
        >
          <p>Email and workspace role are managed separately.</p>
          <label className="field">Display name<input aria-label="Account display name" maxLength={100} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
          <label className="field">Job title<input aria-label="Account job title" maxLength={100} value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} /></label>
          <PhoneField value={phone} onChange={setPhone} onValidityChange={setPhoneValid} />
          {regions.data ? (
            <label className="field">Home Region
              <select aria-label="Home Region" value={regionId} onChange={(event) => setRegionId(event.target.value)}>
                <option value="">Unassigned</option>
                {regions.data.filter((region) => !region.archivedAt || region.id === user.regionId).map((region) => (
                  <option key={region.id} value={region.id}>{region.name}{region.archivedAt ? ' (ARCHIVED)' : ''}</option>
                ))}
              </select>
            </label>
          ) : regions.loading ? <p className="quiet-note">Loading regions…</p> : (
            <div className="error-state" role="alert">Could not load regions. Close and reopen the editor to retry.</div>
          )}
        </AdminDialog>
      )}
      {user?.passwordChangeRequired && (
        <p className="notice warning" role="status">
          Your administrator reset your password. Change it before continuing.
        </p>
      )}
      <PasswordForm />
      {!user?.passwordChangeRequired && <SessionsPanel />}
    </div>
  )
}
