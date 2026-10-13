import api from '@/services/api'
import type { Account } from '@/types/administration'
import type { UserRole } from '@/types/auth'

export type CreateAccountInput = {
  displayName: string
  jobTitle: string
  email: string
  phoneNumber?: string
  role: UserRole
}

export type UpdateAccountInput = {
  displayName?: string
  jobTitle?: string
  phoneNumber?: string | null
  regionId?: number | null
  departmentId?: number | null
}

export const updateAccount = async (id: number, input: UpdateAccountInput) =>
  (await api.patch<Account>(`/users/${id}`, input)).data

export async function createAccount(input: CreateAccountInput) {
  const { data } = await api.post<{ user: Account; delivery: string }>('/auth/accounts', input)
  return data
}

export const changeAccountRole = async (id: number, role: UserRole) =>
  (await api.patch<{ id: number; role: UserRole; changed: boolean; managerlessTeams: { id: number; name: string }[] }>(`/users/${id}/role`, { role })).data
