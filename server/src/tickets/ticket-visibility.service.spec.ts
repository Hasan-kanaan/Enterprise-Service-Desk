import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '../../generated/prisma/client';
import { TicketVisibilityService, TicketVisibilityUser } from './ticket-visibility.service';

const employee = (id: number): TicketVisibilityUser => ({ id, role: UserRole.EMPLOYEE });
const agent = (id: number): TicketVisibilityUser => ({ id, role: UserRole.AGENT });
const manager = (id: number): TicketVisibilityUser => ({ id, role: UserRole.MANAGER });

describe('TicketVisibilityService', () => {
  const findMany = jest.fn();
  const findFirst = jest.fn();
  const count = jest.fn();
  const service = new TicketVisibilityService({
    ticket: { findMany, findFirst, count },
  } as any);

  beforeEach(() => jest.clearAllMocks());

  it('filters employees to their own requested tickets', () => {
    expect(service.buildWhere(employee(10))).toEqual({ requesterId: 10 });
  });

  it('does not include another employee requester', () => {
    expect(service.buildWhere(employee(10))).not.toEqual({ requesterId: 11 });
  });

  it('filters agents to direct assignment or their current Team Lead team', () => {
    expect(service.buildWhere(agent(20))).toEqual({
      OR: [
        { assignedAgentId: 20 },
        { assignedTeam: { teamLeadId: 20 } },
      ],
    });
  });

  it('does not use team membership as agent visibility', () => {
    const where = service.buildWhere(agent(20));
    expect(where).not.toHaveProperty('assignedTeam.members');
  });

  it('does not use region, department, or specialty as agent visibility', () => {
    const where = JSON.stringify(service.buildWhere(agent(20)));
    expect(where).not.toContain('regionId');
    expect(where).not.toContain('departmentId');
    expect(where).not.toContain('specialties');
  });

  it('filters managers to teams they manage', () => {
    expect(service.buildWhere(manager(30))).toEqual({
      assignedTeam: { managers: { some: { managerId: 30 } } },
    });
  });

  it('does not use manager home region or department', () => {
    const where = JSON.stringify(service.buildWhere(manager(30)));
    expect(where).not.toContain('regionId');
    expect(where).not.toContain('departmentId');
  });

  it('uses the same team relationship for global team managers', () => {
    expect(service.buildWhere(manager(30))).toEqual({
      assignedTeam: { managers: { some: { managerId: 30 } } },
    });
  });

  it('uses the same team-lead relationship for global team leads', () => {
    expect(service.buildWhere(agent(20))).toEqual({
      OR: [
        { assignedAgentId: 20 },
        { assignedTeam: { teamLeadId: 20 } },
      ],
    });
  });

  it('does not grant ordinary team members team visibility', () => {
    expect(service.buildWhere(agent(21))).not.toEqual({
      assignedTeam: { members: { some: { userId: 21 } } },
    });
  });

  it('uses assigned-team relationships instead of affected-region relationships', () => {
    const where = JSON.stringify(service.buildWhere(manager(30)));
    expect(where).toContain('assignedTeam');
    expect(where).not.toContain('affectedRegions');
  });

  it('does not grant operational visibility to unassigned agents', () => {
    expect(service.buildWhere(agent(20))).toEqual({
      OR: [
        { assignedAgentId: 20 },
        { assignedTeam: { teamLeadId: 20 } },
      ],
    });
  });

  it('preserves NULL assignment semantics by using no fallback relation', () => {
    const where = JSON.stringify(service.buildWhere(employee(10)));
    expect(where).not.toContain('assignedTeamId');
    expect(where).not.toContain('assignedAgentId');
  });

  it('allows SUPER_ADMIN system-level visibility', () => {
    expect(service.buildWhere({ id: 1, role: UserRole.SUPER_ADMIN })).toEqual({});
  });

  it('does not guess ADMIN ticket visibility', () => {
    expect(() => service.buildWhere({ id: 2, role: UserRole.ADMIN })).toThrow(
      ForbiddenException,
    );
  });

  it('passes the restricted filter to list queries', async () => {
    findMany.mockResolvedValue([]);

    await service.listVisible(manager(30));

    expect(findMany).toHaveBeenCalledWith({
      where: { assignedTeam: { managers: { some: { managerId: 30 } } } },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('combines the ticket id with the visibility filter for detail queries', async () => {
    findFirst.mockResolvedValue({ id: 99 });

    await service.findVisibleById(99, employee(10));

    expect(findFirst).toHaveBeenCalledWith({
      where: { AND: [{ id: 99 }, { requesterId: 10 }] },
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
      where: { assignedTeam: { managers: { some: { managerId: 30 } } } },
    });
  });
});