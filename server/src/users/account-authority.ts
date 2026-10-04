import { UserRole } from '../../generated/prisma/client';

export function manageableRoles(role: UserRole): UserRole[] {
  if (role === 'SUPER_ADMIN') return ['ADMIN', 'MANAGER', 'AGENT', 'EMPLOYEE'];
  if (role === 'ADMIN') return ['MANAGER', 'AGENT', 'EMPLOYEE'];
  return [];
}
