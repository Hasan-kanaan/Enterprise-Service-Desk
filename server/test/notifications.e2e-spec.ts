import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { jwtConstants } from '../src/auth/auth.constants';
import { User, UserRole } from '../generated/prisma/client';

describe('Persistent notifications (PostgreSQL and HTTP)', () => {
  let app: INestApplication, db: PrismaService;
  let users: Record<string, User>;
  let ticketId: number, subtaskId: number, teamId: number, otherTeamId: number;
  let cycleId: number, oldCycleId: number, categoryId: number;
  const jwt = new JwtService({ secret: jwtConstants.secret });
  const token = (name: string) =>
    jwt.sign({ sub: users[name].id, role: users[name].role });
  const get = (path: string, who: string) =>
    request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${token(who)}`);
  const patch = (path: string, who: string, body = {}) =>
    request(app.getHttpServer())
      .patch(path)
      .set('Authorization', `Bearer ${token(who)}`)
      .send(body);
  const post = (path: string, who: string, body: object) =>
    request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${token(who)}`)
      .send(body);
  const rows = () =>
    db.notification.findMany({ where: { ticketId }, orderBy: { id: 'asc' } });
  const message = (who = 'employee', key = randomUUID(), kind = 'messages') =>
    post(`/tickets/${ticketId}/${kind}`, who, {
      content: 'Sensitive content must not appear in notifications',
      expectedCycleId: cycleId,
      clientRequestId: key,
    });
  const assign = (name: string | null) =>
    patch(`/tickets/${ticketId}/assignment`, 'manager', {
      agentId: name ? users[name].id : null,
    });
  const status = (value: string) =>
    patch(`/tickets/${ticketId}/status`, 'manager', { status: value });
  const reopen = (who: string) =>
    post(`/tickets/${ticketId}/reopen`, who, {
      reason: 'Private reopening reason',
    });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    db = app.get(PrismaService);
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(async () => {
    users = {};
    const prefix = randomUUID();
    for (const [name, role] of Object.entries({
      employee: 'EMPLOYEE',
      manager: 'MANAGER',
      nextManager: 'MANAGER',
      agent: 'AGENT',
      second: 'AGENT',
      lead: 'AGENT',
      collaborator: 'AGENT',
      historical: 'AGENT',
      inactive: 'AGENT',
      admin: 'ADMIN',
      superAdmin: 'SUPER_ADMIN',
    })) {
      users[name] = await db.user.create({
        data: {
          username: `${name}-${prefix}`.slice(0, 50),
          email: `${name}-${prefix}@test.invalid`,
          password: 'unused',
          role: role as UserRole,
          status: name === 'inactive' ? 'INACTIVE' : 'ACTIVE',
        },
      });
    }
    teamId = (
      await db.team.create({
        data: {
          name: `primary-${prefix}`,
          scope: 'GLOBAL',
          teamLeadId: users.lead.id,
        },
      })
    ).id;
    otherTeamId = (
      await db.team.create({
        data: { name: `other-${prefix}`, scope: 'GLOBAL' },
      })
    ).id;
    await db.teamMember.createMany({
      data: [
        ...['agent', 'second', 'lead'].map((name) => ({
          teamId,
          userId: users[name].id,
        })),
        ...['collaborator', 'historical', 'inactive'].map((name) => ({
          teamId: otherTeamId,
          userId: users[name].id,
        })),
      ],
    });
    categoryId = (await db.ticketCategory.create({ data: { name: prefix } }))
      .id;
    ticketId = (
      await db.ticket.create({
        data: {
          title: 'Secret ticket title',
          description: 'Secret description',
          requesterId: users.employee.id,
          categoryId,
          status: 'IN_PROGRESS',
          assignedManagerId: users.manager.id,
          assignedTeamId: teamId,
          assignedAgentId: users.agent.id,
          allRegions: true,
          allDepartments: true,
          workCycles: {
            create: [
              {
                sequenceNumber: 1,
                type: 'ORIGINAL',
                startedAt: new Date(),
                endedAt: new Date(),
                outcome: 'RESOLVED',
              },
              { sequenceNumber: 2, type: 'REOPENED', startedAt: new Date() },
            ],
          },
        },
      })
    ).id;
    const cycles = await db.ticketWorkCycle.findMany({
      where: { ticketId },
      orderBy: { sequenceNumber: 'asc' },
    });
    [oldCycleId, cycleId] = cycles.map((c) => c.id);
    subtaskId = (
      await db.subtask.create({
        data: {
          ticketId,
          createdInCycleId: cycleId,
          title: 'Secret task',
          description: '',
          assignedTeamId: otherTeamId,
          assignedAgentId: users.collaborator.id,
        },
      })
    ).id;
    await db.subtask.create({
      data: {
        ticketId,
        createdInCycleId: oldCycleId,
        title: 'Old',
        description: '',
        assignedTeamId: otherTeamId,
        assignedAgentId: users.historical.id,
      },
    });
  });
  afterEach(async () => {
    const ids = Object.values(users).map((u) => u.id);
    await db.notification.deleteMany({
      where: { recipientUserId: { in: ids } },
    });
    await db.ticketMessage.deleteMany({ where: { ticketId } });
    await db.ticketInternalNote.deleteMany({ where: { ticketId } });
    await db.subtask.deleteMany({ where: { ticketId } });
    await db.ticket.delete({ where: { id: ticketId } });
    await db.team.deleteMany({ where: { id: { in: [teamId, otherTeamId] } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.ticketCategory.delete({ where: { id: categoryId } });
  });

  it('notifies actual primary-agent changes including A -> B -> A, not no-ops or clearing', async () => {
    await assign('agent').expect(200);
    await assign(null).expect(200);
    expect(await rows()).toHaveLength(0);
    for (const name of ['agent', 'second', 'agent'])
      await assign(name).expect(200);
    await assign('agent').expect(200);
    expect((await rows()).map((n) => [n.type, n.recipientUserId])).toEqual(
      ['agent', 'second', 'agent'].map((name) => [
        'PRIMARY_AGENT_ASSIGNED',
        users[name].id,
      ]),
    );
  });

  it('notifies subtask creation and real reassignments, not unchanged or cleared assignments', async () => {
    await post(`/tickets/${ticketId}/subtasks`, 'manager', {
      title: 'New task',
      description: '',
      assignedTeamId: otherTeamId,
      assignedAgentId: users.collaborator.id,
    }).expect(201);
    for (const name of ['collaborator', 'historical', 'collaborator', null]) {
      await patch(`/tickets/subtasks/${subtaskId}`, 'manager', {
        assignedAgentId: name ? users[name].id : null,
      }).expect(200);
    }
    expect((await rows()).map((n) => [n.type, n.recipientUserId])).toEqual(
      ['collaborator', 'historical', 'collaborator'].map((name) => [
        'SUBTASK_ASSIGNED',
        users[name].id,
      ]),
    );
    expect((await rows()).every((n) => n.subtaskId !== null)).toBe(true);
  });

  it('notifies current manager, primary agent, lead and completed collaborator exactly once per requester message', async () => {
    await db.subtask.update({
      where: { id: subtaskId },
      data: { status: 'COMPLETED' },
    });
    await db.subtask.createMany({
      data: ['agent', 'lead', 'inactive'].map((name) => ({
        ticketId,
        createdInCycleId: cycleId,
        title: 'Overlap',
        description: '',
        assignedAgentId: users[name].id,
      })),
    });
    await message().expect(201);
    expect((await rows()).map((n) => n.recipientUserId).sort()).toEqual(
      ['manager', 'agent', 'lead', 'collaborator']
        .map((name) => users[name].id)
        .sort(),
    );
    expect((await rows()).every((n) => n.type === 'REQUESTER_MESSAGE')).toBe(
      true,
    );
    expect((await get('/notifications', 'second').expect(200)).body).toEqual(
      [],
    );
    expect(
      (await get('/notifications', 'historical').expect(200)).body,
    ).toEqual([]);
  });

  it('excludes reassigned-away collaborators and former leads from requester recipients', async () => {
    await db.subtask.update({
      where: { id: subtaskId },
      data: { assignedAgentId: null },
    });
    await db.team.update({ where: { id: teamId }, data: { teamLeadId: null } });
    await message().expect(201);
    expect((await rows()).map((n) => n.recipientUserId).sort()).toEqual(
      [users.manager.id, users.agent.id].sort(),
    );
  });

  it.each(['manager', 'agent', 'lead', 'collaborator'])(
    'notifies only the requester for public support messages by %s',
    async (who) => {
      await message(who).expect(201);
      expect(await rows()).toEqual([
        expect.objectContaining({
          type: 'SUPPORT_MESSAGE',
          recipientUserId: users.employee.id,
          actorUserId: users[who].id,
        }),
      ]);
    },
  );

  it('creates no notifications for internal notes, message edits or idempotent replay', async () => {
    await message('manager', randomUUID(), 'internal-notes').expect(201);
    expect(await rows()).toHaveLength(0);
    const key = randomUUID();
    const first = await message('employee', key).expect(201);
    const sent = await rows();
    await patch(`/tickets/${ticketId}/messages/${first.body.id}`, 'employee', {
      content: 'Edited',
      expectedCycleId: cycleId,
    }).expect(200);
    await message('employee', key).expect(201);
    expect(await rows()).toEqual(sent);
    const supportKey = randomUUID();
    await message('collaborator', supportKey).expect(201);
    await message('collaborator', supportKey).expect(201);
    expect(
      (await rows()).filter((n) => n.type === 'SUPPORT_MESSAGE'),
    ).toHaveLength(1);
  });

  it('preserves waiting reply transition and sends one waiting event per actual transition', async () => {
    await status('WAITING_FOR_EMPLOYEE').expect(200);
    await status('WAITING_FOR_EMPLOYEE').expect(409);
    expect(
      (await rows()).filter((n) => n.type === 'WAITING_FOR_EMPLOYEE'),
    ).toHaveLength(1);
    await message().expect(201);
    expect(
      (await db.ticket.findUniqueOrThrow({ where: { id: ticketId } })).status,
    ).toBe('IN_PROGRESS');
    await status('WAITING_FOR_EMPLOYEE').expect(200);
    expect(
      (await rows()).filter((n) => n.type === 'WAITING_FOR_EMPLOYEE'),
    ).toHaveLength(2);
  });

  it('creates one recipient set for concurrent message creation and later recovery', async () => {
    const key = randomUUID();
    const responses = await Promise.all([
      message('employee', key),
      message('employee', key),
    ]);
    expect(responses.some((r) => r.status === 201)).toBe(true);
    expect(responses.every((r) => [201, 409].includes(r.status))).toBe(true);
    await message('employee', key).expect(201);
    expect(await db.ticketMessage.count({ where: { ticketId } })).toBe(1);
    expect(await rows()).toHaveLength(4);
  });

  it('does not send to inactive retained support participants', async () => {
    await db.user.updateMany({
      where: {
        id: {
          in: [
            users.manager.id,
            users.agent.id,
            users.lead.id,
            users.collaborator.id,
          ],
        },
      },
      data: { status: 'INACTIVE' },
    });
    await message().expect(201);
    expect(await rows()).toHaveLength(0);
  });

  it.each(['employee', 'manager'])(
    'notifies resolution and uses %s reopening recipients without old collaborators',
    async (who) => {
      await status('RESOLVED').expect(200);
      await status('RESOLVED').expect(409);
      expect((await rows()).filter((n) => n.type === 'RESOLVED')).toEqual([
        expect.objectContaining({ recipientUserId: users.employee.id }),
      ]);
      await reopen(who).expect(201);
      expect(
        (await rows())
          .filter((n) => n.type === 'REOPENED')
          .map((n) => n.recipientUserId)
          .sort(),
      ).toEqual(
        (who === 'employee' ? ['manager', 'agent', 'lead'] : ['employee'])
          .map((name) => users[name].id)
          .sort(),
      );
    },
  );

  it('deduplicates reopening responsibility and respects cleared responsibility after intake recovery', async () => {
    await db.team.update({
      where: { id: teamId },
      data: { teamLeadId: users.agent.id },
    });
    await status('RESOLVED').expect(200);
    await reopen('employee').expect(201);
    expect((await rows()).filter((n) => n.type === 'REOPENED')).toHaveLength(2);
    await status('RESOLVED').expect(200);
    await db.user.update({
      where: { id: users.manager.id },
      data: { status: 'INACTIVE' },
    });
    await reopen('employee').expect(201);
    expect((await rows()).filter((n) => n.type === 'REOPENED')).toHaveLength(2);
    expect(
      (await db.ticket.findUniqueOrThrow({ where: { id: ticketId } }))
        .assignedManagerId,
    ).toBeNull();
  });

  it('uses post-reopen responsibility for CLOSED tickets and excludes an inactive cleared primary agent', async () => {
    await status('RESOLVED').expect(200);
    await patch(`/tickets/${ticketId}/status`, 'employee', {
      status: 'CLOSED',
    }).expect(200);
    await db.user.update({
      where: { id: users.agent.id },
      data: { status: 'INACTIVE' },
    });
    await reopen('employee').expect(201);
    expect(
      (await rows())
        .filter((n) => n.type === 'REOPENED')
        .map((n) => n.recipientUserId)
        .sort(),
    ).toEqual([users.manager.id, users.lead.id].sort());
    expect(
      (await db.ticket.findUniqueOrThrow({ where: { id: ticketId } }))
        .assignedAgentId,
    ).toBeNull();
  });

  it('notifies only the new responsible manager on a real transfer while preserving routing', async () => {
    await patch(`/tickets/${ticketId}/manager`, 'manager', {
      assignedManagerId: users.manager.id,
    }).expect(200);
    expect(await rows()).toHaveLength(0);
    await patch(`/tickets/${ticketId}/manager`, 'manager', {
      assignedManagerId: users.nextManager.id,
    }).expect(200);
    expect(await rows()).toEqual([
      expect.objectContaining({
        type: 'MANAGER_TRANSFERRED',
        recipientUserId: users.nextManager.id,
      }),
    ]);
    expect(
      await db.ticket.findUniqueOrThrow({ where: { id: ticketId } }),
    ).toMatchObject({
      assignedTeamId: teamId,
      assignedAgentId: users.agent.id,
      status: 'IN_PROGRESS',
    });
  });

  it('keeps bounded minimal history and an all-history unread count with idempotent recipient-only reads', async () => {
    await db.notification.createMany({
      data: Array.from({ length: 55 }, () => ({
        ticketId,
        recipientUserId: users.agent.id,
        type: 'PRIMARY_AGENT_ASSIGNED' as const,
      })),
    });
    const list = (
      await get(
        `/notifications?recipientUserId=${users.agent.id}`,
        'agent',
      ).expect(200)
    ).body;
    expect(list).toHaveLength(50);
    expect(list.map((n: { id: number }) => n.id)).toEqual(
      list
        .map((n: { id: number }) => n.id)
        .sort((a: number, b: number) => b - a),
    );
    expect(Object.keys(list[0]).sort()).toEqual(
      ['id', 'type', 'ticketId', 'subtaskId', 'createdAt', 'readAt'].sort(),
    );
    expect(
      (await get('/notifications/unread-count', 'agent').expect(200)).body,
    ).toEqual({ count: 55 });
    for (const who of ['employee', 'manager', 'admin', 'superAdmin']) {
      expect(
        (
          await get(
            `/notifications?recipientUserId=${users.agent.id}`,
            who,
          ).expect(200)
        ).body,
      ).toEqual([]);
      await patch(`/notifications/${list[0].id}/read`, who).expect(404);
      await patch('/notifications/read-all', who).expect(200);
    }
    await patch(`/notifications/${list[0].id}/read`, 'agent').expect(200);
    const once = (await rows()).find((n) => n.id === list[0].id)!.readAt;
    await patch(`/notifications/${list[0].id}/read`, 'agent').expect(200);
    expect((await rows()).find((n) => n.id === list[0].id)!.readAt).toEqual(
      once,
    );
    expect(
      (await get('/notifications/unread-count', 'agent').expect(200)).body
        .count,
    ).toBe(54);
    await patch('/notifications/read-all', 'agent').expect(200);
    const read = await rows();
    await patch('/notifications/read-all', 'agent').expect(200);
    expect(await rows()).toEqual(read);
    expect(
      (await get('/notifications/unread-count', 'agent').expect(200)).body
        .count,
    ).toBe(0);
    await request(app.getHttpServer())
      .delete(`/notifications/${list[0].id}`)
      .set('Authorization', `Bearer ${token('agent')}`)
      .expect(404);
  });

  it('retains notification history without restoring lost collaborator or administrative ticket access', async () => {
    await message().expect(201);
    const sent = (await get('/notifications', 'collaborator').expect(200)).body;
    await patch(`/tickets/subtasks/${subtaskId}`, 'manager', {
      assignedAgentId: null,
    }).expect(200);
    expect(
      (await get('/notifications', 'collaborator').expect(200)).body,
    ).toEqual(sent);
    await patch(`/notifications/${sent[0].id}/read`, 'collaborator').expect(
      200,
    );
    await get(`/tickets/${ticketId}`, 'collaborator').expect(404);
    for (const who of ['admin', 'superAdmin']) {
      expect((await get('/notifications', who).expect(200)).body).toEqual([]);
      await get(`/tickets/${ticketId}`, who).expect(403);
    }
  });

  it.each(['anonymous', 'inactive', 'invalid-session'])(
    'rejects %s access to all notification APIs',
    async (state) => {
      if (state === 'invalid-session')
        await db.user.update({
          where: { id: users.agent.id },
          data: { sessionVersion: 1 },
        });
      for (const [method, path] of [
        ['get', '/notifications'],
        ['get', '/notifications/unread-count'],
        ['patch', '/notifications/1/read'],
        ['patch', '/notifications/read-all'],
      ] as const) {
        const req = request(app.getHttpServer())[method](path);
        if (state !== 'anonymous')
          req.set(
            'Authorization',
            `Bearer ${token(state === 'inactive' ? 'inactive' : 'agent')}`,
          );
        await req.expect(401);
      }
    },
  );

  it.each(['assignment', 'subtask', 'message', 'status', 'reopen', 'transfer'])(
    'rolls back %s and notifications together when notification insertion fails',
    async (action) => {
      if (action === 'reopen') await status('RESOLVED').expect(200);
      if (action === 'message')
        await status('WAITING_FOR_EMPLOYEE').expect(200);
      const before = await db.ticket.findUniqueOrThrow({
        where: { id: ticketId },
      });
      const sent = await rows();
      const functionName = `fail_notification_${randomUUID().replaceAll('-', '')}`;
      await db.$executeRawUnsafe(
        `CREATE FUNCTION "${functionName}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test notification rollback'; END $$`,
      );
      await db.$executeRawUnsafe(
        `CREATE TRIGGER "${functionName}" BEFORE INSERT ON "Notification" FOR EACH ROW WHEN (NEW."ticketId" = ${ticketId}) EXECUTE FUNCTION "${functionName}"()`,
      );
      try {
        const mutate =
          action === 'assignment'
            ? assign('second')
            : action === 'subtask'
              ? patch(`/tickets/subtasks/${subtaskId}`, 'manager', {
                  assignedAgentId: users.historical.id,
                })
              : action === 'message'
                ? message()
                : action === 'status'
                  ? status('RESOLVED')
                  : action === 'reopen'
                    ? reopen('employee')
                    : patch(`/tickets/${ticketId}/manager`, 'manager', {
                        assignedManagerId: users.nextManager.id,
                      });
        await mutate.expect(500);
        expect(await rows()).toEqual(sent);
        expect(
          await db.ticket.findUniqueOrThrow({ where: { id: ticketId } }),
        ).toEqual(before);
        expect(await db.ticketMessage.count({ where: { ticketId } })).toBe(0);
        expect(await db.ticketWorkCycle.count({ where: { ticketId } })).toBe(2);
        expect(
          (await db.subtask.findUniqueOrThrow({ where: { id: subtaskId } }))
            .assignedAgentId,
        ).toBe(users.collaborator.id);
      } finally {
        await db.$executeRawUnsafe(
          `DROP TRIGGER "${functionName}" ON "Notification"`,
        );
        await db.$executeRawUnsafe(`DROP FUNCTION "${functionName}"()`);
      }
    },
  );
});
