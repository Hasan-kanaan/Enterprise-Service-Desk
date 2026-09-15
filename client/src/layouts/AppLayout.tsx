import { Bell, ChevronDown, LayoutDashboard, LogOut, Menu, Settings2, Shield, Ticket, Users, X } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { BrandMark } from '@/components/BrandMark'
import { useAppDispatch, useAppSelector } from '@/hooks/storeHooks'
import { logout } from '@/services/auth.service'
import { signedOut } from '@/store/authSlice'
import type { UserRole } from '@/types/auth'

const navigation = {
  SUPER_ADMIN: [{ label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard }, { label: 'Administrators', to: '/users', icon: Users }, { label: 'System settings', to: '/settings', icon: Settings2 }],
  ADMIN: [{ label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard }, { label: 'Users', to: '/users', icon: Users }, { label: 'Settings', to: '/settings', icon: Settings2 }, { label: 'Tickets', to: '/tickets', icon: Ticket }],
  MANAGER: [{ label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard }, { label: 'Tickets', to: '/tickets', icon: Ticket }, { label: 'Assignment review', to: '/notifications', icon: Bell }],
  AGENT: [{ label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard }, { label: 'My tickets', to: '/tickets', icon: Ticket }, { label: 'Notifications', to: '/notifications', icon: Bell }],
  EMPLOYEE: [{ label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard }, { label: 'My tickets', to: '/tickets', icon: Ticket }, { label: 'Notifications', to: '/notifications', icon: Bell }],
} satisfies Record<UserRole, { label: string; to: string; icon: typeof LayoutDashboard }[]>

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const user = useAppSelector((state) => state.auth.user)
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const userRole = user?.role ?? 'EMPLOYEE'
  const userNavigation = navigation[userRole]
  const handleLogout = async () => {
    try { await logout() } catch { /* The local session must still be cleared. */ }
    dispatch(signedOut())
    navigate('/login', { replace: true })
    toast.success('You have been signed out')
  }

  return (
    <div className="min-h-svh bg-[var(--background)] text-[var(--foreground)]">
      <aside className={`fixed inset-y-0 left-0 z-30 flex w-72 flex-col border-r border-[var(--border)] bg-[var(--card)] px-5 py-5 shadow-xl shadow-slate-950/5 transition-transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between">
          <BrandMark />
          <button className="rounded-lg p-2 text-slate-500 hover:bg-[var(--muted)] lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Close navigation">
            <X className="size-5" />
          </button>
        </div>
        <div className="mt-10 rounded-xl border border-cyan-100 bg-cyan-50/70 p-4 dark:border-cyan-900/60 dark:bg-cyan-950/30">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-800 dark:text-cyan-300"><Shield className="size-4" /> Admin view</div>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Keep service operations moving with a clear view of people and work.</p>
        </div>
        <nav className="mt-8 space-y-1" aria-label="Main navigation">
          {userNavigation.map(({ label, to, icon: Icon }) => (
            <NavLink key={to} to={to} onClick={() => setSidebarOpen(false)} className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? 'bg-cyan-700 text-white shadow-sm shadow-cyan-950/15' : 'text-slate-600 hover:bg-[var(--muted)] hover:text-slate-950 dark:text-slate-300 dark:hover:text-white'}`}>
              <Icon className="size-[18px]" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-[var(--border)] pt-4">
          <NavLink to="/profile" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-600 hover:bg-[var(--muted)] dark:text-slate-300">
            <div className="flex size-8 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-100">SA</div>
            <span className="flex-1">{user?.username ?? 'Account'}</span>
            <ChevronDown className="size-4" />
          </NavLink>
          <button onClick={() => void handleLogout()} className="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-500 hover:bg-[var(--muted)] hover:text-slate-900 dark:hover:text-white"><LogOut className="size-4" /> Sign out</button>
        </div>
      </aside>
      {sidebarOpen && <button className="fixed inset-0 z-20 bg-slate-950/30 lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Close navigation overlay" />}
      <div className="lg:pl-72">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-[var(--border)] bg-[var(--background)]/90 px-5 backdrop-blur sm:px-8">
          <button className="rounded-lg p-2 text-slate-600 hover:bg-[var(--muted)] lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><Menu className="size-5" /></button>
          <div className="hidden text-sm text-slate-500 lg:block">Operations / <span className="text-slate-900 dark:text-slate-100">Overview</span></div>
          <div className="ml-auto flex items-center gap-2">
            <button className="relative rounded-lg p-2 text-slate-500 hover:bg-[var(--muted)]" aria-label="Notifications"><Bell className="size-5" /><span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-cyan-600" /></button>
            <div className="hidden h-6 w-px bg-[var(--border)] sm:block" />
            <span className="hidden text-sm font-medium sm:block">{user?.username ?? 'Account'}</span>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-10"><Outlet /></main>
      </div>
    </div>
  )
}
