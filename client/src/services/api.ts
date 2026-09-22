import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import type { AuthResponse } from '@/types/auth'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8000',
  withCredentials: true,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})
let accessToken: string | null = null
let generation = 0
let refreshRequest: Promise<AuthResponse | null> | null = null
let sessionListener: (session: AuthResponse | null) => void = () => {}
export function onSessionChange(listener: typeof sessionListener) {
  sessionListener = listener
}
export function setAccessToken(token: string | null) {
  if (accessToken !== token) {
    accessToken = token
    generation++
  }
}
export function getAccessToken() {
  return accessToken
}
export function clearSession() {
  generation++
  accessToken = null
  sessionListener(null)
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

// One refresh for simultaneous requests/StrictMode startup. Never resurrect a signed-out session.
export function refreshSession(): Promise<AuthResponse | null> {
  if (refreshRequest) return refreshRequest
  const started = generation
  refreshRequest = api
    .post<AuthResponse>('/auth/refresh')
    .then(({ data }) => {
      if (generation !== started) return null
      setAccessToken(data.accessToken)
      sessionListener(data)
      return data
    })
    .catch((error: unknown) => {
      if (generation !== started) return null
      if (getApiStatus(error) === 401) {
        clearSession()
        return null
      }
      throw error
    })
    .finally(() => {
      refreshRequest = null
    })
  return refreshRequest
}
export async function settleSessionRefresh() {
  await refreshRequest?.catch(() => null)
}
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`
  return config
})
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as
      (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined
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
      clearSession()
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
