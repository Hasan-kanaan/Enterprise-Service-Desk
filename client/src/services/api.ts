import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8000',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

let accessToken: string | null = null
let refreshRequest: Promise<string | null> | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function getAccessToken() {
  return accessToken
}

export function getApiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof AxiosError) {
    const message = error.response?.data?.message
    if (Array.isArray(message)) return message.join(' ')
    if (typeof message === 'string') return message
  }
  return fallback
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined
    const isAuthRequest = originalRequest?.url?.includes('/auth/login') || originalRequest?.url?.includes('/auth/refresh')

    if (error.response?.status !== 401 || !originalRequest || originalRequest._retry || isAuthRequest) {
      return Promise.reject(error)
    }

    originalRequest._retry = true
    refreshRequest ??= api.post<{ accessToken: string }>('/auth/refresh').then(({ data }) => {
      setAccessToken(data.accessToken)
      return data.accessToken
    }).catch(() => {
      setAccessToken(null)
      window.location.assign('/login')
      return null
    }).finally(() => {
      refreshRequest = null
    })

    const refreshedToken = await refreshRequest
    if (!refreshedToken) {
      return Promise.reject(error)
    }

    originalRequest.headers.Authorization = `Bearer ${refreshedToken}`
    return api(originalRequest)
  },
)

export default api
