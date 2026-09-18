import { ConflictException, ForbiddenException } from '@nestjs/common';
import { TicketStatus, UserRole } from '../../generated/prisma/client';
import {
  TicketAuthorizationService,
  TicketAuthorizationSubject,
  SubtaskAuthorizationSubject,
} from './ticket-authorization.service';

const user = (id: number, role: UserRole) => ({ id, role });
const ticket = (
  overrides: Partial<TicketAuthorizationSubject> = {},
): TicketAuthorizationSubject => ({
  requesterId: 10,
  assignedManagerId: 31,
  assignedAgentId: 20,
  assignedTeamId: 30,
  assignedTeam: { teamLeadId: 21 },
  status: TicketStatus.IN_PROGRESS,
  ...overrides,
});
const subtask = (
  overrides: Partial<SubtaskAuthorizationSubject> = {},
): SubtaskAuthorizationSubject => ({
  assignedTeamId: 40,
  assignedAgentId: 22,
  assignedTeam: { teamLeadId: 23 },
  ticket: ticket(),
  ...overrides,
});

describe('TicketAuthorizationService', () => {
  const service = new TicketAuthorizationService();

  it.each([UserRole.ADMIN, UserRole.SUPER_ADMIN])(
    'denies all %s ticket/subtask policies',
    (role) => {
      const actor = user(31, role);
      for (const operation of [
        () => service.assertCanCreateTicket(actor),
        () => service.assertCanMutateTicket(actor, ticket()),
        () => service.assertCanAssignManager(actor, ticket()),
        () => service.assertCanAssignTicket(actor, ticket(), 30),
        () => service.assertCanCreateSubtask(actor, ticket(), 30),
        () => service.assertCanMutateSubtask(actor, subtask()),
        () => service.assertCanAssignSubtask(actor, subtask(), 40),
        () =>
          service.assertCanTransitionStatus(
            actor,
            ticket(),
            TicketStatus.RESOLVED,
          ),
      ])
        expect(operation).toThrow(ForbiddenException);
    },
  );

  it('permits intake assignment but not general mutation by an unassigned manager', () => {
    const intake = ticket({
      status: TicketStatus.NEW,
      assignedManagerId: null,
      assignedTeamId: null,
      assignedAgentId: null,
      assignedTeam: null,
    });
    expect(() =>
      service.assertCanAssignManager(user(32, UserRole.MANAGER), intake),
    ).not.toThrow();
    expect(() =>
      service.assertCanMutateTicket(user(32, UserRole.MANAGER), intake),
    ).toThrow(ForbiddenException);
    expect(() =>
      service.assertCanAssignTicket(user(32, UserRole.MANAGER), intake, 30),
    ).toThrow(ForbiddenException);
  });

  it('only permits the responsible manager to transfer ownership or select a different team', () => {
    expect(() =>
      service.assertCanAssignManager(user(31, UserRole.MANAGER), ticket()),
    ).not.toThrow();
    expect(() =>
      service.assertCanAssignTicket(user(31, UserRole.MANAGER), ticket(), 999),
    ).not.toThrow();
    expect(() =>
      service.assertCanAssignManager(user(32, UserRole.MANAGER), ticket()),
    ).toThrow(ForbiddenException);
    expect(() =>
      service.assertCanAssignTicket(user(32, UserRole.MANAGER), ticket(), 30),
    ).toThrow(ForbiddenException);
  });

  it('restricts Team Lead primary assignment to their current team', () => {
    expect(() =>
      service.assertCanAssignTicket(user(21, UserRole.AGENT), ticket(), 30),
    ).not.toThrow();
    expect(() =>
      service.assertCanAssignTicket(user(21, UserRole.AGENT), ticket(), 40),
    ).toThrow(ForbiddenException);
    expect(() =>
      service.assertCanAssignManager(user(21, UserRole.AGENT), ticket()),
    ).toThrow(ForbiddenException);
    expect(() =>
      service.assertCanAssignTicket(user(20, UserRole.AGENT), ticket(), 30),
    ).toThrow(ForbiddenException);
  });

  it('separates subtask work from parent requester, primary agent, and parent Team Lead', () => {
    for (const actor of [
      user(10, UserRole.EMPLOYEE),
      user(20, UserRole.AGENT),
      user(21, UserRole.AGENT),
      user(32, UserRole.MANAGER),
    ]) {
      expect(() => service.assertCanMutateSubtask(actor, subtask())).toThrow(
        ForbiddenException,
      );
    }
    for (const actor of [
      user(22, UserRole.AGENT),
      user(23, UserRole.AGENT),
      user(31, UserRole.MANAGER),
    ]) {
      expect(() =>
        service.assertCanMutateSubtask(actor, subtask()),
      ).not.toThrow();
    }
  });

  it('allows Team Lead creation only for the parent primary team', () => {
    expect(() =>
      service.assertCanCreateSubtask(user(21, UserRole.AGENT), ticket(), 30),
    ).not.toThrow();
    for (const teamId of [null, 40])
      expect(() =>
        service.assertCanCreateSubtask(
          user(21, UserRole.AGENT),
          ticket(),
          teamId,
        ),
      ).toThrow(ForbiddenException);
    expect(() =>
      service.assertCanCreateSubtask(
        user(31, UserRole.MANAGER),
        ticket(),
        null,
      ),
    ).not.toThrow();
  });

  it('reserves subtask team changes for responsible managers', () => {
    expect(() =>
      service.assertCanAssignSubtask(user(31, UserRole.MANAGER), subtask(), 50),
    ).not.toThrow();
    expect(() =>
      service.assertCanAssignSubtask(user(23, UserRole.AGENT), subtask(), 40),
    ).not.toThrow();
    for (const teamId of [null, 50])
      expect(() =>
        service.assertCanAssignSubtask(
          user(23, UserRole.AGENT),
          subtask(),
          teamId,
        ),
      ).toThrow(ForbiddenException);
    expect(() =>
      service.assertCanAssignSubtask(user(22, UserRole.AGENT), subtask(), 40),
    ).toThrow(ForbiddenException);
  });

  it.each([TicketStatus.RESOLVED, TicketStatus.CLOSED])(
    'freezes ownership and all subtask work on %s',
    (status) => {
      const terminal = ticket({ status });
      const actor = user(31, UserRole.MANAGER);
      for (const operation of [
        () => service.assertCanAssignManager(actor, terminal),
        () => service.assertCanAssignTicket(actor, terminal, 30),
        () => service.assertCanCreateSubtask(actor, terminal, 30),
        () =>
          service.assertCanMutateSubtask(actor, subtask({ ticket: terminal })),
        () =>
          service.assertCanAssignSubtask(
            actor,
            subtask({ ticket: terminal }),
            40,
          ),
      ])
        expect(operation).toThrow(ConflictException);
    },
  );

  it('allows requester or responsible manager closure but not agents or unrelated managers', () => {
    const resolved = ticket({ status: TicketStatus.RESOLVED });
    for (const actor of [
      user(10, UserRole.EMPLOYEE),
      user(31, UserRole.MANAGER),
    ]) {
      expect(() =>
        service.assertCanTransitionStatus(actor, resolved, TicketStatus.CLOSED),
      ).not.toThrow();
    }
    for (const actor of [
      user(20, UserRole.AGENT),
      user(21, UserRole.AGENT),
      user(32, UserRole.MANAGER),
    ]) {
      expect(() =>
        service.assertCanTransitionStatus(actor, resolved, TicketStatus.CLOSED),
      ).toThrow(ForbiddenException);
    }
  });

  it('allows operational agents to resolve but forbids status-only initial assignment and reopening', () => {
    expect(() =>
      service.assertCanTransitionStatus(
        user(20, UserRole.AGENT),
        ticket(),
        TicketStatus.RESOLVED,
      ),
    ).not.toThrow();
    expect(() =>
      service.assertCanTransitionStatus(
        user(31, UserRole.MANAGER),
        ticket({ status: TicketStatus.NEW }),
        TicketStatus.ASSIGNED,
      ),
    ).toThrow(ConflictException);
    expect(() =>
      service.assertCanTransitionStatus(
        user(31, UserRole.MANAGER),
        ticket({ status: TicketStatus.CLOSED }),
        TicketStatus.IN_PROGRESS,
      ),
    ).toThrow(ConflictException);
  });
});
