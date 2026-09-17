import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TicketStatus, UserRole } from '../../generated/prisma/client';
import { TicketAuthorizationService, TicketAuthorizationSubject } from './ticket-authorization.service';
import { TicketAuthorizationUser } from './ticket-authorization.types';

const user = (id: number, role: UserRole): TicketAuthorizationUser => ({ id, role });
const ticket = (overrides: Partial<TicketAuthorizationSubject> = {}): TicketAuthorizationSubject => ({
  requesterId: 10,
  assignedAgentId: 20,
  assignedTeamId: 30,
  assignedTeam: { teamLeadId: 21, managers: [{ managerId: 31 }] },
  ...overrides,
});

describe('TicketAuthorizationService', () => {
  const teamFindUnique = jest.fn();
  const service = new TicketAuthorizationService({
    team: { findUnique: teamFindUnique },
  } as any);

  beforeEach(() => jest.clearAllMocks());

  it('allows ticket mutation for the requester, direct agent, Team Lead, manager, and SUPER_ADMIN', () => {
    expect(() => service.assertCanMutateTicket(user(10, UserRole.EMPLOYEE), ticket())).not.toThrow();
    expect(() => service.assertCanMutateTicket(user(20, UserRole.AGENT), ticket())).not.toThrow();
    expect(() => service.assertCanMutateTicket(user(21, UserRole.AGENT), ticket())).not.toThrow();
    expect(() => service.assertCanMutateTicket(user(31, UserRole.MANAGER), ticket())).not.toThrow();
    expect(() => service.assertCanMutateTicket(user(1, UserRole.SUPER_ADMIN), ticket())).not.toThrow();
  });

  it('rejects unrelated employees, agents, and managers from ticket mutation', () => {
    expect(() => service.assertCanMutateTicket(user(11, UserRole.EMPLOYEE), ticket())).toThrow(ForbiddenException);
    expect(() => service.assertCanMutateTicket(user(22, UserRole.AGENT), ticket())).toThrow(ForbiddenException);
    expect(() => service.assertCanMutateTicket(user(32, UserRole.MANAGER), ticket())).toThrow(ForbiddenException);
  });

  it('does not guess ADMIN ticket mutation access', () => {
    expect(() => service.assertCanMutateTicket(user(40, UserRole.ADMIN), ticket())).toThrow(
      'ADMIN users do not have ticket access',
    );
  });

  it('allows a manager or Team Lead to assign a team and optional agent', async () => {
    teamFindUnique.mockResolvedValue({
      id: 30,
      teamLeadId: 21,
      managers: [{ managerId: 31 }],
      members: [{ userId: 20, user: { role: UserRole.AGENT } }],
    });

    await expect(service.assertCanAssignTicket(user(31, UserRole.MANAGER), 30, 20)).resolves.toBeUndefined();
    await expect(service.assertCanAssignTicket(user(21, UserRole.AGENT), 30, null)).resolves.toBeUndefined();
  });

  it('requires an assigned agent to be an AGENT member of the target team', async () => {
    teamFindUnique.mockResolvedValue({ id: 30, teamLeadId: 21, managers: [{ managerId: 31 }], members: [] });

    await expect(service.assertCanAssignTicket(user(31, UserRole.MANAGER), 30, 20)).rejects.toThrow(
      'assigned agent must be an AGENT member',
    );
  });

  it('rejects assignment by ordinary agents and unrelated managers', async () => {
    teamFindUnique.mockResolvedValue({ id: 30, teamLeadId: 21, managers: [{ managerId: 31 }], members: [] });

    await expect(service.assertCanAssignTicket(user(22, UserRole.AGENT), 30, null)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.assertCanAssignTicket(user(32, UserRole.MANAGER), 30, null)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows Team Leads and managers to create subtasks, but not ordinary agents', () => {
    expect(() => service.assertCanCreateSubtask(user(21, UserRole.AGENT), ticket())).not.toThrow();
    expect(() => service.assertCanCreateSubtask(user(31, UserRole.MANAGER), ticket())).not.toThrow();
    expect(() => service.assertCanCreateSubtask(user(20, UserRole.AGENT), ticket())).toThrow(ForbiddenException);
    expect(() => service.assertCanCreateSubtask(user(22, UserRole.AGENT), ticket())).toThrow(ForbiddenException);
  });

  it('allows an agent to modify only a subtask assigned to them', () => {
    const subtask = { assignedAgentId: 20, assignedTeamId: 30, ticket: ticket() };
    expect(() => service.assertCanMutateSubtask(user(20, UserRole.AGENT), subtask)).not.toThrow();
    expect(() => service.assertCanMutateSubtask(user(22, UserRole.AGENT), subtask)).toThrow(ForbiddenException);
  });

  it('allows Team Leads and managers to modify subtasks for their ticket scope', () => {
    const subtask = { assignedAgentId: 20, assignedTeamId: 30, ticket: ticket() };
    expect(() => service.assertCanMutateSubtask(user(21, UserRole.AGENT), subtask)).not.toThrow();
    expect(() => service.assertCanMutateSubtask(user(31, UserRole.MANAGER), subtask)).not.toThrow();
  });

  it('allows the requester to close only a resolved own ticket', () => {
    expect(() => service.assertCanTransitionStatus(user(10, UserRole.EMPLOYEE), ticket(), TicketStatus.RESOLVED, TicketStatus.CLOSED)).not.toThrow();
    expect(() => service.assertCanTransitionStatus(user(10, UserRole.EMPLOYEE), ticket(), TicketStatus.IN_PROGRESS, TicketStatus.CLOSED)).toThrow(ForbiddenException);
  });

  it('allows agents and Team Leads to resolve operational tickets', () => {
    expect(() => service.assertCanTransitionStatus(user(20, UserRole.AGENT), ticket(), TicketStatus.IN_PROGRESS, TicketStatus.RESOLVED)).not.toThrow();
    expect(() => service.assertCanTransitionStatus(user(21, UserRole.AGENT), ticket(), TicketStatus.IN_PROGRESS, TicketStatus.RESOLVED)).not.toThrow();
  });

  it('allows managers to close managed tickets and rejects unrelated managers', () => {
    expect(() => service.assertCanTransitionStatus(user(31, UserRole.MANAGER), ticket(), TicketStatus.RESOLVED, TicketStatus.CLOSED)).not.toThrow();
    expect(() => service.assertCanTransitionStatus(user(32, UserRole.MANAGER), ticket(), TicketStatus.RESOLVED, TicketStatus.CLOSED)).toThrow(ForbiddenException);
  });

  it('rejects invalid status transitions before checking role access', () => {
    expect(() => service.assertCanTransitionStatus(user(31, UserRole.MANAGER), ticket(), TicketStatus.NEW, TicketStatus.CLOSED)).toThrow(
      'cannot transition',
    );
  });

  it('preserves NULL ownership and rejects operational actions without an owner', () => {
    const unassigned = ticket({ assignedAgentId: null, assignedTeamId: null, assignedTeam: null });
    expect(() => service.assertCanMutateTicket(user(22, UserRole.AGENT), unassigned)).toThrow(ForbiddenException);
    expect(() => service.assertCanCreateSubtask(user(31, UserRole.MANAGER), unassigned)).toThrow(ForbiddenException);
  });

  it('returns not found when assignment targets a missing team', async () => {
    teamFindUnique.mockResolvedValue(null);
    await expect(service.assertCanAssignTicket(user(31, UserRole.MANAGER), 999, null)).rejects.toBeInstanceOf(NotFoundException);
  });
});