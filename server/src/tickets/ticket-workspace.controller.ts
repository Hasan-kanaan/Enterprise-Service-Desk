import {
  Controller,
  Get,
  Req,
  Param,
  ParseIntPipe,
  UseGuards,
  NotFoundException,
  HttpException,
} from '@nestjs/common';
import { Prisma, TicketStatus, UserRole } from '../../generated/prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole as Role } from '../users/user-role.enum';
import { PrismaService } from '../prisma/prisma.service';
import { TicketVisibilityService } from './ticket-visibility.service';
import { TicketAuthorizationService } from './ticket-authorization.service';
import { TicketAuthorizationUser } from './ticket-authorization.types';

type Request = { user: { sub: number; role: UserRole } };
const person = { select: { id: true, username: true } } as const;
const subjectSelect = {
  requesterId: true,
  assignedManagerId: true,
  assignedAgentId: true,
  assignedTeamId: true,
  status: true,
  assignedTeam: { select: { teamLeadId: true } },
  workCycles: {
    orderBy: { sequenceNumber: 'desc' },
    take: 1,
    select: { id: true },
  },
} satisfies Prisma.TicketSelect;

// These are presentation hints from the same policies used by writes, not grants.
// Every mutation continues to lock/recheck the actor, relationships and lifecycle.
function allowed(check: () => void) {
  try {
    check();
    return true;
  } catch (error) {
    if (
      error instanceof HttpException &&
      [403, 409].includes(error.getStatus())
    )
      return false;
    throw error;
  }
}

@Controller('ticket-workspace')
@UseGuards(AuthGuard, RolesGuard)
@Roles(Role.MANAGER, Role.AGENT)
export class TicketWorkspaceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visibility: TicketVisibilityService,
    private readonly policy: TicketAuthorizationService,
  ) {}

  private actor(request: Request): TicketAuthorizationUser {
    return { id: request.user.sub, role: request.user.role };
  }

  @Get()
  async context(@Req() request: Request) {
    return {
      ledTeams:
        request.user.role === UserRole.AGENT
          ? await this.prisma.team.findMany({
              where: { teamLeadId: request.user.sub },
              select: { id: true, name: true },
              orderBy: { name: 'asc' },
            })
          : [],
    };
  }

  private async teams(
    db: Prisma.TransactionClient,
    all: boolean,
    teamId: number | null,
  ) {
    if (!all && teamId === null) return [];
    const teams = await db.team.findMany({
      where: all ? {} : { id: teamId! },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        members: {
          where: { user: { role: UserRole.AGENT, status: 'ACTIVE' } },
          select: { user: person },
          orderBy: { user: { username: 'asc' } },
        },
      },
    });
    return teams.map(({ members, ...team }) => ({
      ...team,
      agents: members.map((member) => member.user),
    }));
  }

  @Get('tickets/:ticketId')
  ticket(@Param('ticketId', ParseIntPipe) id: number, @Req() request: Request) {
    const user = this.actor(request);
    return this.prisma.$transaction(
      async (db) => {
        const ticket = await db.ticket.findFirst({
          where: { AND: [{ id }, this.visibility.buildWhere(user)] },
          select: subjectSelect,
        });
        if (!ticket) throw new NotFoundException('Ticket not found');
        const owned = this.policy.isResponsibleManager(user, ticket);
        const mutable = allowed(() =>
          this.policy.assertCanMutateTicket(user, ticket),
        );
        const assignAgent = allowed(() =>
          this.policy.assertCanAssignTicket(
            user,
            ticket,
            ticket.assignedTeamId ?? 0,
          ),
        );
        const createSubtask = allowed(() =>
          this.policy.assertCanCreateSubtask(
            user,
            ticket,
            ticket.assignedTeamId,
          ),
        );
        const assignManager = allowed(() =>
          this.policy.assertCanAssignManager(user, ticket),
        );
        return {
          permissions: {
            edit: mutable,
            take: assignManager && ticket.assignedManagerId === null,
            transfer: assignManager && owned,
            assignTeam: assignAgent && owned,
            assignAgent,
            createSubtask,
            reopen: allowed(() => this.policy.assertCanReopen(user, ticket)),
            statuses: Object.values(TicketStatus).filter((status) =>
              allowed(() =>
                this.policy.assertCanTransitionStatus(user, ticket, status),
              ),
            ),
          },
          teams:
            assignAgent || createSubtask
              ? await this.teams(db, owned, ticket.assignedTeamId)
              : [],
          managers:
            assignManager && owned
              ? await db.user.findMany({
                  where: { role: UserRole.MANAGER, status: 'ACTIVE' },
                  select: { id: true, username: true },
                  orderBy: { username: 'asc' },
                })
              : [],
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  @Get('subtasks/:subtaskId')
  subtask(
    @Param('subtaskId', ParseIntPipe) id: number,
    @Req() request: Request,
  ) {
    const user = this.actor(request);
    return this.prisma.$transaction(
      async (db) => {
        const record = await db.subtask.findFirst({
          where: { AND: [{ id }, this.visibility.buildSubtaskWhere(user)] },
          include: {
            ticket: { select: subjectSelect },
            assignedTeam: {
              select: { id: true, name: true, teamLeadId: true },
            },
            assignedAgent: person,
            completedBy: person,
          },
        });
        if (!record) throw new NotFoundException('Subtask not found');
        const historical =
          record.createdInCycleId !== record.ticket.workCycles[0]?.id;
        const frozen =
          historical || !allowed(() => this.policy.assertActive(record.ticket));
        const edit =
          !frozen &&
          allowed(() => this.policy.assertCanMutateSubtask(user, record));
        const assignAgent =
          !frozen &&
          allowed(() =>
            this.policy.assertCanAssignSubtask(
              user,
              record,
              record.assignedTeamId,
            ),
          );
        const assignTeam =
          assignAgent && this.policy.isResponsibleManager(user, record.ticket);
        const { ticket: _ticket, assignedTeam, ...subtask } = record;
        return {
          subtask: {
            ...subtask,
            assignedTeam: assignedTeam
              ? { id: assignedTeam.id, name: assignedTeam.name }
              : null,
          },
          historical,
          frozen,
          permissions: { edit, assignAgent, assignTeam },
          teams: assignAgent
            ? await this.teams(db, assignTeam, record.assignedTeamId)
            : [],
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
