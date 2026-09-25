import { UploadBatch } from './attachment-storage';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  SubtaskStatus,
  TicketStatus,
  UserRole,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TicketAuthorizationService } from './ticket-authorization.service';
import { TicketAuthorizationUser } from './ticket-authorization.types';
import {
  lockUser,
  requireActiveActor,
  serializable,
} from '../prisma/transactions';
import { ReopenTicketDto } from './dto/reopen-ticket.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { UpdateTicketManagerDto } from './dto/update-ticket-manager.dto';
import { CreateSubtaskDto } from './dto/create-subtask.dto';
import { UpdateSubtaskDto } from './dto/update-subtask.dto';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import {
  notify,
  supportRecipients,
} from '../notifications/notification-events';

type Database = Prisma.TransactionClient;
const ticketInclude = {
  assignedTeam: { select: { teamLeadId: true } },
  workCycles: { orderBy: { sequenceNumber: 'desc' }, take: 1 },
  affectedRegions: true,
  affectedDepartments: true,
} satisfies Prisma.TicketInclude;
type EditableTicket = Prisma.TicketGetPayload<{
  include: typeof ticketInclude;
}>;

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: TicketAuthorizationService,
  ) {}

  async create(
    user: TicketAuthorizationUser,
    dto: CreateTicketDto,
    batch?: UploadBatch,
  ) {
    this.authorization.assertCanCreateTicket(user);

    const allRegions = dto.allRegions ?? false;
    const allDepartments = dto.allDepartments ?? false;
    this.validateScope(allRegions, dto.affectedRegionIds, 'regions');
    this.validateScope(
      allDepartments,
      dto.affectedDepartmentIds,
      'departments',
    );
    await this.requireCategory(dto.categoryId);
    await this.requireRegions(dto.affectedRegionIds);
    await this.requireDepartments(dto.affectedDepartmentIds);
    await this.requireTags(dto.tagIds ?? []);

    return serializable(this.prisma, async (db) => {
      await requireActiveActor(db, user);
      const now = new Date();
      const ticket = await db.ticket.create({
        data: {
          attachments: {
            create: (batch?.files ?? []).map(
              ({ digest: _digest, ...file }) => ({
                ...file,
                uploaderId: user.id,
              }),
            ),
          },
          createdAt: now,
          workCycles: {
            create: {
              sequenceNumber: 1,
              type: 'ORIGINAL',
              startedAt: now,
              startedById: user.id,
            },
          },
          title: dto.title,
          description: dto.description,
          requesterId: user.id,
          assignedManagerId: null,
          assignedTeamId: null,
          assignedAgentId: null,
          status: TicketStatus.NEW,
          categoryId: dto.categoryId,
          priority: dto.priority,
          allRegions,
          allDepartments,
          affectedRegions: {
            create: dto.affectedRegionIds.map((regionId) => ({ regionId })),
          },
          affectedDepartments: {
            create: dto.affectedDepartmentIds.map((departmentId) => ({
              departmentId,
            })),
          },
          tags: { create: (dto.tagIds ?? []).map((tagId) => ({ tagId })) },
        },
      });
      if (batch) batch.used = true;
      return ticket;
    });
  }

  async update(
    ticketId: number,
    user: TicketAuthorizationUser,
    dto: UpdateTicketDto,
  ) {
    return this.withTicket(ticketId, user, async (db, ticket) => {
      this.authorization.assertCanMutateTicket(user, ticket);
      const allRegions = dto.allRegions ?? ticket.allRegions;
      const allDepartments = dto.allDepartments ?? ticket.allDepartments;
      const regionIds =
        dto.affectedRegionIds ??
        (dto.allRegions === true
          ? []
          : ticket.affectedRegions.map(({ regionId }) => regionId));
      const departmentIds =
        dto.affectedDepartmentIds ??
        (dto.allDepartments === true
          ? []
          : ticket.affectedDepartments.map(({ departmentId }) => departmentId));
      this.validateScope(allRegions, regionIds, 'regions');
      this.validateScope(allDepartments, departmentIds, 'departments');
      if (dto.categoryId !== undefined)
        await this.requireCategory(dto.categoryId, db);
      if (dto.affectedRegionIds !== undefined)
        await this.requireRegions(regionIds, db);
      if (dto.affectedDepartmentIds !== undefined)
        await this.requireDepartments(departmentIds, db);
      if (dto.tagIds !== undefined) await this.requireTags(dto.tagIds, db);
      if (dto.allRegions !== undefined || dto.affectedRegionIds !== undefined) {
        await db.ticketRegion.deleteMany({ where: { ticketId } });
        await db.ticketRegion.createMany({
          data: regionIds.map((regionId) => ({ ticketId, regionId })),
        });
      }
      if (
        dto.allDepartments !== undefined ||
        dto.affectedDepartmentIds !== undefined
      ) {
        await db.ticketDepartment.deleteMany({ where: { ticketId } });
        await db.ticketDepartment.createMany({
          data: departmentIds.map((departmentId) => ({
            ticketId,
            departmentId,
          })),
        });
      }
      if (dto.tagIds !== undefined) {
        await db.ticketTagOnTicket.deleteMany({ where: { ticketId } });
        await db.ticketTagOnTicket.createMany({
          data: dto.tagIds.map((tagId) => ({ ticketId, tagId })),
        });
      }
      return db.ticket.update({
        where: { id: ticketId },
        data: {
          title: dto.title,
          description: dto.description,
          categoryId: dto.categoryId,
          priority: dto.priority,
          allRegions,
          allDepartments,
        },
      });
    });
  }

  async assignManager(
    ticketId: number,
    user: TicketAuthorizationUser,
    dto: UpdateTicketManagerDto,
  ) {
    return this.withTicket(ticketId, user, async (db, ticket) => {
      this.authorization.assertCanAssignManager(user, ticket);
      const manager = await lockUser(db, dto.assignedManagerId);
      if (!manager) throw new NotFoundException('Manager not found');
      if (manager.status !== 'ACTIVE')
        throw new BadRequestException('Responsible manager must be active');
      if (manager?.role !== UserRole.MANAGER)
        throw new BadRequestException('Responsible user must be a MANAGER');
      const result = await db.ticket.updateMany({
        where: {
          id: ticketId,
          assignedManagerId: ticket.assignedManagerId,
          status: ticket.status,
        },
        data: { assignedManagerId: dto.assignedManagerId },
      });
      if (result.count !== 1)
        throw new ConflictException(
          'Ticket ownership changed; reload before retrying',
        );
      if (
        ticket.assignedManagerId !== null &&
        ticket.assignedManagerId !== dto.assignedManagerId
      )
        await notify(db, [dto.assignedManagerId], {
          type: 'MANAGER_TRANSFERRED',
          actorUserId: user.id,
          ticketId,
        });
      return db.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    });
  }

  async assign(
    ticketId: number,
    user: TicketAuthorizationUser,
    dto: AssignTicketDto,
  ) {
    return this.withTicket(ticketId, user, async (db, ticket) => {
      const teamId =
        dto.teamId === undefined ? ticket.assignedTeamId : dto.teamId;
      const agentId =
        dto.agentId === undefined ? ticket.assignedAgentId : dto.agentId;
      if (teamId === null)
        throw new BadRequestException(
          'Primary team must be explicitly assigned and cannot be cleared',
        );
      this.authorization.assertCanAssignTicket(user, ticket, teamId);
      if (this.authorization.isResponsibleManager(user, ticket)) {
        // Hold organizational responsibility through this assignment, including
        // when an administrator concurrently removes the TeamManager relation.
        await db.$queryRaw`SELECT "teamId" FROM "TeamManager" WHERE "teamId" = ${teamId} FOR SHARE`;
      }
      await this.validateAssignment(db, teamId, agentId);
      if (
        this.authorization.isResponsibleManager(user, ticket) &&
        !(await db.team.findFirst({
          where: {
            id: teamId,
            ...this.authorization.responsibleManagerTeamWhere(user.id),
          },
          select: { id: true },
        }))
      )
        throw new ForbiddenException(
          'Responsible managers may select only their organizationally managed teams or GLOBAL teams',
        );
      const result = await db.ticket.update({
        where: { id: ticketId },
        data: {
          assignedTeamId: teamId,
          assignedAgentId: agentId,
          status:
            ticket.status === TicketStatus.NEW
              ? TicketStatus.ASSIGNED
              : ticket.status,
        },
      });
      if (agentId !== null && agentId !== ticket.assignedAgentId)
        await notify(db, [agentId], {
          type: 'PRIMARY_AGENT_ASSIGNED',
          actorUserId: user.id,
          ticketId,
        });
      return result;
    });
  }

  async updateStatus(
    ticketId: number,
    user: TicketAuthorizationUser,
    status: TicketStatus,
    resolutionSummary?: string,
  ) {
    return this.withTicket(ticketId, user, async (db, ticket) => {
      this.authorization.assertCanTransitionStatus(user, ticket, status);
      if (resolutionSummary !== undefined && status !== TicketStatus.RESOLVED)
        throw new BadRequestException(
          'Resolution summary is only accepted when resolving',
        );
      const now = new Date();
      if (status === TicketStatus.RESOLVED)
        await this.endCycle(
          db,
          ticket,
          user.id,
          'RESOLVED',
          now,
          resolutionSummary,
        );
      if (status === TicketStatus.CLOSED)
        await db.ticketWorkCycle.update({
          where: { id: this.currentCycle(ticket).id },
          data: { outcome: 'CLOSED', closedAt: now, closedById: user.id },
        });
      const result = await db.ticket.update({
        where: { id: ticketId },
        data: {
          status,
          ...(status === TicketStatus.RESOLVED ? { resolvedAt: now } : {}),
          ...(status === TicketStatus.CLOSED ? { closedAt: now } : {}),
        },
      });
      if (status === 'WAITING_FOR_EMPLOYEE' || status === 'RESOLVED')
        await notify(db, [ticket.requesterId], {
          type: status,
          actorUserId: user.id,
          ticketId,
        });
      return result;
    });
  }

  async createSubtask(
    ticketId: number,
    user: TicketAuthorizationUser,
    dto: CreateSubtaskDto,
  ) {
    return this.withTicket(ticketId, user, async (db, ticket) => {
      const assignedTeamId = dto.assignedTeamId ?? null;
      const assignedAgentId = dto.assignedAgentId ?? null;
      this.authorization.assertCanCreateSubtask(user, ticket, assignedTeamId);
      await this.validateAssignment(db, assignedTeamId, assignedAgentId);
      const result = await db.subtask.create({
        data: {
          ticketId,
          createdInCycleId: this.currentCycle(ticket).id,
          title: dto.title,
          description: dto.description,
          assignedTeamId,
          assignedAgentId,
        },
      });
      if (assignedAgentId !== null)
        await notify(db, [assignedAgentId], {
          type: 'SUBTASK_ASSIGNED',
          actorUserId: user.id,
          ticketId,
          subtaskId: result.id,
        });
      return result;
    });
  }

  async updateSubtask(
    subtaskId: number,
    user: TicketAuthorizationUser,
    dto: UpdateSubtaskDto,
  ) {
    this.authorization.assertServiceDeskUser(user);
    // Parent ID is immutable. Re-read the subtask after locking its parent.
    const parent = await this.prisma.subtask.findUnique({
      where: { id: subtaskId },
      select: { ticketId: true },
    });
    if (!parent) throw new NotFoundException('Subtask not found');
    return this.withTicket(parent.ticketId, user, async (db, ticket) => {
      const subtask = await db.subtask.findUnique({
        where: { id: subtaskId },
        include: { assignedTeam: { select: { teamLeadId: true } } },
      });
      if (!subtask) throw new NotFoundException('Subtask not found');
      if (subtask.createdInCycleId !== this.currentCycle(ticket).id)
        throw new ConflictException(
          'Historical cycle subtasks are permanently frozen',
        );
      const subject = { ...subtask, ticket };
      this.authorization.assertCanMutateSubtask(user, subject);
      const assignedTeamId =
        dto.assignedTeamId === undefined
          ? subtask.assignedTeamId
          : dto.assignedTeamId;
      const assignedAgentId =
        dto.assignedAgentId === undefined
          ? subtask.assignedAgentId
          : dto.assignedAgentId;
      if (
        dto.assignedTeamId !== undefined ||
        dto.assignedAgentId !== undefined
      ) {
        this.authorization.assertCanAssignSubtask(
          user,
          subject,
          assignedTeamId,
        );
        await this.validateAssignment(db, assignedTeamId, assignedAgentId);
      }
      const result = await db.subtask.update({
        where: { id: subtaskId },
        data: {
          title: dto.title,
          description: dto.description,
          status: dto.status,
          assignedTeamId,
          assignedAgentId,
          ...(dto.status === undefined
            ? {}
            : {
                completedById:
                  dto.status === SubtaskStatus.COMPLETED
                    ? subtask.status === SubtaskStatus.COMPLETED
                      ? subtask.completedById
                      : user.id
                    : null,
                completedAt:
                  dto.status === SubtaskStatus.COMPLETED
                    ? (subtask.completedAt ?? new Date())
                    : null,
              }),
        },
      });
      if (
        assignedAgentId !== null &&
        assignedAgentId !== subtask.assignedAgentId
      )
        await notify(db, [assignedAgentId], {
          type: 'SUBTASK_ASSIGNED',
          actorUserId: user.id,
          ticketId: ticket.id,
          subtaskId,
        });
      return result;
    });
  }

  private async validateAssignment(
    db: Database,
    teamId: number | null,
    agentId: number | null,
  ) {
    if (teamId === null) {
      if (agentId !== null)
        throw new BadRequestException(
          'An assigned agent requires an assigned team',
        );
      return;
    }
    const team = await db.team.findUnique({
      where: { id: teamId },
      select: { id: true },
    });
    if (!team) throw new NotFoundException('Team not found');
    if (agentId !== null) {
      const agent = await lockUser(db, agentId);
      if (!agent || agent.status !== 'ACTIVE')
        throw new BadRequestException('Assigned agent must be active');
      const member = await db.teamMember.findUnique({
        where: { teamId_userId: { teamId, userId: agentId } },
        select: { user: { select: { role: true } } },
      });
      if (member?.user.role !== UserRole.AGENT) {
        throw new BadRequestException(
          'Assigned agent must be an AGENT member of the destination team; explicitly clear or change an incompatible agent',
        );
      }
    }
  }

  private async withTicket<T>(
    id: number,
    user: TicketAuthorizationUser,
    action: (db: Database, ticket: EditableTicket) => Promise<T>,
  ): Promise<T> {
    this.authorization.assertServiceDeskUser(user);
    return serializable(this.prisma, async (db) => {
      const rows = await db.$queryRaw<
        Array<{ id: number }>
      >`SELECT id FROM "Ticket" WHERE id = ${id} FOR UPDATE`;
      if (rows.length === 0) throw new NotFoundException('Ticket not found');
      await requireActiveActor(db, user);
      const ticket = await db.ticket.findUniqueOrThrow({
        where: { id },
        include: ticketInclude,
      });
      return action(db, ticket);
    });
  }

  private currentCycle(ticket: EditableTicket) {
    const cycle = ticket.workCycles[0];
    if (!cycle)
      throw new ConflictException('Ticket requires work-cycle migration');
    return cycle;
  }

  private async endCycle(
    db: Database,
    ticket: EditableTicket,
    actorId: number,
    outcome: 'RESOLVED' | 'CANCELLED',
    now: Date,
    resolutionSummary?: string,
  ) {
    await db.ticketWorkCycle.update({
      where: { id: this.currentCycle(ticket).id },
      data: {
        outcome,
        endedAt: now,
        endedById: actorId,
        resolutionSummary,
        endingManagerId: ticket.assignedManagerId,
        endingTeamId: ticket.assignedTeamId,
        endingAgentId: ticket.assignedAgentId,
        ownershipSnapshotBasis: 'END_OF_WORK',
        ownershipCapturedAt: now,
      },
    });
  }

  cancel(ticketId: number, user: TicketAuthorizationUser) {
    return this.withTicket(ticketId, user, async (db, ticket) => {
      this.authorization.assertCanCancel(user, ticket);
      const now = new Date();
      await this.endCycle(db, ticket, user.id, 'CANCELLED', now);
      return db.ticket.update({
        where: { id: ticketId },
        data: { status: 'CANCELLED' },
      });
    });
  }

  reopen(
    ticketId: number,
    user: TicketAuthorizationUser,
    dto: ReopenTicketDto,
  ) {
    return this.withTicket(ticketId, user, async (db, ticket) => {
      this.authorization.assertCanReopen(user, ticket);
      const previous = this.currentCycle(ticket);
      const manager =
        ticket.assignedManagerId === null
          ? null
          : await lockUser(db, ticket.assignedManagerId);
      let intake = !manager || manager.status !== 'ACTIVE';
      let agentId = ticket.assignedAgentId;
      if (!intake) {
        if (manager?.role !== UserRole.MANAGER)
          throw new ConflictException('Invalid retained manager');
        const team =
          ticket.assignedTeamId === null
            ? null
            : await db.team.findUnique({
                where: { id: ticket.assignedTeamId },
              });
        if (!team) {
          if (!dto.returnToIntake)
            throw new ConflictException(
              'Invalid legacy team; explicitly request returnToIntake',
            );
          intake = true;
        } else if (agentId !== null) {
          const agent = await lockUser(db, agentId);
          if (agent?.status === 'INACTIVE') agentId = null;
          else {
            const member = await db.teamMember.findUnique({
              where: { teamId_userId: { teamId: team.id, userId: agentId } },
            });
            if (!agent || agent.role !== UserRole.AGENT || !member) {
              if (!dto.returnToIntake)
                throw new ConflictException(
                  'Invalid legacy agent; explicitly request returnToIntake',
                );
              intake = true;
            }
          }
        }
      }
      if (dto.returnToIntake && !intake)
        throw new BadRequestException(
          'Intake restart is reserved for invalid historical routing',
        );
      const now = new Date();
      await db.ticketWorkCycle.create({
        data: {
          ticketId,
          sequenceNumber: previous.sequenceNumber + 1,
          type: 'REOPENED',
          startedAt: now,
          startedById: user.id,
          startReason: dto.reason,
          startDisposition: intake ? 'RETURN_TO_INTAKE' : 'CONTINUE',
        },
      });
      const result = await db.ticket.update({
        where: { id: ticketId },
        data: {
          status: intake ? 'NEW' : 'IN_PROGRESS',
          resolvedAt: null,
          closedAt: null,
          assignedManagerId: intake ? null : ticket.assignedManagerId,
          assignedTeamId: intake ? null : ticket.assignedTeamId,
          assignedAgentId: intake ? null : agentId,
        },
      });
      const recipients =
        user.role === UserRole.EMPLOYEE
          ? await supportRecipients(db, ticketId, false)
          : [ticket.requesterId];
      await notify(db, recipients, {
        type: 'REOPENED',
        actorUserId: user.id,
        ticketId,
      });
      return result;
    });
  }

  private async requireCategory(id: number, db: Database = this.prisma) {
    const category = await db.ticketCategory.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!category) throw new NotFoundException('Ticket category not found');
  }

  private async requireRegions(ids: number[], db: Database = this.prisma) {
    const regions = await db.region.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    if (regions.length !== new Set(ids).size)
      throw new NotFoundException('One or more regions not found');
  }

  private async requireDepartments(ids: number[], db: Database = this.prisma) {
    const departments = await db.department.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    if (departments.length !== new Set(ids).size)
      throw new NotFoundException('One or more departments not found');
  }

  private async requireTags(ids: number[], db: Database = this.prisma) {
    const tags = await db.ticketTag.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    if (tags.length !== new Set(ids).size)
      throw new NotFoundException('One or more ticket tags not found');
  }

  private validateScope(all: boolean, ids: number[], label: string) {
    if (all && ids.length > 0) {
      throw new BadRequestException(
        `All ${label} cannot be combined with selected ${label}`,
      );
    }
    if (!all && ids.length === 0) {
      throw new BadRequestException(
        `Select at least one affected ${label} or set all${label[0].toUpperCase()}${label.slice(1)} to true`,
      );
    }
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException(
        `Duplicate affected ${label} are not allowed`,
      );
    }
  }
}
