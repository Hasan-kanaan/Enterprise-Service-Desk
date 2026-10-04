import { Prisma, UserRole } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';

describe('Organization responsibility removal', () => {
  const actor = { id: 1, role: UserRole.ADMIN, sessionVersion: 3 };
  const team = { id: 7, teamLeadId: 42, archivedAt: null };
  function fixture() {
    const events: string[] = [];
    const db = {
      $queryRaw: jest.fn((sql: TemplateStringsArray) => {
        events.push(sql.join(''));
        return Promise.resolve([]);
      }),
      user: {
        findUnique: jest.fn().mockResolvedValue({
          ...actor,
          status: 'ACTIVE',
          activatedAt: new Date(),
        }),
      },
      team: {
        findUnique: jest.fn().mockImplementation(() => {
          events.push('read team');
          return Promise.resolve(team);
        }),
        update: jest.fn().mockResolvedValue({ ...team, teamLeadId: null }),
      },
      teamManager: {
        findUnique: jest.fn().mockImplementation(() => {
          events.push('read manager');
          return Promise.resolve({ teamId: 7, managerId: 16 });
        }),
        delete: jest.fn().mockResolvedValue({ teamId: 7, managerId: 16 }),
      },
    };
    const transaction = jest.fn((action: (tx: typeof db) => Promise<unknown>) =>
      action(db),
    );
    const service = new OrganizationService({
      $transaction: transaction,
    } as unknown as PrismaService);
    return { db, service, transaction, events };
  }
  it.each(['removeManager', 'removeTeamLead'] as const)(
    '%s forwards authenticated actor and uses Serializable with actor/Team locks before reads',
    async (method) => {
      const { service, transaction, db, events } = fixture();
      const controller = new OrganizationController(service);
      await controller[method](
        {
          user: {
            sub: actor.id,
            role: actor.role,
            sessionVersion: actor.sessionVersion,
            sid: 'session',
          },
        },
        7,
      );
      expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'Serializable',
      });
      expect(db.user.findUnique).toHaveBeenCalledWith({
        where: { id: actor.id },
      });
      expect(events.slice(0, 3)).toEqual([
        'SELECT id FROM "User" WHERE id =  FOR UPDATE',
        'SELECT id FROM "Team" WHERE id =  FOR UPDATE',
        'read team',
      ]);
      if (method === 'removeManager') {
        expect(events[3]).toBe('read manager');
        expect(db.teamManager.delete).toHaveBeenCalledWith({
          where: { teamId_managerId: { teamId: 7, managerId: 16 } },
        });
      } else {
        expect(db.team.update).toHaveBeenCalledWith({
          where: { id: 7 },
          data: { teamLeadId: null },
        });
      }
    },
  );
  it('keeps Manager response and missing relationship behavior', async () => {
    const { service, db } = fixture();
    expect(await service.removeManager(7, actor)).toEqual({
      message: 'Team manager removed',
    });
    db.teamManager.findUnique.mockResolvedValueOnce(null);
    await expect(service.removeManager(7, actor)).rejects.toMatchObject({
      status: 404,
      message: 'Team manager not found',
    });
    expect(db.teamManager.delete).toHaveBeenCalledTimes(1);
  });
  it('keeps null Lead removal idempotent, including archived teams', async () => {
    const { service, db } = fixture();
    db.team.findUnique.mockResolvedValueOnce({
      ...team,
      teamLeadId: null,
      archivedAt: new Date(),
    });
    expect(await service.removeTeamLead(7, actor)).toEqual({
      ...team,
      teamLeadId: null,
    });
  });
  it.each(['removeManager', 'removeTeamLead'] as const)(
    '%s retains Team not-found behavior',
    async (method) => {
      const { service, db } = fixture();
      db.team.findUnique.mockResolvedValueOnce(null);
      await expect(service[method](7, actor)).rejects.toMatchObject({
        status: 404,
        message: 'Team not found',
      });
      expect(db.team.update).not.toHaveBeenCalled();
      expect(db.teamManager.delete).not.toHaveBeenCalled();
    },
  );
  it.each([
    { status: 'INACTIVE' },
    { sessionVersion: 4 },
    { role: UserRole.EMPLOYEE },
    { activatedAt: null },
  ])(
    'blocks both mutations after actor authorization changes: %o',
    async (change) => {
      const { service, db } = fixture();
      db.user.findUnique.mockResolvedValue({
        ...actor,
        status: 'ACTIVE',
        activatedAt: new Date(),
        ...change,
      });
      await expect(service.removeManager(7, actor)).rejects.toMatchObject({
        status: 401,
      });
      await expect(service.removeTeamLead(7, actor)).rejects.toMatchObject({
        status: 401,
      });
      expect(db.team.findUnique).not.toHaveBeenCalled();
      expect(db.team.update).not.toHaveBeenCalled();
      expect(db.teamManager.delete).not.toHaveBeenCalled();
    },
  );
  it.each(['P2034', '40001', '40P01'])(
    'maps %s to safe 409 without retry',
    async (code) => {
      const { service, transaction } = fixture();
      transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('conflict', {
          clientVersion: 'test',
          code: code === 'P2034' ? code : 'P2010',
          meta: { driverAdapterError: { cause: { originalCode: code } } },
        }),
      );
      for (const method of ['removeManager', 'removeTeamLead'] as const) {
        await expect(service[method](7, actor)).rejects.toMatchObject({
          status: 409,
          message: 'Data changed concurrently; reload before retrying',
        });
      }
      expect(transaction).toHaveBeenCalledTimes(2);
    },
  );
});
