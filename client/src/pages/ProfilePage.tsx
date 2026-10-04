import { SessionsPanel } from '@/components/SessionsPanel'
import { PasswordForm } from '@/components/PasswordForm'
import { useAppSelector } from '@/hooks/storeHooks'

export function ProfilePage() {
  const user = useAppSelector((state) => state.auth.user)
  const identity = user?.displayName ?? user?.username ?? 'Account'
  return (
    <div className="ticket-workspace profile-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Account</p>
          <h1>Profile</h1>
        </div>
      </header>
      <section className="panel detail-body">
        <div className="profile-header">
          <span className="avatar">{identity.slice(0, 2).toUpperCase()}</span>
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
              <dt>Username</dt>
              <dd>{user?.username ?? 'Not set'}</dd>
            </div>
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
