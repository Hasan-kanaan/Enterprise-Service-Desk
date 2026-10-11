import { Avatar } from '@/components/Avatar'
import { ArrowLeft } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { SessionsPanel } from '@/components/SessionsPanel'
import { PasswordForm } from '@/components/PasswordForm'
import { useAppSelector } from '@/hooks/storeHooks'

export function ProfilePage() {
  const location = useLocation()
  const navigate = useNavigate()
  const from = (location.state as { profileReturnTo?: unknown } | null)?.profileReturnTo
  const canGoBack = typeof from === 'string' && /^\/(tickets|work|work-history|admin|dashboard|settings)([/?#]|$)/.test(from) && window.history.state?.idx > 0
  const user = useAppSelector((state) => state.auth.user)
  const identity = user?.displayName?.trim() || 'Account'
  return (
    <div className="ticket-workspace profile-page">
      <button className="back-link" onClick={() => canGoBack ? navigate(-1) : navigate('/dashboard', { replace: true })}>
        <ArrowLeft size={16} aria-hidden="true" />{canGoBack ? 'Back' : 'Back to workspace'}
      </button>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Account</p>
          <h1>Profile</h1>
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
      </section>
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
