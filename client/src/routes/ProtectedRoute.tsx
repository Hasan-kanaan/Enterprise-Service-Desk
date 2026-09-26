import { Navigate, Outlet, useLocation, Link } from 'react-router-dom'
import { useAppSelector } from '@/hooks/storeHooks'
import type { UserRole } from '@/types/auth'
export function ProtectedRoute({ roles }: { roles?: UserRole[] }) {
  const { accessToken, user } = useAppSelector((state) => state.auth)
  const location = useLocation()
  if (!accessToken || !user)
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    )
  if (roles && !roles.includes(user.role))
    return (
      <div className="panel empty-state">
        <h1>This page is not available for your account</h1>
        <Link className="button secondary" to="/dashboard">
          Back to dashboard
        </Link>
      </div>
    )
  return <Outlet key={`${user.id}:${user.role}`} />
}
