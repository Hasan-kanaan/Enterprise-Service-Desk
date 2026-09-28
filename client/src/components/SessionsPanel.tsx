import { useEffect, useState } from 'react'
import api from '@/services/api'
import { logout } from '@/services/auth.service'

type Session = { id: string; createdAt: string; lastUsedAt: string; deviceLabel: string | null; current: boolean }

export function SessionsPanel() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    api.get<Session[]>('/auth/sessions').then(({ data }) => {
      if (active) { setSessions(data); setError('') }
    }).catch(() => { if (active) setError('Could not load sessions. Please retry.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [revision])
  async function revoke(session?: Session) {
    if (!window.confirm(session ? `Log out ${session.current ? 'this device' : 'this other session'}?` : 'Log out all other sessions?')) return
    setBusy(true)
    setError('')
    try {
      if (session?.current) { await logout(); return }
      if (session) await api.delete(`/auth/sessions/${session.id}`)
      else await api.post('/auth/sessions/logout-others')
      setRevision(value => value + 1)
    } catch { setError('Could not log out sessions. Please retry.') }
    finally { setBusy(false) }
  }
  return <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6" aria-labelledby="sessions-heading">
    <h2 id="sessions-heading" className="text-lg font-semibold">Your sessions</h2>
    <p className="text-sm text-slate-500">Device descriptions are approximate browser hints. Last active records sign-in or refresh, updated at most once a minute.</p>
    {loading && <p role="status">Loading sessions...</p>}
    {error && <div role="alert">{error} <button type="button" onClick={() => setRevision(value => value + 1)}>Retry</button></div>}
    {!loading && !error && sessions.length === 0 && <p>No active sessions.</p>}
    <ul className="space-y-4">{sessions.map(session => <li key={session.id} className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
      <div className="min-w-0 text-sm"><h3 className="font-semibold">{session.current ? 'This device' : 'Other device'}</h3><p>{session.deviceLabel ?? 'Browser session'}</p><p>Created {new Date(session.createdAt).toLocaleString()}</p><p>Last active {new Date(session.lastUsedAt).toLocaleString()}</p></div>
      <button type="button" className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm" disabled={busy} onClick={() => void revoke(session)}>Log out{session.current ? ' this device' : ''}</button>
    </li>)}</ul>
    <button type="button" className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm" disabled={busy || loading || !sessions.some(session => !session.current)} onClick={() => void revoke()}>Log out all other sessions</button>
  </section>
}
