import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type TicketVisibilityUser = {
  id: number;
  role: UserRole;
};

@Injectable()
export class TicketVisibilityService {
  constructor(private readonly prisma: PrismaService) {}

  buildWhere(user: TicketVisibilityUser): Prisma.TicketWhereInput {
    switch (user.role) {
      case UserRole.SUPER_ADMIN:
        return {};
      case UserRole.EMPLOYEE:
        return { requesterId: user.id };
      case UserRole.AGENT:
        return {
          OR: [
            { assignedAgentId: user.id },
            { assignedTeam: { teamLeadId: user.id } },
          ],
        };
      case UserRole.MANAGER:
        return {
          assignedTeam: {
            managers: { some: { managerId: user.id } },
          },
        };
      case UserRole.ADMIN:
        throw new ForbiddenException('ADMIN users do not have ticket visibility');
    }
  }

  listVisible(user: TicketVisibilityUser) {
    return this.prisma.ticket.findMany({
      where: this.buildWhere(user),
      orderBy: { createdAt: 'desc' },
    });
  }

  async findVisibleById(ticketId: number, user: TicketVisibilityUser) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { AND: [{ id: ticketId }, this.buildWhere(user)] },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    return ticket;
  }

  countVisible(user: TicketVisibilityUser) {
    return this.prisma.ticket.count({ where: this.buildWhere(user) });
  }
}