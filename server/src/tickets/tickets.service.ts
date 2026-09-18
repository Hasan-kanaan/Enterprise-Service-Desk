import {
  BadRequestException,
  ConflictException,
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
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { UpdateTicketManagerDto } from './dto/update-ticket-manager.dto';
import { CreateSubtaskDto } from './dto/create-subtask.dto';
import { UpdateSubtaskDto } from './dto/update-subtask.dto';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';

type Database = Prisma.TransactionClient;
const ticketInclude = {
  assignedTeam: { select: { teamLeadId: true } },
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

  async create(user: TicketAuthorizationUser, dto: CreateTicketDto) {
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

    return this.prisma.ticket.create({
      data: {
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
      const manager = await db.user.findUnique({
        where: { id: dto.assignedManagerId },
        select: { role: true },
      });
      if (!manager) throw new NotFoundException('Manager not found');
      if (manager.role !== UserRole.MANAGER)
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
      await this.validateAssignment(db, teamId, agentId);
      return db.ticket.update({
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
    });
  }

  async updateStatus(
    ticketId: number,
    user: TicketAuthorizationUser,
    status: TicketStatus,
  ) {
    return this.withTicket(ticketId, user, async (db, ticket) => {
      this.authorization.assertCanTransitionStatus(user, ticket, status);
      return db.ticket.update({
        where: { id: ticketId },
        data: {
          status,
          ...(status === TicketStatus.RESOLVED
            ? { resolvedAt: new Date() }
            : {}),
          ...(status === TicketStatus.CLOSED ? { closedAt: new Date() } : {}),
        },
      });
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
      return db.subtask.create({
        data: {
          ticketId,
          title: dto.title,
          description: dto.description,
          assignedTeamId,
          assignedAgentId,
        },
      });
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
      return db.subtask.update({
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
                completedAt:
                  dto.status === SubtaskStatus.COMPLETED
                    ? (subtask.completedAt ?? new Date())
                    : null,
              }),
        },
      });
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
    try {
      return await this.prisma.$transaction(
        async (db) => {
          // All ticket/subtask mutations use this same parent lock. Ownership, status,
          // and authorization are checked in the transaction that performs the write.
          const rows = await db.$queryRaw<
            Array<{ id: number }>
          >`SELECT id FROM "Ticket" WHERE id = ${id} FOR UPDATE`;
          if (rows.length === 0)
            throw new NotFoundException('Ticket not found');
          const ticket = await db.ticket.findUniqueOrThrow({
            where: { id },
            include: ticketInclude,
          });
          return action(db, ticket);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      // Do not automatically retry a stale claim as a transfer or reauthorize it
      // under changed ownership. The caller must explicitly reload and retry.
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        const adapterError = error.meta?.driverAdapterError as
          { cause?: { originalCode?: string } } | undefined;
        const sqlState = adapterError?.cause?.originalCode ?? error.meta?.code;
        const rawWriteConflict =
          error.code === 'P2010' &&
          (sqlState === '40001' || sqlState === '40P01');
        if (error.code === 'P2034' || rawWriteConflict) {
          throw new ConflictException(
            'Ticket changed concurrently; reload before retrying',
          );
        }
      }
      throw error;
    }
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
