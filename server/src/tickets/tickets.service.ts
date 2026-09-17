import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SubtaskStatus, TicketStatus } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  SubtaskAuthorizationSubject,
  TicketAuthorizationService,
  TicketAuthorizationSubject,
  SupportedTicketStatus,
} from './ticket-authorization.service';
import { TicketAuthorizationUser } from './ticket-authorization.types';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { CreateSubtaskDto } from './dto/create-subtask.dto';
import { UpdateSubtaskDto } from './dto/update-subtask.dto';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';

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
    this.validateScope(allDepartments, dto.affectedDepartmentIds, 'departments');
    await this.requireCategory(dto.categoryId);
    await this.requireRegions(dto.affectedRegionIds);
    await this.requireDepartments(dto.affectedDepartmentIds);
    await this.requireTags(dto.tagIds ?? []);

    return this.prisma.ticket.create({
      data: {
        title: dto.title,
        description: dto.description,
        requesterId: user.id,
        categoryId: dto.categoryId,
        priority: dto.priority,
        allRegions,
        allDepartments,
        affectedRegions: { create: dto.affectedRegionIds.map((regionId) => ({ regionId })) },
        affectedDepartments: { create: dto.affectedDepartmentIds.map((departmentId) => ({ departmentId })) },
        tags: { create: (dto.tagIds ?? []).map((tagId) => ({ tagId })) },
      },
    });
  }

  async update(ticketId: number, user: TicketAuthorizationUser, dto: UpdateTicketDto) {
    const ticket = await this.getEditableTicket(ticketId);
    this.authorization.assertCanMutateTicket(user, this.toTicketSubject(ticket));

    const allRegions = dto.allRegions ?? ticket.allRegions;
    const allDepartments = dto.allDepartments ?? ticket.allDepartments;
    const regionIds = dto.affectedRegionIds ?? (dto.allRegions === true ? [] : ticket.affectedRegions.map(({ regionId }) => regionId));
    const departmentIds = dto.affectedDepartmentIds ?? (dto.allDepartments === true ? [] : ticket.affectedDepartments.map(({ departmentId }) => departmentId));
    this.validateScope(allRegions, regionIds, 'regions');
    this.validateScope(allDepartments, departmentIds, 'departments');

    if (dto.categoryId !== undefined) await this.requireCategory(dto.categoryId);
    if (dto.affectedRegionIds !== undefined) await this.requireRegions(regionIds);
    if (dto.affectedDepartmentIds !== undefined) await this.requireDepartments(departmentIds);
    if (dto.tagIds !== undefined) await this.requireTags(dto.tagIds);

    const scopeChanged = dto.allRegions !== undefined || dto.allDepartments !== undefined ||
      dto.affectedRegionIds !== undefined || dto.affectedDepartmentIds !== undefined;

    return this.prisma.$transaction(async (transaction) => {
      if (scopeChanged) {
        await transaction.ticketRegion.deleteMany({ where: { ticketId } });
        await transaction.ticketDepartment.deleteMany({ where: { ticketId } });
        if (!allRegions) {
          await transaction.ticketRegion.createMany({ data: regionIds.map((regionId) => ({ ticketId, regionId })) });
        }
        if (!allDepartments) {
          await transaction.ticketDepartment.createMany({ data: departmentIds.map((departmentId) => ({ ticketId, departmentId })) });
        }
      }

      if (dto.tagIds !== undefined) {
        await transaction.ticketTagOnTicket.deleteMany({ where: { ticketId } });
        await transaction.ticketTagOnTicket.createMany({ data: dto.tagIds.map((tagId) => ({ ticketId, tagId })) });
      }

      return transaction.ticket.update({
        where: { id: ticketId },
        data: {
          ...(dto.title === undefined ? {} : { title: dto.title }),
          ...(dto.description === undefined ? {} : { description: dto.description }),
          ...(dto.categoryId === undefined ? {} : { categoryId: dto.categoryId }),
          ...(dto.priority === undefined ? {} : { priority: dto.priority }),
          ...(dto.allRegions === undefined ? {} : { allRegions }),
          ...(dto.allDepartments === undefined ? {} : { allDepartments }),
        },
      });
    });
  }

  async assign(ticketId: number, user: TicketAuthorizationUser, dto: AssignTicketDto) {
    await this.requireTicket(ticketId);
    await this.authorization.assertCanAssignTicket(user, dto.teamId, dto.agentId ?? null);

    return this.prisma.ticket.update({
      where: { id: ticketId },
      data: { assignedTeamId: dto.teamId, assignedAgentId: dto.agentId ?? null, status: TicketStatus.ASSIGNED },
    });
  }

  async updateStatus(ticketId: number, user: TicketAuthorizationUser, status: TicketStatus) {
    const ticket = await this.getTicketSubject(ticketId);
    this.authorization.assertCanTransitionStatus(
      user,
      ticket,
      ticket.status as SupportedTicketStatus,
      status as SupportedTicketStatus,
    );

    return this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status,
        resolvedAt: status === TicketStatus.RESOLVED ? new Date() : ticket.resolvedAt,
        closedAt: status === TicketStatus.CLOSED ? new Date() : ticket.closedAt,
      },
    });
  }

  async createSubtask(ticketId: number, user: TicketAuthorizationUser, dto: CreateSubtaskDto) {
    const ticket = await this.getTicketSubject(ticketId);
    const assignedTeamId = dto.assignedTeamId ?? null;
    const assignedAgentId = dto.assignedAgentId ?? null;
    await this.authorization.assertCanAssignSubtask(user, ticket, assignedTeamId, assignedAgentId);

    return this.prisma.subtask.create({
      data: {
        ticketId,
        title: dto.title,
        description: dto.description,
        assignedTeamId,
        assignedAgentId,
      },
    });
  }

  async updateSubtask(subtaskId: number, user: TicketAuthorizationUser, dto: UpdateSubtaskDto) {
    const subtask = await this.prisma.subtask.findUnique({
      where: { id: subtaskId },
      include: { ticket: { include: { assignedTeam: { include: { managers: true } } } } },
    });

    if (!subtask) throw new NotFoundException('Subtask not found');

    const ticket = this.toTicketSubject(subtask.ticket);
    const current: SubtaskAuthorizationSubject = {
      assignedAgentId: subtask.assignedAgentId,
      assignedTeamId: subtask.assignedTeamId,
      ticket,
    };
    this.authorization.assertCanMutateSubtask(user, current);

    const assignmentChanged = dto.assignedTeamId !== undefined || dto.assignedAgentId !== undefined;
    if (assignmentChanged) {
      await this.authorization.assertCanAssignSubtask(
        user,
        ticket,
        dto.assignedTeamId ?? subtask.assignedTeamId,
        dto.assignedAgentId ?? subtask.assignedAgentId,
      );
    }

    const completedAt = dto.status === SubtaskStatus.COMPLETED ? new Date() : null;
    return this.prisma.subtask.update({
      where: { id: subtaskId },
      data: {
        ...(dto.title === undefined ? {} : { title: dto.title }),
        ...(dto.description === undefined ? {} : { description: dto.description }),
        ...(dto.status === undefined ? {} : { status: dto.status, completedAt }),
        ...(dto.assignedTeamId === undefined ? {} : { assignedTeamId: dto.assignedTeamId }),
        ...(dto.assignedAgentId === undefined ? {} : { assignedAgentId: dto.assignedAgentId }),
      },
    });
  }

  private async requireTicket(id: number) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  private async getEditableTicket(id: number) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: {
        assignedTeam: { include: { managers: true } },
        affectedRegions: true,
        affectedDepartments: true,
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  private async requireCategory(id: number) {
    const category = await this.prisma.ticketCategory.findUnique({ where: { id }, select: { id: true } });
    if (!category) throw new NotFoundException('Ticket category not found');
  }

  private async requireRegions(ids: number[]) {
    const regions = await this.prisma.region.findMany({ where: { id: { in: ids } }, select: { id: true } });
    if (regions.length !== new Set(ids).size) throw new NotFoundException('One or more regions not found');
  }

  private async requireDepartments(ids: number[]) {
    const departments = await this.prisma.department.findMany({ where: { id: { in: ids } }, select: { id: true } });
    if (departments.length !== new Set(ids).size) throw new NotFoundException('One or more departments not found');
  }

  private async requireTags(ids: number[]) {
    const tags = await this.prisma.ticketTag.findMany({ where: { id: { in: ids } }, select: { id: true } });
    if (tags.length !== new Set(ids).size) throw new NotFoundException('One or more ticket tags not found');
  }

  private validateScope(all: boolean, ids: number[], label: string) {
    if (all && ids.length > 0) {
      throw new BadRequestException(`All ${label} cannot be combined with selected ${label}`);
    }
    if (!all && ids.length === 0) {
      throw new BadRequestException(`Select at least one affected ${label} or set all${label[0].toUpperCase()}${label.slice(1)} to true`);
    }
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException(`Duplicate affected ${label} are not allowed`);
    }
  }

  private async getTicketSubject(id: number): Promise<TicketAuthorizationSubject & { status: TicketStatus; resolvedAt: Date | null; closedAt: Date | null }> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: { assignedTeam: { include: { managers: true } } },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return this.toTicketSubject(ticket);
  }

  private toTicketSubject(ticket: any) {
    return {
      requesterId: ticket.requesterId,
      assignedAgentId: ticket.assignedAgentId,
      assignedTeamId: ticket.assignedTeamId,
      assignedTeam: ticket.assignedTeam,
      status: ticket.status,
      resolvedAt: ticket.resolvedAt,
      closedAt: ticket.closedAt,
    };
  }
}