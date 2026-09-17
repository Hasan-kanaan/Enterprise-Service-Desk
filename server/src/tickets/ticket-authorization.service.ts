import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { TicketStatus, UserRole } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TicketAuthorizationUser } from './ticket-authorization.types';

export type TicketAuthorizationSubject = {
  requesterId: number;
  assignedAgentId: number | null;
  assignedTeamId: number | null;
  assignedTeam?: {
    teamLeadId: number | null;
    managers?: Array<{ managerId: number }>;
  } | null;
};

export type SubtaskAuthorizationSubject = {
  assignedAgentId: number | null;
  assignedTeamId: number | null;
  ticket: TicketAuthorizationSubject;
};

export type SupportedTicketStatus = TicketStatus | 'BLOCKED';

@Injectable()
export class TicketAuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  assertCanCreateTicket(user: TicketAuthorizationUser) {
    if (user.role === UserRole.EMPLOYEE || user.role === UserRole.SUPER_ADMIN) return;
    throw new ForbiddenException('Only employees may create tickets');
  }

  assertCanMutateTicket(user: TicketAuthorizationUser, ticket: TicketAuthorizationSubject) {
    if (user.role === UserRole.SUPER_ADMIN) return;
    this.assertAdminDecision(user);

    if (this.isOperationalUserForTicket(user, ticket)) return;

    throw new ForbiddenException('You do not have permission to modify this ticket');
  }

  async assertCanAssignTicket(
    user: TicketAuthorizationUser,
    teamId: number,
    agentId: number | null,
  ) {
    if (user.role === UserRole.ADMIN) this.assertAdminDecision(user);
    if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.MANAGER && user.role !== UserRole.AGENT) {
      throw new ForbiddenException('You do not have permission to assign tickets');
    }

    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: {
        id: true,
        teamLeadId: true,
        managers: { select: { managerId: true } },
        members: { where: agentId === null ? undefined : { userId: agentId }, select: { userId: true, user: { select: { role: true } } } },
      },
    });

    if (!team) throw new NotFoundException('Team not found');

    const controlsTeam =
      user.role === UserRole.SUPER_ADMIN ||
      (user.role === UserRole.MANAGER && team.managers.some(({ managerId }) => managerId === user.id)) ||
      (user.role === UserRole.AGENT && team.teamLeadId === user.id);

    if (!controlsTeam) {
      throw new ForbiddenException('You do not have permission to assign this team');
    }

    if (agentId !== null && (team.members.length !== 1 || team.members[0].user.role !== UserRole.AGENT)) {
      throw new ForbiddenException('The assigned agent must be an AGENT member of the team');
    }
  }

  assertCanCreateSubtask(user: TicketAuthorizationUser, ticket: TicketAuthorizationSubject) {
    if (user.role === UserRole.SUPER_ADMIN) return;
    this.assertAdminDecision(user);

    if (user.role === UserRole.MANAGER && this.isOperationalUserForTicket(user, ticket)) {
      return;
    }

    if (user.role === UserRole.AGENT && ticket.assignedTeam?.teamLeadId === user.id) {
      return;
    }

    throw new ForbiddenException('You do not have permission to create a subtask');
  }

  async assertCanAssignSubtask(
    user: TicketAuthorizationUser,
    ticket: TicketAuthorizationSubject,
    teamId: number | null,
    agentId: number | null,
  ) {
    if (teamId === null && agentId !== null) {
      throw new BadRequestException('A subtask agent requires an assigned team');
    }

    this.assertCanCreateSubtask(user, ticket);

    if (teamId !== null) {
      await this.assertCanAssignTicket(user, teamId, agentId);
    }
  }

  assertCanMutateSubtask(user: TicketAuthorizationUser, subtask: SubtaskAuthorizationSubject) {
    if (user.role === UserRole.SUPER_ADMIN) return;
    this.assertAdminDecision(user);

    if (user.role === UserRole.AGENT && subtask.assignedAgentId === user.id) return;
    if (this.isOperationalUserForTicket(user, subtask.ticket)) return;

    throw new ForbiddenException('You do not have permission to modify this subtask');
  }

  assertCanTransitionStatus(
    user: TicketAuthorizationUser,
    ticket: TicketAuthorizationSubject,
    from: SupportedTicketStatus,
    to: SupportedTicketStatus,
  ) {
    if (!this.isAllowedTransition(from, to)) {
      throw new ForbiddenException(`The ticket cannot transition from ${from} to ${to}`);
    }

    if (user.role === UserRole.SUPER_ADMIN) return;
    this.assertAdminDecision(user);

    if (
      user.role === UserRole.EMPLOYEE &&
      ticket.requesterId === user.id &&
      from === TicketStatus.RESOLVED &&
      to === TicketStatus.CLOSED
    ) {
      return;
    }

    if (to === TicketStatus.CLOSED && user.role !== UserRole.MANAGER) {
      throw new ForbiddenException('Only the requester, a manager, or SUPER_ADMIN may close a ticket');
    }

    if (user.role === UserRole.AGENT || user.role === UserRole.MANAGER) {
      if (this.isOperationalUserForTicket(user, ticket)) return;
    }

    throw new ForbiddenException('You do not have permission to change this ticket status');
  }

  private isOperationalUserForTicket(user: TicketAuthorizationUser, ticket: TicketAuthorizationSubject) {
    if (user.role === UserRole.EMPLOYEE) return ticket.requesterId === user.id;
    if (user.role === UserRole.AGENT) {
      return ticket.assignedAgentId === user.id || ticket.assignedTeam?.teamLeadId === user.id;
    }
    if (user.role === UserRole.MANAGER) {
      return ticket.assignedTeam?.managers?.some(({ managerId }) => managerId === user.id) ?? false;
    }
    return false;
  }

  private assertAdminDecision(user: TicketAuthorizationUser) {
    if (user.role === UserRole.ADMIN) {
      throw new ForbiddenException('ADMIN users do not have ticket access');
    }
  }

  private isAllowedTransition(from: SupportedTicketStatus, to: SupportedTicketStatus) {
    const transitions: Record<SupportedTicketStatus, SupportedTicketStatus[]> = {
      NEW: [TicketStatus.ASSIGNED],
      ASSIGNED: [TicketStatus.IN_PROGRESS],
      IN_PROGRESS: [TicketStatus.WAITING_FOR_EMPLOYEE, 'BLOCKED', TicketStatus.RESOLVED],
      WAITING_FOR_EMPLOYEE: [TicketStatus.IN_PROGRESS],
      BLOCKED: [TicketStatus.IN_PROGRESS],
      RESOLVED: [TicketStatus.CLOSED],
      CLOSED: [],
    };

    return transitions[from].includes(to);
  }
}