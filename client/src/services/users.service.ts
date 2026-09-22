import api from '@/services/api'
import type { Account } from '@/types/administration'
import type { UserRole } from '@/types/auth'

export type CreateAccountInput = {
  username: string
  email: string
  password: string
  role: UserRole
}

export async function listAccounts(signal?: AbortSignal) {
  const { data } = await api.get<Account[]>('/users', { signal })
  return data
}

export async function createAccount(input: CreateAccountInput) {
  const { data } = await api.post<{ user: Account }>('/auth/accounts', input)
  return data.user
}
