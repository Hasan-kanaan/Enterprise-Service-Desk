import { SubtaskStatus, TicketStatus, UserRole } from '../../generated/prisma/client';
import { TicketsService } from './tickets.service';

describe('TicketsService', () => {
  const ticketFindUnique = jest.fn();
  const ticketUpdate = jest.fn();
  const subtaskFindUnique = jest.fn();
  const subtaskCreate = jest.fn();
  const subtaskUpdate = jest.fn();
  const assertCanAssignTicket = jest.fn();
  const assertCanTransitionStatus = jest.fn();
  const assertCanAssignSubtask = jest.fn();
  const assertCanMutateSubtask = jest.fn();

  const service = new TicketsService(
    {
      ticket: { findUnique: ticketFindUnique, update: ticketUpdate },
      subtask: {
        findUnique: subtaskFindUnique,
        create: subtaskCreate,
        update: subtaskUpdate,
      },
    } as any,
    {
      assertCanAssignTicket,
      assertCanTransitionStatus,
      assertCanAssignSubtask,
      assertCanMutateSubtask,
    } as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    ticketFindUnique.mockResolvedValue({ id: 1 });
    ticketUpdate.mockResolvedValue({ id: 1 });
    subtaskCreate.mockResolvedValue({ id: 2 });
    subtaskUpdate.mockResolvedValue({ id: 2 });
  });

  it('authorizes and persists team-first ticket assignment', async () => {
    await service.assign(1, { id: 31, role: UserRole.MANAGER }, { teamId: 30 });

    expect(assertCanAssignTicket).toHaveBeenCalledWith(
      { id: 31, role: UserRole.MANAGER },
      30,
      null,
    );
    expect(ticketUpdate).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { assignedTeamId: 30, assignedAgentId: null, status: TicketStatus.ASSIGNED },
    });
  });

  it('authorizes and persists status transitions', async () => {
    ticketFindUnique.mockResolvedValue({
      id: 1,
      requesterId: 10,
      assignedAgentId: 20,
      assignedTeamId: 30,
      status: TicketStatus.IN_PROGRESS,
      resolvedAt: null,
      closedAt: null,
      assignedTeam: { teamLeadId: 21, managers: [{ managerId: 31 }] },
    });

    await service.updateStatus(1, { id: 20, role: UserRole.AGENT }, TicketStatus.RESOLVED);

    expect(assertCanTransitionStatus).toHaveBeenCalledWith(
      { id: 20, role: UserRole.AGENT },
      expect.objectContaining({ assignedTeamId: 30 }),
      TicketStatus.IN_PROGRESS,
      TicketStatus.RESOLVED,
    );
    expect(ticketUpdate).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({ status: TicketStatus.RESOLVED, resolvedAt: expect.any(Date) }),
    });
  });

  it('authorizes and creates a subtask without changing the parent ticket', async () => {
    ticketFindUnique.mockResolvedValue({
      id: 1,
      requesterId: 10,
      assignedAgentId: 20,
      assignedTeamId: 30,
      status: TicketStatus.IN_PROGRESS,
      assignedTeam: { teamLeadId: 21, managers: [{ managerId: 31 }] },
    });

    await service.createSubtask(1, { id: 21, role: UserRole.AGENT }, {
      title: 'Investigate network path',
      description: 'Check regional connectivity',
      assignedTeamId: 30,
      assignedAgentId: 20,
    });

    expect(assertCanAssignSubtask).toHaveBeenCalledWith(
      { id: 21, role: UserRole.AGENT },
      expect.objectContaining({ assignedTeamId: 30 }),
      30,
      20,
    );
    expect(subtaskCreate).toHaveBeenCalledWith({
      data: {
        ticketId: 1,
        title: 'Investigate network path',
        description: 'Check regional connectivity',
        assignedTeamId: 30,
        assignedAgentId: 20,
      },
    });
  });

  it('authorizes subtask updates and clears completedAt when reopened', async () => {
    subtaskFindUnique.mockResolvedValue({
      id: 2,
      assignedAgentId: 20,
      assignedTeamId: 30,
      ticket: {
        requesterId: 10,
        assignedAgentId: 20,
        assignedTeamId: 30,
        assignedTeam: { teamLeadId: 21, managers: [{ managerId: 31 }] },
      },
    });

    await service.updateSubtask(2, { id: 20, role: UserRole.AGENT }, { status: SubtaskStatus.TODO });

    expect(assertCanMutateSubtask).toHaveBeenCalled();
    expect(subtaskUpdate).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { status: SubtaskStatus.TODO, completedAt: null },
    });
  });
});