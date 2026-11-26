import { workOrigin, workPaths, workLabels } from '@/types/workNavigation'
import { Suspense } from 'react'
import { SkeletonState } from '@/components/Skeleton'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Avatar } from '@/components/Avatar'
import { useResource } from '@/hooks/useResource'
import { getWorkspace } from '@/services/operations.service'
import {
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings2,
  Settings,
  Ticket,
  Users,
  X,
} from 'lucide-react'
import { useState, useCallback, useEffect, useRef } from 'react'
import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { BrandMark } from '@/components/BrandMark'
import { NotificationBell } from '@/components/NotificationBell'
import { useAppSelector } from '@/hooks/storeHooks'
import { logout } from '@/services/auth.service'
import type { UserRole } from '@/types/auth'

const navigation = {
  SUPER_ADMIN: [
    { label: 'Administration', to: '/admin', icon: LayoutDashboard },
    { label: 'Accounts', to: '/admin/accounts', icon: Users },
    { label: 'Organization', to: '/admin/organization', icon: Settings2 },
    {
      label: 'Ticket configuration',
      to: '/admin/ticket-configuration',
      icon: Settings2,
    },
    {
      label: 'Ticket routing',
      to: '/admin/ticket-routing',
      icon: Settings,
    },
  ],
  ADMIN: [
    { label: 'Administration', to: '/admin', icon: LayoutDashboard },
    { label: 'Accounts', to: '/admin/accounts', icon: Users },
    { label: 'Organization', to: '/admin/organization', icon: Settings2 },
    {
      label: 'Ticket configuration',
      to: '/admin/ticket-configuration',
      icon: Settings2,
    },
  ],
  MANAGER: [
    { label: 'Analytics', to: '/analytics', icon: LayoutDashboard },
    { label: 'Intake', to: '/work/intake', icon: Ticket },
    { label: 'My Work', to: '/work/tickets', icon: Ticket },
    { label: 'Subtasks', to: '/work/subtasks', icon: Ticket },
    { label: 'Work History', to: '/work-history', icon: Ticket },
  ],
  AGENT: [
    { label: 'Work', to: '/work/tickets', icon: Ticket },
    { label: 'Subtasks', to: '/work/subtasks', icon: Ticket },
    { label: 'Work History', to: '/work-history', icon: Ticket },
  ],
  EMPLOYEE: [],
} satisfies Record<
  UserRole,
  { label: string; to: string; icon: typeof LayoutDashboard }[]
>

type Breadcrumb = { label: string; to?: string }

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const drawer = useRef<HTMLDialogElement>(null)
  const navigationTrigger = useRef<HTMLButtonElement>(null)
  const closeNavigation = () => {
    drawer.current?.close()
    setSidebarOpen(false)
    navigationTrigger.current?.focus()
  }
  useEffect(() => {
    const dialog = drawer.current
    if (sidebarOpen) dialog?.showModal()
    else dialog?.close()
    if (!sidebarOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const desktop = matchMedia('(min-width: 1024px)')
    const closeOnDesktop = () => {
      if (desktop.matches) setSidebarOpen(false)
    }
    desktop.addEventListener('change', closeOnDesktop)
    return () => {
      document.body.style.overflow = previous
      desktop.removeEventListener('change', closeOnDesktop)
    }
  }, [sidebarOpen])
  const user = useAppSelector((state) => state.auth.user)
  const location = useLocation()
  const navigate = useNavigate()
  const userRole = user!.role
  const workspace = useResource(
    useCallback(
      (signal: AbortSignal) =>
        userRole === 'AGENT'
          ? getWorkspace(signal)
          : Promise.resolve({ ledTeams: [] }),
      [userRole],
    ),
  )
  const userNavigation = [
    { label: 'My Requests', to: '/tickets', icon: Ticket },
    ...navigation[userRole],
    ...(workspace.data?.ledTeams.length
      ? [{ label: 'Led-team tickets', to: '/work/team', icon: Ticket }]
      : []),
  ]
  const viewLabel =
    userRole === 'EMPLOYEE'
      ? 'Employee workspace'
      : userRole === 'ADMIN' || userRole === 'SUPER_ADMIN'
        ? 'Administration'
        : 'Support workspace'
  const operationalTicketId =
    /^\/work\/tickets\/(\d+)$/.exec(location.pathname)?.[1]
  const employeeTicketId = /^\/tickets\/(\d+)$/.exec(location.pathname)?.[1]
  const subtaskId = /^\/work\/subtasks\/(\d+)$/.exec(location.pathname)?.[1]
  const teamId =
    /^\/admin\/organization\/teams\/(\d+)$/.exec(location.pathname)?.[1]
  const ticketDetail = operationalTicketId !== undefined
  const origin = workOrigin(location.state)
  const ticketOrigin = origin ?? 'mine'
  const ticketOriginPath = workPaths[ticketOrigin]
  const pageLabel = ticketDetail ? workLabels[ticketOrigin] : location.pathname.startsWith('/profile') || location.pathname.startsWith('/settings')
    ? 'Account settings'
    : ([...userNavigation]
        .reverse()
        .find(
          (item) =>
            location.pathname === item.to ||
            location.pathname.startsWith(`${item.to}/`),
        )?.label ?? (location.pathname === '/notifications' ? 'Notifications' : 'Dashboard'))
  const contextLabel = location.pathname.startsWith('/tickets') ? 'Personal' : viewLabel
  const contextPath = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN' ? '/admin' : '/dashboard'
  const breadcrumbs: Breadcrumb[] = []
  if (ticketDetail) {
    breadcrumbs.push(
      { label: contextLabel, to: contextPath },
      { label: workLabels[ticketOrigin], to: ticketOriginPath },
      { label: `Ticket #${operationalTicketId}` },
    )
  } else if (employeeTicketId) {
    breadcrumbs.push(
      { label: contextLabel, to: contextPath },
      { label: 'My Requests', to: '/tickets' },
      { label: `Ticket #${employeeTicketId}` },
    )
  } else if (subtaskId) {
    breadcrumbs.push(
      { label: contextLabel, to: contextPath },
      { label: 'Subtasks', to: '/work/subtasks' },
      { label: `Subtask #${subtaskId}` },
    )
  } else if (teamId) {
    breadcrumbs.push(
      { label: contextLabel, to: contextPath },
      { label: 'Organization', to: '/admin/organization' },
      { label: `Team #${teamId}` },
    )
  } else if (location.pathname === '/tickets/new') {
    breadcrumbs.push(
      { label: contextLabel, to: contextPath },
      { label: 'My Requests', to: '/tickets' },
      { label: 'New request' },
    )
  } else {
    if (contextLabel !== pageLabel) {
      breadcrumbs.push({ label: contextLabel, to: contextPath })
    }
    breadcrumbs.push({ label: pageLabel })
  }
  const handleLogout = async () => {
    try {
      await logout()
    } catch {
      /* The local session must still be cleared. */
    }
    navigate('/login', { replace: true })
    toast.success('You have been signed out')
  }

  const identity = user?.displayName?.trim() || 'Account'
  const renderNavigation = (mobile = false) => (
    <>
      <div className="sidebar-brand">
        <BrandMark />
        {mobile && (
          <button
            className="icon-button"
            onClick={closeNavigation}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        )}
      </div>
      <nav className="sidebar-nav" aria-label="Main navigation">
        {userNavigation.map(({ label, to, icon: Icon }, index) => (
          <div key={to}>
            {index === 0 && <p className="nav-section-label">Personal</p>}
            {index === 1 && userRole !== 'EMPLOYEE' && (
              <p className="nav-section-label">{viewLabel}</p>
            )}
            {ticketDetail ? <Link to={to} onClick={closeNavigation}
              aria-current={to === ticketOriginPath ? 'page' : undefined}
              className={`nav-item ${to === ticketOriginPath ? 'active' : ''}`}>
              <Icon size={17} aria-hidden="true" />{label}
            </Link> : <NavLink
              end={to === '/admin'}
              to={to}
              onClick={closeNavigation}
              className={({ isActive }) =>
                `nav-item ${isActive ? 'active' : ''}`
              }
            >
              <Icon size={17} aria-hidden="true" />
              {label}
            </NavLink>}
          </div>
        ))}
      </nav>
      <div className="sidebar-account">
        <NavLink
          to="/profile"
          state={{ profileReturnTo: location.pathname + location.search }}
          onClick={closeNavigation}
          className={({ isActive }) => `nav-item account-link ${isActive ? 'active' : ''}`}
          title={identity}
          aria-label={`Account settings for ${identity}`}
        >
          <Avatar displayName={identity} />
          <span className="account-identity"><strong>{identity}</strong></span>
        </NavLink>
        <button
          onClick={() => void handleLogout()}
          className="nav-item sign-out"
        >
          <LogOut size={16} aria-hidden="true" />
          Sign out
        </button>
      </div>
    </>
  )
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside className="desktop-sidebar">{renderNavigation()}</aside>
      {sidebarOpen && (
        <dialog
          ref={drawer}
          className="navigation-drawer"
          aria-label="Navigation"
          onCancel={(event) => {
            event.preventDefault()
            closeNavigation()
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Tab') return
            const controls = event.currentTarget.querySelectorAll<HTMLElement>(
              'a[href], button:not(:disabled)',
            )
            const first = controls[0],
              last = controls[controls.length - 1]
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault()
              last?.focus()
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault()
              first?.focus()
            }
          }}
          onClick={(event) => {
            if (
              event.target === event.currentTarget &&
              event.clientX > event.currentTarget.getBoundingClientRect().right
            )
              closeNavigation()
          }}
        >
          {sidebarOpen && renderNavigation(true)}
        </dialog>
      )}
      <div className="app-body">
        <header className="app-topbar">
          <button
            ref={navigationTrigger}
            className="icon-button navigation-trigger"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation"
            aria-expanded={sidebarOpen}
          >
            <Menu size={20} />
          </button>
          <nav className="workspace-context" aria-label="Breadcrumb">
            <ol>
              {breadcrumbs.map(({ label, to }, index) => (
                <li key={`${label}-${index}`}>
                  {index > 0 && <ChevronRight size={13} aria-hidden="true" />}
                  {to ? (
                    <Link to={to}>{label}</Link>
                  ) : (
                    <span aria-current="page">{label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
          <div className="topbar-account">
            <NotificationBell key={user!.id} role={userRole} />
            <ThemeToggle />
            <NavLink to="/profile" state={{ profileReturnTo: location.pathname + location.search }} className="icon-button" aria-label="Account settings" title="Account settings">
              <Settings size={20} aria-hidden="true" />
            </NavLink>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="app-content">
          <Suspense fallback={<SkeletonState variant="page" label="Loading workspace..." />}><Outlet /></Suspense>
        </main>
      </div>
    </div>
  )
}
