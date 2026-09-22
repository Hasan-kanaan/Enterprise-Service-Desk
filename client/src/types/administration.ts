import type { AuthUser, UserRole } from './auth'
export type AccountStatus = 'ACTIVE' | 'INACTIVE'
export type Reference = { id: number; name: string }
export type Account = AuthUser & {
  status: AccountStatus
  region?: Reference | null
  department?: Reference | null
}
export type Team = Reference & {
  scope: 'REGION' | 'GLOBAL'
  regionId: number | null
  region: Reference | null
  teamLeadId: number | null
  teamLead: Pick<AuthUser, 'id' | 'username' | 'role'> | null
  members: {
    userId: number
    user: Pick<Account, 'id' | 'username' | 'role' | 'status'>
  }[]
  managers: {
    managerId: number
    manager: Pick<AuthUser, 'id' | 'username' | 'role'>
  }[]
  specialties: { specialty: Reference }[]
}
export type Catalog = 'regions' | 'departments' | 'specialties'
export const manageableRoles = (role: UserRole): UserRole[] =>
  role === 'SUPER_ADMIN'
    ? ['ADMIN', 'MANAGER', 'AGENT', 'EMPLOYEE']
    : role === 'ADMIN'
      ? ['MANAGER', 'AGENT', 'EMPLOYEE']
      : []
export const creatableRoles = (role: UserRole): UserRole[] =>
  role === 'SUPER_ADMIN'
    ? ['ADMIN', 'MANAGER', 'AGENT', 'EMPLOYEE']
    : role === 'ADMIN'
      ? ['MANAGER', 'AGENT', 'EMPLOYEE']
      : []
