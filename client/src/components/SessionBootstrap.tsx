import { useEffect, useState, type ReactNode } from 'react'
import { useAppDispatch, useAppSelector } from '@/hooks/storeHooks'
import { clearSession, refreshSession } from '@/services/api'
import { sessionChecking, sessionRestoreFailed } from '@/store/authSlice'

export function SessionBootstrap({ children }: { children: ReactNode }) {
  const status = useAppSelector((state) => state.auth.status)
  const dispatch = useAppDispatch()
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    void refreshSession().catch(() => {
      if (active) dispatch(sessionRestoreFailed())
    })
    return () => {
      active = false
    }
  }, [attempt, dispatch])
  if (status === 'checking')
    return (
      <div className="session-state" role="status">
        Opening your workspace...
      </div>
    )
  if (status === 'error')
    return (
      <div className="session-state">
        <h1>Unable to connect</h1>
        <p>Check your connection and try again.</p>
        <div className="button-row">
          <button
            className="button primary"
            onClick={() => {
              dispatch(sessionChecking())
              setAttempt((value) => value + 1)
            }}
          >
            Try again
          </button>
          <button className="button secondary" onClick={clearSession}>
            Go to sign in
          </button>
        </div>
      </div>
    )
  return children
}
