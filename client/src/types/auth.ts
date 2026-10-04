export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'AGENT' | 'EMPLOYEE'

export type AuthUser = {
  passwordChangeRequired?: boolean
  id: number
  displayName?: string | null
  jobTitle?: string | null
  username: string
  email: string
  role: UserRole
}

export type AuthResponse = {
  accessToken: string
  user: AuthUser
}
