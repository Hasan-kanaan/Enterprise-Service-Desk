import { OperationalWorkspacePage } from './OperationalWorkspacePage'
import { Navigate } from 'react-router-dom'
import { useAppSelector } from '@/hooks/storeHooks'
import { EmployeeTicketsPage } from '@/pages/EmployeeTicketsPage'
export function DashboardPage() {
  const user = useAppSelector((state) => state.auth.user)
  if (user?.role === 'EMPLOYEE') return <EmployeeTicketsPage overview />
  if (user?.role === 'MANAGER' || user?.role === 'AGENT')
    return <OperationalWorkspacePage overview />
  return <Navigate to="/admin" replace />
}
