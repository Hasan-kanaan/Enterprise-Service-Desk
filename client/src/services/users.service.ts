import api from '@/services/api'
import type { AuthUser, UserRole } from '@/types/auth'

export type CreateAccountInput = {
  username: string
  email: string
  password: string
  role: UserRole
}

export async function listAccounts() {
  const { data } = await api.get<AuthUser[]>('/users')
  return data
}

export async function createAccount(input: CreateAccountInput) {
  const { data } = await api.post<{ user: AuthUser }>('/auth/accounts', input)
  return data.user
}