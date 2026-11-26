import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAppSelector } from '@/hooks/storeHooks'

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
  const role = useAppSelector((state) => state.auth.user?.role)
  const visibleDestinations =
    role === 'SUPER_ADMIN'
      ? [
          ...destinations,
          {
            title: 'Ticket routing',
            description: 'Automatic Manager assignment and category coverage',
            to: '/admin/ticket-routing',
          },
        ]
      : destinations
  return (
    <div className="ticket-workspace">
      <header className="page-heading">
        <div>
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
        {visibleDestinations.map((item) => (
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
