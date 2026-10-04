import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'

const destinations = [
  {
    title: 'Accounts',
    description: 'People, roles and account access',
    to: '/admin/accounts',
  },
  {
    title: 'Organization',
    description: 'Teams, coverage, Regions and Departments',
    to: '/admin/organization',
  },
  {
    title: 'Ticket configuration',
    description: 'Categories and tags',
    to: '/admin/ticket-configuration',
  },
]
export function AdministrationPage() {
  return (
    <div className="ticket-workspace">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>Administration</h1>
          <p className="muted">
            Manage your service desk's people and configuration.
          </p>
        </div>
      </header>
      <nav
        className="panel admin-destinations"
        aria-label="Administration areas"
      >
        {destinations.map((item) => (
          <Link key={item.to} className="ticket-row" to={item.to}>
            <div className="ticket-row-main">
              <div>
                <h2>{item.title}</h2>
                <p>{item.description}</p>
              </div>
            </div>
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        ))}
      </nav>
    </div>
  )
}
