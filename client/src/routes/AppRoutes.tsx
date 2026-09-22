import { OperationalWorkspacePage } from '@/pages/OperationalWorkspacePage'
import { Navigate, Route, Routes } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { LoadingState } from '@/components/TicketUI'
import { AppLayout } from '@/layouts/AppLayout'
import { PublicLayout } from '@/layouts/PublicLayout'
import { ProtectedRoute } from '@/routes/ProtectedRoute'
import { DashboardPage } from '@/pages/DashboardPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { PlaceholderPage } from '@/pages/PlaceholderPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { EmployeeTicketsPage } from '@/pages/EmployeeTicketsPage'

const LoginPage = lazy(() =>
  import('@/pages/LoginPage').then((module) => ({ default: module.LoginPage })),
)
const SetupPage = lazy(() =>
  import('@/pages/SetupPage').then((module) => ({ default: module.SetupPage })),
)
const EmployeeTicketPage = lazy(() =>
  import('@/pages/EmployeeTicketPage').then((module) => ({
    default: module.EmployeeTicketPage,
  })),
)
const CreateTicketPage = lazy(() =>
  import('@/pages/CreateTicketPage').then((module) => ({
    default: module.CreateTicketPage,
  })),
)
const UsersPage = lazy(() =>
  import('@/pages/UsersPage').then((module) => ({ default: module.UsersPage })),
)

const OperationalTicketPage = lazy(() =>
  import('@/pages/OperationalTicketPage').then((module) => ({
    default: module.OperationalTicketPage,
  })),
)
const SubtaskPage = lazy(() =>
  import('@/pages/SubtaskPage').then((module) => ({
    default: module.SubtaskPage,
  })),
)

const AdministrationPage = lazy(() =>
  import('@/pages/AdministrationPage').then((module) => ({
    default: module.AdministrationPage,
  })),
)
const OrganizationPage = lazy(() =>
  import('@/pages/OrganizationPage').then((module) => ({
    default: module.OrganizationPage,
  })),
)

export function AppRoutes() {
  return (
    <Suspense fallback={<LoadingState label="Loading workspace..." />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/setup" element={<SetupPage />} />
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route
              element={<ProtectedRoute roles={['ADMIN', 'SUPER_ADMIN']} />}
            >
              <Route
                path="/users"
                element={<Navigate to="/admin/accounts" replace />}
              />
              <Route path="/admin" element={<AdministrationPage />} />
              <Route path="/admin/accounts" element={<UsersPage />} />
              <Route
                path="/admin/organization"
                element={<OrganizationPage />}
              />
              <Route
                path="/admin/organization/teams/:teamId"
                element={<OrganizationPage />}
              />
            </Route>
            <Route path="/profile" element={<ProfilePage />} />
            <Route element={<ProtectedRoute roles={['EMPLOYEE']} />}>
              <Route path="/tickets" element={<EmployeeTicketsPage />} />
              <Route path="/tickets/new" element={<CreateTicketPage />} />
              <Route
                path="/tickets/:ticketId"
                element={<EmployeeTicketPage />}
              />
            </Route>
            <Route element={<ProtectedRoute roles={['MANAGER', 'AGENT']} />}>
              <Route
                path="/work/tickets"
                element={<OperationalWorkspacePage />}
              />
              <Route
                path="/work/tickets/:ticketId"
                element={<OperationalTicketPage />}
              />
              <Route
                path="/work/team"
                element={<OperationalWorkspacePage view="team" />}
              />
              <Route
                path="/work/subtasks"
                element={<OperationalWorkspacePage view="subtasks" />}
              />
              <Route
                path="/work/subtasks/:subtaskId"
                element={<SubtaskPage />}
              />
            </Route>
            <Route element={<ProtectedRoute roles={['MANAGER']} />}>
              <Route
                path="/work/intake"
                element={<OperationalWorkspacePage view="intake" />}
              />
            </Route>
            <Route path="/notifications" element={<PlaceholderPage />} />
            <Route path="/settings" element={<PlaceholderPage />} />
          </Route>
        </Route>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}
