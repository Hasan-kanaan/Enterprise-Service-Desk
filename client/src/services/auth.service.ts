import api from '@/services/api'
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
  const { data } = await api.post<AuthResponse>('/auth/login', input)
  return data
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
  await api.post('/auth/logout')
}
