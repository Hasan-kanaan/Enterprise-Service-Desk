import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import type { AuthResponse } from '@/types/auth'
import { SessionCoordinator } from './session-coordinator'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8000',
  withCredentials: true,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})
type SessionRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean
  _sessionRevision?: string
}

let accessToken: string | null = null
let refreshRequest: Promise<AuthResponse | null> | null = null
let sessionListener: (session: AuthResponse | null) => void = () => {}
export function onSessionChange(listener: typeof sessionListener) {
  sessionListener = listener
}
export function setAccessToken(token: string | null) {
  if (accessToken !== token) {
    accessToken = token
  }
}
export function getAccessToken() {
  return accessToken
}
export function clearSession() {
  sessionCoordinator.forget()
}
export function getApiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof AxiosError) {
    const message = error.response?.data?.message
    if (Array.isArray(message)) return message.join(' ')
    if (typeof message === 'string') return message
  }
  return fallback
}
export function getApiStatus(error: unknown) {
  return axios.isAxiosError(error) ? error.response?.status : undefined
}

export const sessionCoordinator = new SessionCoordinator((session) => {
  setAccessToken(session?.accessToken ?? null)
  sessionListener(session)
})
if (import.meta.hot) import.meta.hot.dispose(() => sessionCoordinator.dispose())

// Single flight locally; one cookie-changing operation across all same-origin tabs.
export function refreshSession(): Promise<AuthResponse | null> {
  if (refreshRequest) return refreshRequest
  refreshRequest = sessionCoordinator
    .refresh(
      async () => (await api.post<AuthResponse>('/auth/refresh')).data,
      (error) => [401, 403].includes(getApiStatus(error) ?? 0),
    )
    .finally(() => {
      refreshRequest = null
    })
  return refreshRequest
}
api.interceptors.request.use((config: SessionRequestConfig) => {
  sessionCoordinator.sync()
  config._sessionRevision = sessionCoordinator.revisionId()
  config.headers.delete('Authorization')
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`
  return config
})
api.interceptors.response.use(
  (response) => {
    if (
      response.config.method !== 'get' &&
      response.config.url?.startsWith('/tickets')
    )
      window.dispatchEvent(new Event('service-desk:mutation'))
    return response
  },
  async (error: AxiosError) => {
    const original = error.config as SessionRequestConfig | undefined
    if (
      error.response?.status !== 401 ||
      !original ||
      [
        '/auth/login',
        '/auth/refresh',
        '/auth/logout',
        '/auth/setup',
        '/auth/setup/status',
      ].includes(original.url ?? '')
    )
      throw error
    // A late response after sign-out must not start a new cookie-based session.
    if (!accessToken) throw error
    if (original._retry) {
      await sessionCoordinator.invalidate(original._sessionRevision)
      throw error
    }
    original._retry = true
    // A different request may already have renewed this token.
    if (
      accessToken &&
      original.headers.Authorization !== `Bearer ${accessToken}`
    ) {
      original.headers.Authorization = `Bearer ${accessToken}`
      return api(original)
    }
    const session = await refreshSession()
    if (!session) throw error
    original.headers.Authorization = `Bearer ${session.accessToken}`
    return api(original)
  },
)
export default api
