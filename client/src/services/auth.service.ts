import api, { sessionCoordinator, getApiStatus } from '@/services/api'
import type { AuthResponse, AuthUser } from '@/types/auth'

export type LoginInput = {
  email: string
  password: string
}

export type SetupInput = {
  setupSecret: string
  displayName: string
  jobTitle: string
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

export async function changePassword(currentPassword: string, newPassword: string) {
  await sessionCoordinator.changePassword(
    () => api.post('/auth/password', { currentPassword, newPassword }),
    (error) => getApiStatus(error) === 401,
  )
}

export async function completeAccountAction(action: 'activate' | 'reset-password', token: string, newPassword: string) {
  let result: { message: string } | undefined
  await sessionCoordinator.changePassword(async () => {
    result = (await api.post<{ message: string }>(`/auth/${action}`, { token, newPassword })).data
  }, () => false)
  return result!
}
