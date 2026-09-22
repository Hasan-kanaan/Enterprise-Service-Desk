import { UserRole } from '../../generated/prisma/client';

export type TicketAuthorizationUser = {
  id: number;
  sessionVersion?: number;
  role: UserRole;
};
