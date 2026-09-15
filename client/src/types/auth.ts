export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'AGENT' | 'EMPLOYEE'

export type AuthUser = {
  id: number
  username: string
  email: string
  role: UserRole
}

export type AuthResponse = {
  accessToken: string
  user: AuthUser
}
