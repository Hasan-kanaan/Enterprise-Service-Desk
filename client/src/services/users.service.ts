import { toast } from 'sonner'
import api from '@/services/api'
import type { Account } from '@/types/administration'
import type { UserRole } from '@/types/auth'

export type CreateAccountInput = {
  username: string
  email: string
  phoneNumber?: string
  role: UserRole
}

export type UpdateAccountInput = {
  username?: string
  phoneNumber?: string | null
  regionId?: number | null
  departmentId?: number | null
}

export const updateAccount = async (id: number, input: UpdateAccountInput) =>
  (await api.patch<Account>(`/users/${id}`, input)).data

export async function createAccount(input: CreateAccountInput) {
  const { data } = await api.post<{ user: Account; delivery: string }>('/auth/accounts', input)
  if (data.delivery === 'FAILED') toast.error('Account created, but activation email delivery failed. Resend activation from the directory.')
  return data.user
}
