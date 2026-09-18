import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma, TicketStatus, UserRole } from '../../generated/prisma/client';
import { TicketAuthorizationService } from './ticket-authorization.service';
import { TicketsService } from './tickets.service';

const manager = { id: 31, role: UserRole.MANAGER };
describe('TicketsService', () => {
  const db = {
    $queryRaw: jest.fn(),
    ticket: {
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    user: { findUnique: jest.fn() },
    team: { findUnique: jest.fn() },
    teamMember: { findUnique: jest.fn() },
    subtask: { findUnique: jest.fn(), update: jest.fn() },
  };
  const transaction = jest.fn();
  const service = new TicketsService(
    { ...db, $transaction: transaction } as any,
    new TicketAuthorizationService(),
  );
  let current: any;
  beforeEach(() => {
    jest.resetAllMocks();
    current = {
      id: 1,
      requesterId: 10,
      assignedManagerId: 31,
      assignedTeamId: 30,
      assignedAgentId: 20,
      assignedTeam: { teamLeadId: 21 },
      status: TicketStatus.IN_PROGRESS,
      resolvedAt: null,
      closedAt: null,
    };
    transaction.mockImplementation((callback) => callback(db));
    db.$queryRaw.mockResolvedValue([{ id: 1 }]);
    db.ticket.findUniqueOrThrow.mockImplementation(async () => current);
    db.ticket.update.mockImplementation(async ({ data }) => ({
      ...current,
      ...data,
    }));
    db.ticket.updateMany.mockResolvedValue({ count: 1 });
    db.team.findUnique.mockResolvedValue({ id: 30 });
    db.teamMember.findUnique.mockResolvedValue({
      user: { role: UserRole.AGENT },
    });
    db.user.findUnique.mockResolvedValue({ role: UserRole.MANAGER });
  });

  it('preserves an omitted agent and active status on reassignment', async () => {
    const result = await service.assign(1, manager, { teamId: 40 });
    expect(result.assignedAgentId).toBe(20);
    expect(result.status).toBe(TicketStatus.IN_PROGRESS);
    expect(result.resolvedAt).toBeNull();
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });

  it('rejects an incompatible retained agent without writing', async () => {
    db.teamMember.findUnique.mockResolvedValue(null);
    await expect(
      service.assign(1, manager, { teamId: 40 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.ticket.update).not.toHaveBeenCalled();
    await expect(
      service.assign(1, manager, { teamId: 40, agentId: null }),
    ).resolves.toMatchObject({ assignedAgentId: null });
  });

  it('assigns a team without requiring an agent and moves NEW to ASSIGNED', async () => {
    current = {
      ...current,
      status: TicketStatus.NEW,
      assignedTeamId: null,
      assignedAgentId: null,
      assignedTeam: null,
    };
    await expect(
      service.assign(1, manager, { teamId: 40 }),
    ).resolves.toMatchObject({
      status: TicketStatus.ASSIGNED,
      assignedAgentId: null,
    });
  });

  it('manager transfer writes no team, agent, status, or timestamp fields', async () => {
    await service.assignManager(1, manager, { assignedManagerId: 32 });
    expect(db.ticket.updateMany).toHaveBeenCalledWith({
      where: { id: 1, assignedManagerId: 31, status: TicketStatus.IN_PROGRESS },
      data: { assignedManagerId: 32 },
    });
  });

  it('does not authorize the destination team owner to take an unrelated ticket', async () => {
    await expect(
      service.assign(1, { id: 32, role: UserRole.MANAGER }, { teamId: 40 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.ticket.update).not.toHaveBeenCalled();
  });

  it('validates and persists the same explicit NULL subtask assignment', async () => {
    db.subtask.findUnique.mockResolvedValue({
      id: 2,
      ticketId: 1,
      assignedTeamId: 30,
      assignedAgentId: 20,
      assignedTeam: { teamLeadId: 21 },
    });
    await expect(
      service.updateSubtask(2, manager, { assignedTeamId: null }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.subtask.update).not.toHaveBeenCalled();
    await service.updateSubtask(2, manager, {
      assignedTeamId: null,
      assignedAgentId: null,
    });
    expect(db.subtask.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: expect.objectContaining({
        assignedTeamId: null,
        assignedAgentId: null,
      }),
    });
  });

  it.each([
    { code: 'P2034' },
    {
      code: 'P2010',
      meta: { driverAdapterError: { cause: { originalCode: '40001' } } },
    },
    { code: 'P2010', meta: { code: '40P01' } },
  ])(
    'turns serialization conflicts into 409 without retrying stale work: $code',
    async (error) => {
      transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('concurrent update', {
          ...error,
          clientVersion: 'test',
        }),
      );
      await expect(
        service.assignManager(1, manager, { assignedManagerId: 32 }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(transaction).toHaveBeenCalledTimes(1);
    },
  );
});
