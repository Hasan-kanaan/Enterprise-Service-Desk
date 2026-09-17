import { Injectable, NotFoundException } from '@nestjs/common';
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

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: TicketAuthorizationService,
  ) {}

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