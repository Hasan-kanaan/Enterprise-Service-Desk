import type { AuthResponse } from '@/types/auth'

// Only this non-secret fence is persisted. Credentials stay in memory/on the channel.
type Fence = {
  id: string
  kind: 'session' | 'out' | 'network' | 'pending'
  until?: number
}
const key = 'service-desk:auth:v1'

export class SessionCoordinationError extends Error {}

export class SessionCoordinator {
  private channel: BroadcastChannel | null = null
  private session: AuthResponse | null = null
  private revision = ''
  private disposed = false
  private waits = new Set<AbortController>()

  private readonly changed: (session: AuthResponse | null) => void

  constructor(changed: (session: AuthResponse | null) => void) {
    this.changed = changed
    try {
      this.channel = new BroadcastChannel(key)
      this.channel.onmessage = ({ data }) => {
        const fence = this.read()
        if (!fence || data?.id !== fence.id) return // Delayed messages cannot undo logout/login.
        if (data.type === 'request') {
          if (
            this.revision === fence.id &&
            this.session &&
            fence.kind === 'session'
          )
            this.channel?.postMessage({
              type: 'session',
              id: fence.id,
              session: this.session,
            })
          return
        } else if (
          data.type === 'session' &&
          fence.kind === 'session' &&
          typeof data.session?.accessToken === 'string' &&
          data.session?.user?.id
        ) {
          this.revision = fence.id
          this.session = data.session as AuthResponse
          this.changed(this.session)
        } else this.sync()
      }
    } catch {
      /* Web Locks plus storage events still serialize cookie rotation. */
    }
    window.addEventListener('storage', this.storageChanged)
    window.addEventListener('pageshow', this.sync)
    window.addEventListener('focus', this.sync)
    window.addEventListener('pagehide', this.pageHidden)
  }

  private read(): Fence | null {
    try {
      const value = localStorage.getItem(key)
      const fence = value ? (JSON.parse(value) as Fence) : null
      return fence &&
        typeof fence.id === 'string' &&
        ['session', 'out', 'network', 'pending'].includes(fence.kind)
        ? fence
        : null
    } catch {
      return null
    }
  }

  private storageChanged = (event: StorageEvent) => {
    if (event.key === key) this.sync()
  }

  sync = () => {
    const fence = this.read()
    if (
      fence &&
      fence.id !== this.revision &&
      (fence.kind === 'out' || fence.kind === 'session')
    ) {
      if (fence.kind === 'out') {
        this.session = null
        this.changed(null)
        this.revision = fence.id
      } else this.channel?.postMessage({ type: 'request', id: fence.id })
    }
  }

  private publish(kind: Fence['kind'], session: AuthResponse | null = null) {
    const fence: Fence = {
      id: crypto.randomUUID(),
      kind,
      ...(kind === 'network' ? { until: Date.now() + 2000 } : {}),
    }
    localStorage.setItem(key, JSON.stringify(fence))
    this.revision = fence.id
    if (kind === 'session' || kind === 'out') {
      this.session = session
      this.changed(session)
    }
    this.channel?.postMessage({ type: kind, id: fence.id, session })
  }

  async exclusive<T>(work: () => Promise<T>): Promise<T> {
    if (this.disposed || !navigator.locks)
      throw new SessionCoordinationError(
        'Use a current browser over HTTPS with site storage enabled to restore your session safely.',
      )
    // Probe storage before any cookie-changing request; never silently downgrade safety.
    const probe = `${key}:probe`
    try {
      localStorage.setItem(probe, '1')
      localStorage.removeItem(probe)
    } catch {
      throw new SessionCoordinationError(
        'Enable site storage in your browser to restore your session safely.',
      )
    }
    const abort = new AbortController()
    this.waits.add(abort)
    const timer = window.setTimeout(() => abort.abort(), 20000)
    try {
      return await navigator.locks.request(
        key,
        { signal: abort.signal },
        async () => {
          clearTimeout(timer)
          return work()
        },
      )
    } finally {
      clearTimeout(timer)
      this.waits.delete(abort)
    }
  }

  async refresh(
    request: () => Promise<AuthResponse>,
    rejected: (error: unknown) => boolean,
  ) {
    const started = this.read()?.id
    return this.exclusive(async () => {
      const fence = this.read()
      // The previous owner disappeared with an HTTP request in flight. Its outcome
      // is unknowable; do not race that request by consuming the cookie again.
      if (fence?.kind === 'pending')
        throw new SessionCoordinationError(
          'A session request was interrupted. Choose Go to sign in to authenticate again.',
        )
      if (fence?.kind === 'network' && (fence.until ?? 0) > Date.now())
        throw new Error('Session connection temporarily unavailable')
      if (fence?.id !== started) {
        if (fence?.kind === 'out') {
          this.sync()
          return null
        }
        if (fence?.kind === 'session') {
          if (this.revision !== fence.id || !this.session) {
            this.channel?.postMessage({ type: 'request', id: fence.id })
            // A bounded handoff; a closed/suspended peer cannot block cookie recovery.
            await new Promise((resolve) => setTimeout(resolve, 100))
          }
          if (this.revision === fence.id && this.session) return this.session
        }
      }
      if (this.disposed) throw new Error('Session coordinator disposed')
      this.publish('pending')
      try {
        const session = await request()
        if (this.disposed) throw new Error('Session coordinator disposed')
        this.publish('session', session)
        return session
      } catch (error) {
        if (this.disposed) throw error
        if (rejected(error)) {
          this.publish('out')
          return null
        }
        this.publish('network')
        throw error
      }
    })
  }

  login(request: () => Promise<AuthResponse>) {
    return this.exclusive(async () => {
      const session = await request()
      if (!this.disposed) this.publish('session', session)
      return session
    })
  }

  logout(request: () => Promise<unknown>) {
    const started = this.read()?.id
    return this.exclusive(async () => {
      // Another queued logout has already revoked the shared session.
      if (this.read()?.kind === 'out' && this.read()?.id !== started) return
      // Notify before the HTTP request so closing this tab or a network failure
      // cannot leave siblings presenting an authenticated workspace.
      this.publish('out')
      await request()
    }).catch((error: unknown) => {
      this.forget()
      throw error
    })
  }

  forget() {
    this.session = null
    this.changed(null)
  }

  revisionId() {
    return this.read()?.id
  }

  invalidate(started = this.read()?.id) {
    return this.exclusive(async () => {
      if (this.read()?.id === started) this.publish('out')
    })
  }

  private pageHidden = (event: PageTransitionEvent) => {
    if (!event.persisted) this.dispose()
  }

  dispose() {
    this.disposed = true
    this.waits.forEach((abort) => abort.abort())
    this.channel?.close()
    window.removeEventListener('storage', this.storageChanged)
    window.removeEventListener('pageshow', this.sync)
    window.removeEventListener('focus', this.sync)
    window.removeEventListener('pagehide', this.pageHidden)
    this.session = null
  }
}
