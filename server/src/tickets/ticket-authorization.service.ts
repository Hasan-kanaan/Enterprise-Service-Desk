import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { TicketStatus, UserRole } from '../../generated/prisma/client';
import { TicketAuthorizationUser } from './ticket-authorization.types';

export type TicketAuthorizationSubject = {
  requesterId: number;
  assignedManagerId: number | null;
  assignedAgentId: number | null;
  assignedTeamId: number | null;
  status: TicketStatus;
  assignedTeam: { teamLeadId: number | null } | null;
};

export type SubtaskAuthorizationSubject = {
  assignedAgentId: number | null;
  assignedTeamId: number | null;
  assignedTeam: { teamLeadId: number | null } | null;
  ticket: TicketAuthorizationSubject;
};

@Injectable()
export class TicketAuthorizationService {
  assertServiceDeskUser(user: TicketAuthorizationUser) {
    if (
      user.role !== UserRole.EMPLOYEE &&
      user.role !== UserRole.AGENT &&
      user.role !== UserRole.MANAGER
    ) {
      throw new ForbiddenException(
        'System administration does not grant ticket access',
      );
    }
  }

  assertCanCreateTicket(user: TicketAuthorizationUser) {
    if (user.role !== UserRole.EMPLOYEE)
      throw new ForbiddenException('Only employees may create tickets');
  }

  isResponsibleManager(
    user: TicketAuthorizationUser,
    ticket: TicketAuthorizationSubject,
  ) {
    return (
      user.role === UserRole.MANAGER && ticket.assignedManagerId === user.id
    );
  }

  isTeamLead(
    user: TicketAuthorizationUser,
    team: { teamLeadId: number | null } | null,
  ) {
    return user.role === UserRole.AGENT && team?.teamLeadId === user.id;
  }

  assertActive(ticket: TicketAuthorizationSubject) {
    if (
      ticket.status === TicketStatus.RESOLVED ||
      ticket.status === TicketStatus.CLOSED ||
      ticket.status === TicketStatus.CANCELLED
    ) {
      throw new ConflictException(
        'Terminal tickets freeze metadata, ownership and subtasks',
      );
    }
  }

  assertCanMutateTicket(
    user: TicketAuthorizationUser,
    ticket: TicketAuthorizationSubject,
  ) {
    this.assertServiceDeskUser(user);
    this.assertActive(ticket);
    if (
      (user.role === UserRole.EMPLOYEE && ticket.requesterId === user.id) ||
      (user.role === UserRole.AGENT && ticket.assignedAgentId === user.id) ||
      this.isTeamLead(user, ticket.assignedTeam) ||
      this.isResponsibleManager(user, ticket)
    )
      return;
    throw new ForbiddenException(
      'You do not have permission to modify this ticket',
    );
  }

  assertCanAssignManager(
    user: TicketAuthorizationUser,
    ticket: TicketAuthorizationSubject,
  ) {
    this.assertServiceDeskUser(user);
    if (user.role !== UserRole.MANAGER)
      throw new ForbiddenException('Only managers may assign responsibility');
    this.assertActive(ticket);
    if (ticket.status === TicketStatus.NEW && ticket.assignedManagerId === null)
      return;
    if (this.isResponsibleManager(user, ticket)) return;
    throw new ForbiddenException(
      'Only the responsible manager may transfer this ticket',
    );
  }

  assertCanAssignTicket(
    user: TicketAuthorizationUser,
    ticket: TicketAuthorizationSubject,
    teamId: number,
  ) {
    this.assertServiceDeskUser(user);
    this.assertActive(ticket);
    if (this.isResponsibleManager(user, ticket)) return;
    if (
      this.isTeamLead(user, ticket.assignedTeam) &&
      teamId === ticket.assignedTeamId
    )
      return;
    throw new ForbiddenException(
      'Only the responsible manager may change the team; its Team Lead may assign agents',
    );
  }

  assertCanCreateSubtask(
    user: TicketAuthorizationUser,
    ticket: TicketAuthorizationSubject,
    teamId: number | null,
  ) {
    this.assertServiceDeskUser(user);
    this.assertActive(ticket);
    if (this.isResponsibleManager(user, ticket)) return;
    if (
      this.isTeamLead(user, ticket.assignedTeam) &&
      teamId !== null &&
      teamId === ticket.assignedTeamId
    )
      return;
    throw new ForbiddenException(
      'Subtask creation requires responsible-manager or parent-team lead authority',
    );
  }

  assertCanMutateSubtask(
    user: TicketAuthorizationUser,
    subtask: SubtaskAuthorizationSubject,
  ) {
    this.assertServiceDeskUser(user);
    this.assertActive(subtask.ticket);
    if (this.isResponsibleManager(user, subtask.ticket)) return;
    if (this.isTeamLead(user, subtask.assignedTeam)) return;
    if (user.role === UserRole.AGENT && subtask.assignedAgentId === user.id)
      return;
    throw new ForbiddenException(
      'Only the subtask assignee, its Team Lead, or responsible manager may modify it',
    );
  }

  assertCanAssignSubtask(
    user: TicketAuthorizationUser,
    subtask: SubtaskAuthorizationSubject,
    teamId: number | null,
  ) {
    this.assertCanMutateSubtask(user, subtask);
    if (this.isResponsibleManager(user, subtask.ticket)) return;
    if (
      this.isTeamLead(user, subtask.assignedTeam) &&
      teamId !== null &&
      teamId === subtask.assignedTeamId
    )
      return;
    throw new ForbiddenException(
      'Only the responsible manager may move subtasks; their Team Lead may assign agents',
    );
  }

  assertCanReopen(
    user: TicketAuthorizationUser,
    ticket: TicketAuthorizationSubject,
  ) {
    this.assertServiceDeskUser(user);
    if (!(
      (user.role === UserRole.EMPLOYEE && ticket.requesterId === user.id) ||
      this.isResponsibleManager(user, ticket)
    ))
      throw new ForbiddenException(
        'Only the requester or responsible manager may reopen',
      );
    if (
      ticket.status !== TicketStatus.RESOLVED &&
      ticket.status !== TicketStatus.CLOSED
    )
      throw new ConflictException('Only resolved or closed tickets may reopen');
  }

  assertCanCancel(
    user: TicketAuthorizationUser,
    ticket: TicketAuthorizationSubject,
  ) {
    if (user.role !== UserRole.EMPLOYEE || ticket.requesterId !== user.id)
      throw new ForbiddenException('Only the employee requester may cancel');
    if (
      ticket.status !== TicketStatus.NEW &&
      ticket.status !== TicketStatus.ASSIGNED
    )
      throw new ConflictException('Cancellation requires NEW or ASSIGNED');
  }

  assertCanTransitionStatus(
    user: TicketAuthorizationUser,
    ticket: TicketAuthorizationSubject,
    to: TicketStatus,
  ) {
    this.assertServiceDeskUser(user);
    // NEW -> ASSIGNED belongs exclusively to the primary-team assignment operation.
    const transitions: Record<TicketStatus, TicketStatus[]> = {
      NEW: [],
      ASSIGNED: [TicketStatus.IN_PROGRESS],
      IN_PROGRESS: [
        TicketStatus.WAITING_FOR_EMPLOYEE,
        TicketStatus.BLOCKED,
        TicketStatus.RESOLVED,
      ],
      WAITING_FOR_EMPLOYEE: [TicketStatus.IN_PROGRESS],
      BLOCKED: [TicketStatus.IN_PROGRESS],
      RESOLVED: [TicketStatus.CLOSED],
      CLOSED: [],
      CANCELLED: [],
    };
    if (!transitions[ticket.status].includes(to)) {
      throw new ConflictException(
        `The ticket cannot transition from ${ticket.status} to ${to}`,
      );
    }
    if (to === TicketStatus.CLOSED) {
      if (
        (user.role === UserRole.EMPLOYEE && ticket.requesterId === user.id) ||
        this.isResponsibleManager(user, ticket)
      )
        return;
    } else if (
      this.isResponsibleManager(user, ticket) ||
      this.isTeamLead(user, ticket.assignedTeam) ||
      (user.role === UserRole.AGENT && ticket.assignedAgentId === user.id)
    )
      return;
    throw new ForbiddenException(
      'You do not have permission to change this ticket status',
    );
  }
}
