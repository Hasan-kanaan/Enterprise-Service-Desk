import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '../../generated/prisma/client';
import { operationalStatuses } from '../prisma/transactions';
import { ListTicketsDto } from './dto/list-tickets.dto';
import { cycleInclude, mapCycle, mapTicket } from './ticket-response.mapper';
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
            this.collaboratorWhere(user.id),
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

  collaboratorWhere(userId: number): Prisma.TicketWhereInput {
    // Only the latest cycle can be unfinished: creation/reopen/end are atomic.
    // Completion (or cancellation) of a subtask does not end collaboration.
    return {
      status: { in: [...operationalStatuses] },
      subtasks: {
        some: { assignedAgentId: userId, createdInCycle: { outcome: null } },
      },
    };
  }

  supportWhere(user: TicketVisibilityUser): Prisma.TicketWhereInput {
    if (user.role === UserRole.AGENT) return this.buildWhere(user);
    if (user.role === UserRole.MANAGER) return { assignedManagerId: user.id };
    throw new ForbiddenException(
      'Support communication requires current support responsibility',
    );
  }

  listVisible(user: TicketVisibilityUser, query: ListTicketsDto = {}) {
    if (user.role === UserRole.AGENT) {
      return this.prisma.$transaction(
        (db) =>
          db.ticket
            .findMany({
              where: {
                AND: [
                  this.buildWhere(user),
                  query.status === undefined ? {} : { status: query.status },
                  query.active === 'true'
                    ? { status: { in: [...operationalStatuses] } }
                    : {},
                ],
              },
              include: {
                subtasks: {
                  where: {
                    assignedAgentId: user.id,
                    createdInCycle: { outcome: null },
                  },
                  select: { id: true },
                },
              },
              orderBy: { createdAt: 'desc' },
            })
            .then((rows) =>
              rows.map(({ subtasks, ...ticket }) => ({
                ...ticket,
                isCurrentCollaborator:
                  subtasks.length > 0 &&
                  operationalStatuses.includes(
                    ticket.status as (typeof operationalStatuses)[number],
                  ),
              })),
            ),
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
      );
    }
    return this.prisma.ticket.findMany({
      where:
        query.status !== undefined || query.active === 'true'
          ? {
              AND: [
                this.buildWhere(user),
                query.status === undefined ? {} : { status: query.status },
                query.active === 'true'
                  ? { status: { in: [...operationalStatuses] } }
                  : {},
              ],
            }
          : this.buildWhere(user),
      orderBy: { createdAt: 'desc' },
    });
  }

  async findVisibleById(ticketId: number, user: TicketVisibilityUser) {
    return this.prisma.$transaction(
      async (db) => {
        const ticket = await db.ticket.findFirst({
          where: { AND: [{ id: ticketId }, this.buildWhere(user)] },
          include: {
            workCycles: {
              orderBy: { sequenceNumber: 'desc' },
              take: 1,
              include: cycleInclude,
            },
            assignedManager: {
              select: { id: true, username: true, status: true },
            },
            assignedAgent: {
              select: { id: true, username: true, status: true },
            },
            assignedTeam: { select: { id: true, name: true } },
            tags: true,
            affectedRegions: true,
            affectedDepartments: true,
          },
        });

        if (!ticket) {
          throw new NotFoundException('Ticket not found');
        }

        return mapTicket(ticket);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async history(ticketId: number, user: TicketVisibilityUser) {
    // One consistent snapshot for parent authorization and independently filtered work.
    return this.prisma.$transaction(
      async (db) => {
        const ticket = await db.ticket.findFirst({
          where: { AND: [{ id: ticketId }, this.buildWhere(user)] },
          include: {
            assignedManager: {
              select: { id: true, username: true, status: true },
            },
            assignedAgent: {
              select: { id: true, username: true, status: true },
            },
            assignedTeam: { select: { id: true, name: true } },
          },
        });
        if (!ticket) throw new NotFoundException('Ticket not found');
        const cycles = await db.ticketWorkCycle.findMany({
          where: { ticketId },
          orderBy: { sequenceNumber: 'desc' },
          include: cycleInclude,
        });
        const subtasks =
          user.role === UserRole.EMPLOYEE
            ? []
            : await db.subtask.findMany({
                where: { AND: [{ ticketId }, this.buildSubtaskWhere(user)] },
                orderBy: { createdAt: 'asc' },
                include: {
                  assignedAgent: { select: { id: true, username: true } },
                  completedBy: { select: { id: true, username: true } },
                },
              });
        const access =
          user.role === UserRole.EMPLOYEE
            ? 'NONE'
            : user.role === UserRole.MANAGER
              ? ticket.assignedManagerId === user.id
                ? 'ALL'
                : 'NONE'
              : 'FILTERED';
        return {
          ticketId,
          currentCycleId: cycles[0]?.id ?? null,
          subtasksAccess: access,
          cycles: cycles.map((cycle, index) => ({
            ...mapCycle(cycle, index === 0, ticket),
            ...(access === 'NONE'
              ? {}
              : {
                  subtasks: subtasks.filter(
                    (subtask) => subtask.createdInCycleId === cycle.id,
                  ),
                }),
          })),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
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

  listVisibleSubtasks(
    user: TicketVisibilityUser,
    ticketId?: number,
    currentWork = false,
  ) {
    // No parent include: subtask-only access must not disclose parent-ticket data.
    return this.prisma.subtask.findMany({
      where: {
        AND: [
          this.buildSubtaskWhere(user),
          ticketId === undefined ? {} : { ticketId },
          ...(currentWork
            ? [
                {
                  status: {
                    in: ['TODO', 'IN_PROGRESS'] as ('TODO' | 'IN_PROGRESS')[],
                  },
                  createdInCycle: { outcome: null },
                  ticket: { status: { in: [...operationalStatuses] } },
                },
              ]
            : []),
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
