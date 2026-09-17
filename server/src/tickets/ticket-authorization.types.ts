import { UserRole } from '../../generated/prisma/client';

export type TicketAuthorizationUser = {
  id: number;
  role: UserRole;
};