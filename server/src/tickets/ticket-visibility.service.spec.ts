import { PrismaService } from '../prisma/prisma.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '../../generated/prisma/client';
import {
  TicketVisibilityService,
  TicketVisibilityUser,
} from './ticket-visibility.service';

const employee = (id: number): TicketVisibilityUser => ({
  id,
  role: UserRole.EMPLOYEE,
});
const agent = (id: number): TicketVisibilityUser => ({
  id,
  role: UserRole.AGENT,
});
const manager = (id: number): TicketVisibilityUser => ({
  id,
  role: UserRole.MANAGER,
});

describe('TicketVisibilityService', () => {
  const findMany = jest.fn();
  const findFirst = jest.fn();
  const count = jest.fn();
  const service = new TicketVisibilityService({
    $transaction: (action: (db: any) => unknown) =>
      action({ ticket: { findMany, findFirst, count } }),
    ticket: { findMany, findFirst, count },
  } as unknown as PrismaService);

  beforeEach(() => jest.clearAllMocks());

  it('filters employees to their own requested tickets', () => {
    expect(service.buildWhere(employee(10))).toEqual({ requesterId: 10 });
  });

  it('does not include another employee requester', () => {
    expect(service.buildWhere(employee(10))).not.toEqual({ requesterId: 11 });
  });

  it('filters agents to direct assignment or their current Team Lead team', () => {
    expect(service.operationalWhere(agent(20))).toEqual({
      OR: [
        { assignedAgentId: 20 },
        { assignedTeam: { teamLeadId: 20 } },
        service.collaboratorWhere(20),
      ],
    });
  });

  it('does not use team membership as agent visibility', () => {
    const where = service.operationalWhere(agent(20));
    expect(where).not.toHaveProperty('assignedTeam.members');
  });

  it('does not use region, department, or specialty as agent visibility', () => {
    const where = JSON.stringify(service.operationalWhere(agent(20)));
    expect(where).not.toContain('regionId');
    expect(where).not.toContain('departmentId');
    expect(where).not.toContain('specialties');
  });

  it('filters managers to unowned NEW intake and explicitly owned tickets', () => {
    expect(service.operationalWhere(manager(30))).toEqual({
      OR: [
        { status: 'NEW', assignedManagerId: null },
        { assignedManagerId: 30 },
      ],
    });
  });

  it('does not use manager home region or department', () => {
    const where = JSON.stringify(service.operationalWhere(manager(30)));
    expect(where).not.toContain('regionId');
    expect(where).not.toContain('departmentId');
  });

  it('does not derive manager visibility from TeamManager', () => {
    expect(service.operationalWhere(manager(30))).toEqual({
      OR: [
        { status: 'NEW', assignedManagerId: null },
        { assignedManagerId: 30 },
      ],
    });
  });

  it('uses the same team-lead relationship for global team leads', () => {
    expect(service.operationalWhere(agent(20))).toEqual({
      OR: [
        { assignedAgentId: 20 },
        { assignedTeam: { teamLeadId: 20 } },
        service.collaboratorWhere(20),
      ],
    });
  });

  it('does not grant ordinary team members team visibility', () => {
    expect(service.operationalWhere(agent(21))).not.toEqual({
      assignedTeam: { members: { some: { userId: 21 } } },
    });
  });

  it('uses responsible-manager ownership instead of affected-region relationships', () => {
    const where = JSON.stringify(service.operationalWhere(manager(30)));
    expect(where).toContain('assignedManagerId');
    expect(where).not.toContain('assignedTeam');
    expect(where).not.toContain('affectedRegions');
  });

  it('does not grant operational visibility to unassigned agents', () => {
    expect(service.operationalWhere(agent(20))).toEqual({
      OR: [
        { assignedAgentId: 20 },
        { assignedTeam: { teamLeadId: 20 } },
        service.collaboratorWhere(20),
      ],
    });
  });

  it('preserves NULL assignment semantics by using no fallback relation', () => {
    const where = JSON.stringify(service.buildWhere(employee(10)));
    expect(where).not.toContain('assignedTeamId');
    expect(where).not.toContain('assignedAgentId');
  });

  it.each(Object.values(UserRole))(
    'gives %s own-request detail visibility',
    (role) => {
      const actor = { id: 1, role };
      const where = service.buildWhere(actor);
      expect(JSON.stringify(where)).toContain('requesterId');
      if (role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN) {
        expect(where).toEqual({ requesterId: 1 });
        expect(() => service.operationalWhere(actor)).toThrow(
          ForbiddenException,
        );
      }
    },
  );

  it.each(Object.values(UserRole))(
    'scopes %s requests queue independently of support',
    async (role) => {
      findMany.mockResolvedValue([]);
      await service.listVisible({ id: 1, role }, { queue: 'requests' });
      const filter = JSON.stringify(findMany.mock.calls[0]);
      expect(filter).toContain('requesterId');
      expect(filter).not.toContain('assignedManagerId');
      expect(filter).not.toContain('assignedAgentId');
    },
  );

  it.each([UserRole.EMPLOYEE, UserRole.ADMIN, UserRole.SUPER_ADMIN])(
    'denies %s subtask reads',
    (role) => {
      expect(() => service.buildSubtaskWhere({ id: 10, role })).toThrow(
        ForbiddenException,
      );
    },
  );

  it('does not grant intake managers subtask visibility', () => {
    expect(service.buildSubtaskWhere(manager(30))).toEqual({
      ticket: { assignedManagerId: 30 },
    });
  });

  it('restricts notes to current support relationships, never requester or administration', () => {
    expect(service.supportWhere(manager(30))).toEqual({
      assignedManagerId: 30,
    });
    expect(service.supportWhere(agent(20))).toEqual(
      service.operationalWhere(agent(20)),
    );
    for (const role of [
      UserRole.EMPLOYEE,
      UserRole.ADMIN,
      UserRole.SUPER_ADMIN,
    ])
      expect(() => service.supportWhere({ id: 1, role })).toThrow(
        ForbiddenException,
      );
  });

  it('requires an unfinished operational cycle for collaboration without filtering completed subtasks', () => {
    expect(service.collaboratorWhere(20)).toEqual({
      status: {
        in: [
          'NEW',
          'ASSIGNED',
          'IN_PROGRESS',
          'WAITING_FOR_EMPLOYEE',
          'BLOCKED',
        ],
      },
      subtasks: {
        some: { assignedAgentId: 20, createdInCycle: { outcome: null } },
      },
    });
  });

  it('passes the restricted filter to list queries', async () => {
    findMany.mockResolvedValue([]);

    await service.listVisible(manager(30));

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            {
              AND: [service.operationalWhere(manager(30)), {}, {}, {}, {}, {}],
            },
            {},
          ],
        },
        take: 26,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });

  it('combines the ticket id with the visibility filter for detail queries', async () => {
    findFirst.mockResolvedValue({
      id: 99,
      workCycles: [],
      tags: [],
      affectedRegions: [],
      affectedDepartments: [],
    });

    await service.findVisibleById(99, employee(10));

    expect(findFirst).toHaveBeenCalledWith({
      where: { AND: [{ id: 99 }, { requesterId: 10 }] },
      include: expect.objectContaining({
        workCycles: expect.any(Object) as unknown,
      }) as unknown,
    });
  });

  it('returns a generic not-found error for an inaccessible ticket', async () => {
    findFirst.mockResolvedValue(null);

    await expect(service.findVisibleById(99, agent(20))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('applies the same filter to visibility counts', async () => {
    count.mockResolvedValue(2);

    await expect(service.countVisible(manager(30))).resolves.toBe(2);
    expect(count).toHaveBeenCalledWith({
      where: service.buildWhere(manager(30)),
    });
  });
});
