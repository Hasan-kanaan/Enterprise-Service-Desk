import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '../../generated/prisma/client';
import { operationalStatuses } from '../prisma/transactions';
import { ListQuery, after, listPage, listWindow } from '../common/list-query';
import { ListSubtasksDto } from './dto/list-tickets.dto';
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
    if (user.role === UserRole.AGENT || user.role === UserRole.MANAGER)
      return { OR: [{ requesterId: user.id }, this.operationalWhere(user)] };
    return { requesterId: user.id };
  }

  operationalWhere(user: TicketVisibilityUser): Prisma.TicketWhereInput {
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
    if (user.role === UserRole.AGENT) return this.operationalWhere(user);
    if (user.role === UserRole.MANAGER) return { assignedManagerId: user.id };
    throw new ForbiddenException(
      'Support communication requires current support responsibility',
    );
  }

  private queueWhere(
    user: TicketVisibilityUser,
    queue?: string,
  ): Prisma.TicketWhereInput {
    if (queue === 'requests') return { requesterId: user.id };
    if (
      (user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN) &&
      queue
    )
      throw new ForbiddenException('Only the requests queue is available');
    switch (queue) {
      case 'intake':
        return user.role === UserRole.MANAGER
          ? { status: 'NEW', assignedManagerId: null }
          : { id: -1 };
      case 'mine':
        return user.role === UserRole.MANAGER
          ? { assignedManagerId: user.id }
          : user.role === UserRole.AGENT
            ? {
                OR: [
                  { assignedAgentId: user.id },
                  this.collaboratorWhere(user.id),
                ],
              }
            : { requesterId: user.id };
      case 'primary':
        return user.role === UserRole.AGENT
          ? { assignedAgentId: user.id }
          : { id: -1 };
      case 'collaboration':
        return user.role === UserRole.AGENT
          ? this.collaboratorWhere(user.id)
          : { id: -1 };
      case 'team':
        return user.role === UserRole.AGENT
          ? { assignedTeam: { teamLeadId: user.id } }
          : { id: -1 };
      default:
        return {};
    }
  }

  private listWhere(
    user: TicketVisibilityUser,
    query: ListTicketsDto,
  ): Prisma.TicketWhereInput {
    const { search } = listWindow(query);
    const reference = Number(query.search?.trim().replace(/^#/, ''));
    return {
      AND: [
        query.queue === 'requests' ||
        (user.role !== UserRole.AGENT && user.role !== UserRole.MANAGER)
          ? { requesterId: user.id }
          : this.operationalWhere(user),
        this.queueWhere(user, query.queue),
        query.status ? { status: query.status } : {},
        query.active === 'true'
          ? { status: { in: [...operationalStatuses] } }
          : query.active === 'false'
            ? { status: { notIn: [...operationalStatuses] } }
            : {},
        query.categoryId ? { categoryId: query.categoryId } : {},
        search
          ? {
              OR: [
                { title: { contains: search, mode: 'insensitive' } },
                ...(Number.isSafeInteger(reference) &&
                reference > 0 &&
                reference <= 2147483647
                  ? [{ id: reference }]
                  : []),
              ],
            }
          : {},
      ],
    };
  }

  async listVisible(user: TicketVisibilityUser, query: ListTicketsDto = {}) {
    const { limit, position } = listWindow(query);
    const where = { AND: [this.listWhere(user, query), after(position)] };
    return this.prisma.$transaction(
      async (db) => {
        const rows = await db.ticket.findMany({
          where,
          take: limit + 1,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        });
        // Aggregate only the bounded page's relationship flags; never expand all
        // subtasks or collect the IDs for an entire authorized queue.
        const collaborations =
          user.role === UserRole.AGENT && rows.length
            ? await db.subtask.groupBy({
                by: ['ticketId'],
                where: {
                  ticketId: { in: rows.map((row) => row.id) },
                  assignedAgentId: user.id,
                  createdInCycle: { outcome: null },
                },
              })
            : [];
        const ids = new Set(collaborations.map((row) => row.ticketId));
        return listPage(
          rows.map((ticket) => ({
            ...ticket,
            ...(user.role === UserRole.AGENT
              ? {
                  isCurrentCollaborator:
                    ids.has(ticket.id) &&
                    operationalStatuses.includes(
                      ticket.status as (typeof operationalStatuses)[number],
                    ),
                }
              : {}),
          })),
          limit,
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async summary(user: TicketVisibilityUser, queue?: string) {
    this.queueWhere(user, queue);
    const count = (query: ListTicketsDto) =>
      this.prisma.ticket.count({ where: this.listWhere(user, query) });
    if (
      queue === 'requests' ||
      (user.role !== UserRole.AGENT && user.role !== UserRole.MANAGER)
    ) {
      const [active, waiting, resolved] = await Promise.all([
        count({ queue: 'requests', active: 'true' }),
        count({ queue: 'requests', status: 'WAITING_FOR_EMPLOYEE' }),
        count({ queue: 'requests', status: 'RESOLVED' }),
      ]);
      return { counts: [active, waiting, resolved] };
    }
    const [first, second, tasks] = await Promise.all([
      count({
        queue: user.role === UserRole.MANAGER ? 'intake' : 'mine',
        active: 'true',
      }),
      count({
        queue: user.role === UserRole.MANAGER ? 'mine' : 'team',
        active: 'true',
      }),
      this.prisma.subtask.count({
        where: {
          AND: [
            this.buildSubtaskWhere(user),
            {
              status: { in: ['TODO', 'IN_PROGRESS'] },
              createdInCycle: { outcome: null },
              ticket: { status: { in: [...operationalStatuses] } },
            },
          ],
        },
      }),
    ]);
    return { counts: [first, second, tasks] };
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
              select: {
                id: true,
                username: true,
                displayName: true,
                status: true,
              },
            },
            assignedAgent: {
              select: {
                id: true,
                username: true,
                displayName: true,
                status: true,
              },
            },
            assignedTeam: { select: { id: true, name: true } },
            category: { select: { id: true, name: true } },
            tags: { include: { tag: { select: { id: true, name: true } } } },
            affectedRegions: {
              include: {
                region: { select: { id: true, name: true } },
              },
            },
            affectedDepartments: {
              include: {
                department: { select: { id: true, name: true } },
              },
            },
          },
        });

        if (!ticket) {
          throw new NotFoundException('Ticket not found');
        }

        const support =
          user.role === UserRole.AGENT || user.role === UserRole.MANAGER
            ? await db.ticket.findFirst({
                where: { AND: [{ id: ticketId }, this.operationalWhere(user)] },
                select: { id: true },
              })
            : null;
        const requester = support
          ? await db.user.findUnique({
              where: { id: ticket.requesterId },
              select: { status: true },
            })
          : null;
        return {
          ...mapTicket(ticket),
          ...(requester ? { requesterStatus: requester.status } : {}),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async history(
    ticketId: number,
    user: TicketVisibilityUser,
    query: ListQuery = {},
  ) {
    const { limit, position } = listWindow(query, false);
    // One consistent snapshot for parent authorization and independently filtered work.
    return this.prisma.$transaction(
      async (db) => {
        const ticket = await db.ticket.findFirst({
          where: { AND: [{ id: ticketId }, this.buildWhere(user)] },
          include: {
            assignedManager: {
              select: {
                id: true,
                username: true,
                displayName: true,
                status: true,
              },
            },
            assignedAgent: {
              select: {
                id: true,
                username: true,
                displayName: true,
                status: true,
              },
            },
            assignedTeam: { select: { id: true, name: true } },
          },
        });
        if (!ticket) throw new NotFoundException('Ticket not found');
        const latest = await db.ticketWorkCycle.findFirst({
          where: { ticketId },
          orderBy: { sequenceNumber: 'desc' },
          select: { id: true },
        });
        const cycles = await db.ticketWorkCycle.findMany({
          where: {
            ticketId,
            ...(position ? { sequenceNumber: { lt: position.id } } : {}),
          },
          take: limit + 1,
          orderBy: { sequenceNumber: 'desc' },
          include: cycleInclude,
        });
        const page = listPage(
          cycles.map((cycle) => ({ ...cycle, id: cycle.sequenceNumber })),
          limit,
          false,
        );
        const loadedCycles = cycles.slice(0, limit);
        const subtasks =
          user.role !== UserRole.AGENT && user.role !== UserRole.MANAGER
            ? []
            : await db.subtask.findMany({
                where: {
                  AND: [
                    {
                      ticketId,
                      createdInCycleId: {
                        in: loadedCycles.map((cycle) => cycle.id),
                      },
                    },
                    this.buildSubtaskWhere(user),
                  ],
                },
                take: 26,
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                include: {
                  assignedAgent: {
                    select: { id: true, username: true, displayName: true },
                  },
                  completedBy: {
                    select: { id: true, username: true, displayName: true },
                  },
                },
              });
        // A shared page budget avoids cycles * tasks fan-out. The boundary is
        // valid for each cycle: all its records newer than this boundary are
        // already included. hasMore is conservative until that cycle is opened.
        const tasksPage = listPage(subtasks, 25);
        const access =
          user.role !== UserRole.AGENT && user.role !== UserRole.MANAGER
            ? 'NONE'
            : user.role === UserRole.MANAGER
              ? ticket.assignedManagerId === user.id
                ? 'ALL'
                : 'NONE'
              : 'FILTERED';
        return {
          ticketId,
          currentCycleId: latest?.id ?? null,
          hasMore: page.hasMore,
          nextCursor: page.nextCursor,
          subtasksAccess: access,
          cycles: loadedCycles.map((cycle) => ({
            ...mapCycle(cycle, cycle.id === latest?.id, ticket),
            ...(access === 'NONE'
              ? {}
              : {
                  subtasksHasMore: tasksPage.hasMore,
                  subtasksNextCursor: tasksPage.nextCursor,
                  subtasks: tasksPage.items.filter(
                    (subtask) => subtask.createdInCycleId === cycle.id,
                  ),
                }),
          })),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async cycleSubtasks(
    ticketId: number,
    cycleId: number,
    user: TicketVisibilityUser,
    query: ListQuery = {},
  ) {
    const { limit, position } = listWindow(query);
    return this.prisma.$transaction(
      async (db) => {
        const ticket = await db.ticket.findFirst({
          where: { AND: [{ id: ticketId }, this.buildWhere(user)] },
          select: { id: true },
        });
        if (!ticket) throw new NotFoundException('Ticket not found');
        const rows = await db.subtask.findMany({
          where: {
            AND: [
              { ticketId, createdInCycleId: cycleId },
              this.buildSubtaskWhere(user),
              after(position),
            ],
          },
          take: limit + 1,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          include: {
            assignedAgent: {
              select: { id: true, username: true, displayName: true },
            },
            completedBy: {
              select: { id: true, username: true, displayName: true },
            },
          },
        });
        return listPage(rows, limit);
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

  async listVisibleSubtasks(
    user: TicketVisibilityUser,
    ticketId?: number,
    currentWork = false,
    query: ListSubtasksDto = {},
  ) {
    // No parent include: subtask-only access must not disclose parent-ticket data.
    const { limit, position, search } = listWindow(query);
    const rows = await this.prisma.subtask.findMany({
      where: {
        AND: [
          this.buildSubtaskWhere(user),
          after(position),
          search ? { title: { contains: search, mode: 'insensitive' } } : {},
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
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    return listPage(rows, limit);
  }

  async findVisibleSubtaskById(id: number, user: TicketVisibilityUser) {
    const subtask = await this.prisma.subtask.findFirst({
      where: { AND: [{ id }, this.buildSubtaskWhere(user)] },
    });
    if (!subtask) throw new NotFoundException('Subtask not found');
    return subtask;
  }
}
