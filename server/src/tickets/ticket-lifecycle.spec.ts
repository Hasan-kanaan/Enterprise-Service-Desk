import { ConflictException, ForbiddenException } from '@nestjs/common';
import { TicketStatus, UserRole } from '../../generated/prisma/client';
import {
  TicketAuthorizationService,
  TicketAuthorizationSubject,
} from './ticket-authorization.service';
import { mapCycle } from './ticket-response.mapper';

describe('Lifecycle policies', () => {
  const policy = new TicketAuthorizationService();
  const ticket: TicketAuthorizationSubject = {
    requesterId: 1,
    assignedManagerId: 2,
    assignedAgentId: 3,
    assignedTeamId: 4,
    assignedTeam: { teamLeadId: 5 },
    status: 'RESOLVED',
  };
  it.each(['RESOLVED', 'CLOSED', 'CANCELLED'] as TicketStatus[])(
    'freezes every ordinary mutation for %s',
    (status) => {
      const subject = { ...ticket, status };
      const manager = { id: 2, role: UserRole.MANAGER };
      expect(() => policy.assertCanMutateTicket(manager, subject)).toThrow(
        ConflictException,
      );
      expect(() => policy.assertCanAssignManager(manager, subject)).toThrow(
        ConflictException,
      );
      expect(() => policy.assertCanAssignTicket(manager, subject, 4)).toThrow(
        ConflictException,
      );
      expect(() => policy.assertCanCreateSubtask(manager, subject, 4)).toThrow(
        ConflictException,
      );
    },
  );
  it.each(['RESOLVED', 'CLOSED'] as TicketStatus[])(
    'allows requester and responsible manager reopening %s',
    (status) => {
      policy.assertCanReopen(
        { id: 1, role: UserRole.EMPLOYEE },
        { ...ticket, status },
      );
      policy.assertCanReopen(
        { id: 2, role: UserRole.MANAGER },
        { ...ticket, status },
      );
    },
  );
  it.each([
    [3, UserRole.AGENT],
    [5, UserRole.AGENT],
    [6, UserRole.MANAGER],
    [1, UserRole.ADMIN],
    [1, UserRole.SUPER_ADMIN],
  ] as const)('denies reopen by %s/%s', (id, role) => {
    expect(() => policy.assertCanReopen({ id, role }, ticket)).toThrow(
      ForbiddenException,
    );
  });
  it('rejects reopening cancelled tickets', () => {
    expect(() =>
      policy.assertCanReopen(
        { id: 1, role: UserRole.EMPLOYEE },
        { ...ticket, status: 'CANCELLED' },
      ),
    ).toThrow(ConflictException);
  });
  it.each(['NEW', 'ASSIGNED'] as TicketStatus[])(
    'allows only requester cancellation from %s',
    (status) => {
      policy.assertCanCancel(
        { id: 1, role: UserRole.EMPLOYEE },
        { ...ticket, status },
      );
      expect(() =>
        policy.assertCanCancel(
          { id: 2, role: UserRole.MANAGER },
          { ...ticket, status },
        ),
      ).toThrow(ForbiddenException);
    },
  );
  it('does not substitute current owners for ended-cycle ownership', () => {
    const result = mapCycle(
      {
        id: 10,
        outcome: 'CLOSED',
        endingAgent: { id: 3, username: 'ali' },
        endingManager: null,
        endingTeam: null,
        ownershipSnapshotBasis: 'END_OF_WORK',
      } as any,
      false,
      {
        assignedAgent: { id: 9, username: 'mohammad' },
        assignedManager: null,
        assignedTeam: null,
      },
    );
    expect(result.ownership.agent).toEqual({ id: 3, username: 'ali' });
    expect(result.isEnded).toBe(true);
  });
});
