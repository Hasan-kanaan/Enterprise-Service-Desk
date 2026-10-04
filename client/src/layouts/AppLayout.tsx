import { useResource } from '@/hooks/useResource'
import { getWorkspace } from '@/services/operations.service'
import {
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings2,
  Shield,
  Ticket,
  Users,
  X,
} from 'lucide-react'
import { useState, useCallback, useEffect, useRef } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
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
    { label: 'Intake', to: '/work/intake', icon: Ticket },
    { label: 'My Work', to: '/work/tickets', icon: Ticket },
    { label: 'Subtasks', to: '/work/subtasks', icon: Ticket },
    { label: 'Work History', to: '/work-history', icon: Ticket },
  ],
  AGENT: [
    { label: 'Work', to: '/work/tickets', icon: Ticket },
    { label: 'Subtasks', to: '/work/subtasks', icon: Ticket },
    { label: 'Work History', to: '/work-history', icon: Ticket },
    { label: 'Profile', to: '/profile', icon: Shield },
  ],
  EMPLOYEE: [{ label: 'Profile', to: '/profile', icon: Shield }],
} satisfies Record<
  UserRole,
  { label: string; to: string; icon: typeof LayoutDashboard }[]
>

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
  const pageLabel = location.pathname.startsWith('/profile')
    ? 'Profile'
    : ([...userNavigation]
        .reverse()
        .find(
          (item) =>
            location.pathname === item.to ||
            location.pathname.startsWith(`${item.to}/`),
        )?.label ?? 'Dashboard')
  const handleLogout = async () => {
    try {
      await logout()
    } catch {
      /* The local session must still be cleared. */
    }
    navigate('/login', { replace: true })
    toast.success('You have been signed out')
  }

  const identity = user?.displayName ?? user?.username ?? 'Account'
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
            <NavLink
              end={to === '/admin'}
              to={to}
              onClick={closeNavigation}
              className={({ isActive }) =>
                `nav-item ${isActive ? 'active' : ''}`
              }
            >
              <Icon size={17} aria-hidden="true" />
              {label}
            </NavLink>
          </div>
        ))}
      </nav>
      <div className="sidebar-account">
        <NavLink
          to="/profile"
          onClick={closeNavigation}
          className="account-link"
        >
          <span className="avatar">{identity.slice(0, 2).toUpperCase()}</span>
          <span className="account-identity">
            <strong>{identity}</strong>
            <small>{userRole.replaceAll('_', ' ').toLowerCase()}</small>
          </span>
          <ChevronRight size={15} aria-hidden="true" />
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
          <div className="workspace-context">
            <span>
              {location.pathname.startsWith('/tickets')
                ? 'Personal'
                : viewLabel}
            </span>
            <ChevronRight size={13} aria-hidden="true" />
            <strong>{pageLabel}</strong>
          </div>
          <div className="topbar-account">
            <NotificationBell key={user!.id} role={userRole} />
            <span>{identity}</span>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
