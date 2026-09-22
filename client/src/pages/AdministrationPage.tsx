import { Link } from 'react-router-dom'
export function AdministrationPage() {
  return (
    <div className="ticket-workspace">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>Administration workspace</h1>
          <p className="muted">Manage accounts and organization records.</p>
        </div>
      </header>
      <div className="form-columns">
        <section className="panel detail-body">
          <h2>Accounts</h2>
          <p className="muted">
            Create permitted accounts and manage ACTIVE / INACTIVE access.
          </p>
          <Link className="button primary" to="/admin/accounts">
            Manage accounts
          </Link>
        </section>
        <section className="panel detail-body">
          <h2>Organization</h2>
          <p className="muted">
            Regions, departments, specialties, teams and organizational
            responsibilities.
          </p>
          <Link className="button primary" to="/admin/organization">
            Manage organization
          </Link>
        </section>
      </div>
      <p className="quiet-note">
        System administration does not grant access to service-desk tickets or
        subtasks.
      </p>
    </div>
  )
}
