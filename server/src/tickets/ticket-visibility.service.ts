import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
          OR: [
            { status: 'NEW', assignedManagerId: null },
            { assignedManagerId: user.id },
          ],
        };
      case UserRole.SUPER_ADMIN:
      case UserRole.ADMIN:
        throw new ForbiddenException(
          'System administration does not grant ticket visibility',
        );
      default:
        throw new ForbiddenException('Unknown service-desk role');
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

  buildSubtaskWhere(user: TicketVisibilityUser): Prisma.SubtaskWhereInput {
    if (user.role === UserRole.MANAGER)
      return { ticket: { assignedManagerId: user.id } };
    if (user.role === UserRole.AGENT)
      return {
        OR: [
          { assignedAgentId: user.id },
          { assignedTeam: { teamLeadId: user.id } },
        ],
      };
    throw new ForbiddenException('This role has no support-subtask access');
  }

  listVisibleSubtasks(user: TicketVisibilityUser, ticketId?: number) {
    // No parent include: subtask-only access must not disclose parent-ticket data.
    return this.prisma.subtask.findMany({
      where: {
        AND: [
          this.buildSubtaskWhere(user),
          ticketId === undefined ? {} : { ticketId },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findVisibleSubtaskById(id: number, user: TicketVisibilityUser) {
    const subtask = await this.prisma.subtask.findFirst({
      where: { AND: [{ id }, this.buildSubtaskWhere(user)] },
    });
    if (!subtask) throw new NotFoundException('Subtask not found');
    return subtask;
  }
}
