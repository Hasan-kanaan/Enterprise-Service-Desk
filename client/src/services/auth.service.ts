import api, { sessionCoordinator } from '@/services/api'
import type { AuthResponse, AuthUser } from '@/types/auth'

export type LoginInput = {
  email: string
  password: string
}

export type SetupInput = {
  username: string
  email: string
  password: string
}

export async function login(input: LoginInput) {
  return sessionCoordinator.login(async () =>
    (await api.post<AuthResponse>('/auth/login', input)).data,
  )
}

export async function setupInitialAdmin(input: SetupInput) {
  const { data } = await api.post<{ user: AuthUser }>('/auth/setup', input)
  return data
}

export async function getSetupStatus() {
  const { data } = await api.get<{ available: boolean }>('/auth/setup/status')
  return data
}

export async function logout() {
  await sessionCoordinator.logout(() => api.post('/auth/logout'))
}
