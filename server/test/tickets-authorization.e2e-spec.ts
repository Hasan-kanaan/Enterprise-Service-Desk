import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from './http-test';
import cookieParser from 'cookie-parser';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { jwtConstants } from '../src/auth/auth.constants';
import {
  TicketStatus,
  SubtaskStatus,
  UserRole,
  User,
  Team,
  Ticket,
  Subtask,
} from '../generated/prisma/client';

describe('Ticket security (real PostgreSQL and HTTP)', () => {
  let app: INestApplication<import('node:http').Server>;
  let db: PrismaService;
  let users: Record<string, User>;
  let teamA: Team, teamB: Team, teamC: Team;
  let owned: Ticket, intake: Ticket;
  let subtask: Subtask;
  let categoryId: number, regionId: number, departmentId: number;
  const jwt = new JwtService({ secret: jwtConstants.secret });
  const token = (name: string) =>
    jwt.sign({ sub: users[name].id, role: users[name].role });
  const get = <P extends string>(path: P, name: string) =>
    request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${token(name)}`);
  const patch = <P extends string>(path: P, name: string, body: object) =>
    request(app.getHttpServer())
      .patch(path)
      .set('Authorization', `Bearer ${token(name)}`)
      .send(body);
  const post = <P extends string>(path: P, name: string, body: object) =>
    request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${token(name)}`)
      .send(body);

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.use(cookieParser());
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
    const prefix = randomUUID().slice(0, 8);
    users = {};
    const region = await db.region.create({
      data: { name: `region-${prefix}` },
    });
    const department = await db.department.create({
      data: { name: `department-${prefix}` },
    });
    regionId = region.id;
    departmentId = department.id;
    for (const [name, role] of Object.entries({
      employee: UserRole.EMPLOYEE,
      otherEmployee: UserRole.EMPLOYEE,
      manager: UserRole.MANAGER,
      otherManager: UserRole.MANAGER,
      thirdManager: UserRole.MANAGER,
      agent: UserRole.AGENT,
      otherAgent: UserRole.AGENT,
      member: UserRole.AGENT,
      lead: UserRole.AGENT,
      otherLead: UserRole.AGENT,
      admin: UserRole.ADMIN,
      superAdmin: UserRole.SUPER_ADMIN,
    })) {
      users[name] = await db.user.create({
        data: {
          username: `${name}-${prefix}`,
          email: `${name}-${prefix}@test.invalid`,
          password: 'unused-test-hash',
          role,
          regionId,
          departmentId,
        },
      });
    }
    teamA = await db.team.create({
      data: {
        name: `A-${prefix}`,
        scope: 'REGION',
        regionId,
        teamLeadId: users.lead.id,
      },
    });
    teamB = await db.team.create({
      data: {
        name: `B-${prefix}`,
        scope: 'GLOBAL',
        teamLeadId: users.otherLead.id,
      },
    });
    teamC = await db.team.create({
      data: { name: `Other-regional-${prefix}`, scope: 'REGION', regionId },
    });
    await db.teamMember.createMany({
      data: [
        ...['agent', 'member', 'lead'].map((name) => ({
          teamId: teamA.id,
          userId: users[name].id,
        })),
        ...['otherAgent', 'otherLead'].map((name) => ({
          teamId: teamB.id,
          userId: users[name].id,
        })),
      ],
    });
    // Organizational management restricts primary routing, not ticket visibility.
    await db.teamManager.createMany({
      data: [
        { teamId: teamA.id, managerId: users.manager.id },
        { teamId: teamB.id, managerId: users.otherManager.id },
        { teamId: teamC.id, managerId: users.otherManager.id },
      ],
    });
    categoryId = (
      await db.ticketCategory.create({ data: { name: `category-${prefix}` } })
    ).id;
    owned = await db.ticket.create({
      data: {
        workCycles: {
          create: {
            sequenceNumber: 1,
            type: 'ORIGINAL',
            startedAt: new Date(),
          },
        },
        title: 'Owned',
        description: 'Private parent information',
        requesterId: users.employee.id,
        categoryId,
        status: TicketStatus.IN_PROGRESS,
        assignedManagerId: users.manager.id,
        assignedTeamId: teamA.id,
        assignedAgentId: users.agent.id,
        allRegions: true,
        allDepartments: true,
      },
    });
    intake = await db.ticket.create({
      data: {
        workCycles: {
          create: {
            sequenceNumber: 1,
            type: 'ORIGINAL',
            startedAt: new Date(),
          },
        },
        title: 'Intake',
        description: 'Unowned',
        requesterId: users.employee.id,
        categoryId,
      },
    });
    subtask = await db.subtask.create({
      data: {
        ticketId: owned.id,
        createdInCycleId: (
          await db.ticketWorkCycle.findFirstOrThrow({
            where: { ticketId: owned.id },
          })
        ).id,
        title: 'Delegated',
        description: 'Subtask work',
        assignedTeamId: teamB.id,
        assignedAgentId: users.otherAgent.id,
      },
    });
  });

  afterEach(async () => {
    if (!db || !users) return;
    // Delete only this test's explicit fixtures, never truncate shared data.
    const ids = Object.values(users).map((user) => user.id);
    await db.notification.deleteMany({
      where: {
        OR: [{ recipientUserId: { in: ids } }, { actorUserId: { in: ids } }],
      },
    });
    await db.ticketMessage.deleteMany({ where: { authorId: { in: ids } } });
    await db.ticketInternalNote.deleteMany({
      where: { authorId: { in: ids } },
    });
    await db.subtask.deleteMany({
      where: { ticket: { requesterId: { in: ids } } },
    });
    await db.ticket.deleteMany({ where: { requesterId: { in: ids } } });
    await db.team.deleteMany({
      where: { id: { in: [teamA.id, teamB.id, teamC.id] } },
    });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.ticketCategory.delete({ where: { id: categoryId } });
    await db.region.delete({ where: { id: regionId } });
    await db.department.delete({ where: { id: departmentId } });
  });

  const communicate = async (
    name: string,
    kind: 'messages' | 'internal-notes' = 'messages',
    content = 'New communication',
  ) =>
    post(`/tickets/${owned.id}/${kind}`, name, {
      content,
      expectedCycleId: subtask.createdInCycleId,
      clientRequestId: randomUUID(),
    });

  it('grants current collaborators parent context but no ownership or ticket mutations', async () => {
    await get(`/tickets/${owned.id}`, 'otherAgent').expect(200);
    await get(`/tickets/${owned.id}/history`, 'otherAgent').expect(200);
    const actions = (
      await get(`/ticket-workspace/tickets/${owned.id}`, 'otherAgent').expect(
        200,
      )
    ).body;
    expect(
      Object.values(actions.permissions).every(
        (value) =>
          value === false || (Array.isArray(value) && value.length === 0),
      ),
    ).toBe(true);
    await patch(`/tickets/${owned.id}`, 'otherAgent', { title: 'No' }).expect(
      403,
    );
    await patch(`/tickets/${owned.id}/status`, 'otherAgent', {
      status: 'RESOLVED',
    }).expect(403);
    await patch(`/tickets/${owned.id}/assignment`, 'otherAgent', {
      agentId: users.otherAgent.id,
    }).expect(403);
    await post(`/tickets/${owned.id}/reopen`, 'otherAgent', {
      reason: 'No',
    }).expect(403);
    await get(`/tickets/${owned.id}`, 'member').expect(404);
    expect(
      (await db.ticket.findUniqueOrThrow({ where: { id: owned.id } }))
        .assignedAgentId,
    ).toBe(users.agent.id);
    expect(
      await db.subtask.count({
        where: { ticketId: owned.id, assignedAgentId: users.agent.id },
      }),
    ).toBe(0);
    await get(`/tickets/${owned.id}`, 'agent').expect(200);
    await db.ticket.update({
      where: { id: owned.id },
      data: { assignedAgentId: null },
    });
    await get(`/tickets/${owned.id}`, 'otherAgent').expect(200);
  });

  it('retains completed collaboration, removes the last reassigned relationship, and ends it with the cycle', async () => {
    await patch(`/tickets/subtasks/${subtask.id}`, 'otherAgent', {
      status: 'COMPLETED',
    }).expect(200);
    await get(`/tickets/${owned.id}`, 'otherAgent').expect(200);
    const extra = await db.subtask.create({
      data: {
        ticketId: owned.id,
        createdInCycleId: subtask.createdInCycleId,
        title: 'Extra',
        description: '',
        assignedAgentId: users.otherAgent.id,
      },
    });
    await patch(`/tickets/subtasks/${subtask.id}`, 'manager', {
      assignedAgentId: null,
    }).expect(200);
    await get(`/tickets/${owned.id}`, 'otherAgent').expect(200);
    await patch(`/tickets/subtasks/${extra.id}`, 'manager', {
      assignedAgentId: null,
    }).expect(200);
    await get(`/tickets/${owned.id}`, 'otherAgent').expect(404);
    await patch(`/tickets/subtasks/${subtask.id}`, 'manager', {
      assignedAgentId: users.otherAgent.id,
    }).expect(200);
    await patch(`/tickets/${owned.id}/status`, 'manager', {
      status: 'RESOLVED',
    }).expect(200);
    await get(`/tickets/${owned.id}`, 'otherAgent').expect(404);
    await post(`/tickets/${owned.id}/reopen`, 'employee', {
      reason: 'Again',
    }).expect(201);
    await get(`/tickets/${owned.id}`, 'otherAgent').expect(404);
    await get(`/tickets/subtasks/${subtask.id}`, 'otherAgent').expect(200);
  });

  it('enforces the complete conversation and internal-note participation matrix', async () => {
    for (const name of ['employee', 'agent', 'lead', 'manager', 'otherAgent']) {
      await communicate(name).then((response) =>
        expect(response.status).toBe(201),
      );
      await get(`/tickets/${owned.id}/messages`, name).expect(200);
      if (name !== 'employee') {
        await communicate(name, 'internal-notes', 'Private support text').then(
          (response) => expect(response.status).toBe(201),
        );
        await get(`/tickets/${owned.id}/internal-notes`, name).expect(200);
      }
    }
    for (const name of [
      'otherEmployee',
      'member',
      'otherLead',
      'otherManager',
    ]) {
      await get(`/tickets/${owned.id}/messages`, name).expect(404);
      await communicate(name).then((response) =>
        expect(response.status).toBe(404),
      );
    }
    for (const name of ['admin', 'superAdmin']) {
      await get(`/tickets/${owned.id}/messages`, name).expect(403);
      await get(`/tickets/${owned.id}/internal-notes`, name).expect(403);
      await communicate(name).then((response) =>
        expect(response.status).toBe(403),
      );
    }
    await get(`/tickets/${owned.id}/internal-notes`, 'employee').expect(403);
    await communicate('employee', 'internal-notes').then((response) =>
      expect(response.status).toBe(403),
    );
    for (const suffix of ['', '/history', '/messages']) {
      const response = await get(
        `/tickets/${owned.id}${suffix}`,
        'employee',
      ).expect(200);
      expect(JSON.stringify(response.body)).not.toContain(
        'Private support text',
      );
      expect(JSON.stringify(response.body)).not.toContain('creationHash');
    }
    await get(`/tickets/${intake.id}/messages`, 'otherManager').expect(200);
    await get(`/tickets/${intake.id}/internal-notes`, 'otherManager').expect(
      404,
    );
    await post(`/tickets/${intake.id}/messages`, 'otherManager', {
      content: 'No',
      expectedCycleId: subtask.createdInCycleId,
      clientRequestId: randomUUID(),
    }).expect(403);
  });

  it.each(['messages', 'internal-notes'] as const)(
    'allows only current authors to edit %s and preserves attribution',
    async (kind) => {
      const created = await communicate('otherAgent', kind);
      expect(created.status).toBe(201);
      const path = `/tickets/${owned.id}/${kind}/${created.body.id}`;
      const dto = {
        content: 'Corrected',
        expectedCycleId: subtask.createdInCycleId,
      };
      await patch(path, 'manager', dto).expect(403);
      const edited = await patch(path, 'otherAgent', dto).expect(200);
      expect(edited.body).toMatchObject({
        authorId: users.otherAgent.id,
        createdAt: created.body.createdAt,
        createdInCycleId: subtask.createdInCycleId,
        content: 'Corrected',
        editedAt: expect.any(String) as unknown,
      });
      await patch(`/tickets/${owned.id}/status`, 'manager', {
        status: 'RESOLVED',
      }).expect(200);
      await patch(path, 'otherAgent', dto).expect(404);
      await post(`/tickets/${owned.id}/reopen`, 'employee', {
        reason: 'Again',
      }).expect(201);
      await db.ticket.update({
        where: { id: owned.id },
        data: { assignedAgentId: users.otherAgent.id },
      });
      const current = (
        await get(`/tickets/${owned.id}`, 'otherAgent').expect(200)
      ).body.currentCycle!.id;
      await patch(path, 'otherAgent', {
        ...dto,
        expectedCycleId: current,
      }).expect(409);
      const history = (
        await get(`/tickets/${owned.id}/${kind}`, 'otherAgent').expect(200)
      ).body;
      expect(history.records[0].canEdit).toBe(false);
      await db.user.update({
        where: { id: users.otherAgent.id },
        data: { status: 'INACTIVE' },
      });
      const preserved = (
        await get(`/tickets/${owned.id}/${kind}`, 'manager').expect(200)
      ).body.records[0];
      expect(preserved.author).toEqual({
        id: users.otherAgent.id,
        username: users.otherAgent.username,
      });
      await get(`/tickets/${owned.id}/${kind}`, 'otherAgent').expect(401);
    },
  );

  it('only NEW requester messages resume waiting work; edits, support, notes and duplicate retries do not', async () => {
    const first = await communicate('employee');
    await patch(`/tickets/${owned.id}/status`, 'agent', {
      status: 'WAITING_FOR_EMPLOYEE',
    }).expect(200);
    await patch(`/tickets/${owned.id}/messages/${first.body.id}`, 'employee', {
      content: 'Edited',
      expectedCycleId: subtask.createdInCycleId,
    }).expect(200);
    await communicate('agent');
    await communicate('manager', 'internal-notes');
    expect(
      (await db.ticket.findUniqueOrThrow({ where: { id: owned.id } })).status,
    ).toBe('WAITING_FOR_EMPLOYEE');
    const dto = {
      content: 'Reply',
      expectedCycleId: subtask.createdInCycleId,
      clientRequestId: randomUUID(),
    };
    const reply = await post(
      `/tickets/${owned.id}/messages`,
      'employee',
      dto,
    ).expect(201);
    expect(
      (await db.ticket.findUniqueOrThrow({ where: { id: owned.id } })).status,
    ).toBe('IN_PROGRESS');
    await patch(`/tickets/${owned.id}/status`, 'agent', {
      status: 'WAITING_FOR_EMPLOYEE',
    }).expect(200);
    const duplicate = await post(
      `/tickets/${owned.id}/messages`,
      'employee',
      dto,
    ).expect(201);
    expect(duplicate.body.id).toBe(reply.body.id);
    expect(
      (await db.ticket.findUniqueOrThrow({ where: { id: owned.id } })).status,
    ).toBe('WAITING_FOR_EMPLOYEE');
    await patch(`/tickets/${owned.id}/messages/${reply.body.id}`, 'employee', {
      content: 'New wording',
      expectedCycleId: subtask.createdInCycleId,
    }).expect(200);
    expect(
      (await post(`/tickets/${owned.id}/messages`, 'employee', dto).expect(201))
        .body.content,
    ).toBe('New wording');
    await post(`/tickets/${owned.id}/messages`, 'employee', {
      ...dto,
      content: 'Reused key',
    }).expect(409);
  });

  it.each(['RESOLVED', 'CLOSED', 'CANCELLED'] as const)(
    'freezes both streams in %s',
    async (status) => {
      const message = await communicate('employee');
      const note = await communicate('manager', 'internal-notes');
      await db.ticket.update({ where: { id: owned.id }, data: { status } });
      await db.ticketWorkCycle.update({
        where: { id: subtask.createdInCycleId },
        data: { outcome: status, endedAt: new Date() },
      });
      for (const [kind, name, id] of [
        ['messages', 'employee', message.body.id],
        ['internal-notes', 'manager', note.body.id],
      ] as const) {
        await communicate(name, kind).then((response) =>
          expect(response.status).toBe(409),
        );
        await patch(`/tickets/${owned.id}/${kind}/${id}`, name, {
          content: 'No',
          expectedCycleId: subtask.createdInCycleId,
        }).expect(409);
        expect(
          (await get(`/tickets/${owned.id}/${kind}`, name).expect(200)).body
            .records[0].canEdit,
        ).toBe(false);
      }
    },
  );

  it('rejects invalid content, stale cycles, and creation fields on edits', async () => {
    for (const content of ['', '   ', 'x'.repeat(4001)])
      await communicate('employee', 'messages', content).then((response) =>
        expect(response.status).toBe(400),
      );
    await post(`/tickets/${owned.id}/messages`, 'employee', {
      content: 'Stale',
      expectedCycleId: subtask.createdInCycleId + 10000,
      clientRequestId: randomUUID(),
    }).expect(409);
    const created = await communicate('employee');
    await patch(
      `/tickets/${owned.id}/messages/${created.body.id}`,
      'employee',
      {
        content: 'No',
        expectedCycleId: subtask.createdInCycleId,
        authorId: users.agent.id,
      },
    ).expect(400);
    await request(app.getHttpServer())
      .delete(`/tickets/${owned.id}/messages/${created.body.id}`)
      .set('Authorization', `Bearer ${token('employee')}`)
      .expect(400);
  });

  it('deduplicates concurrent creation and denies duplicate recovery after collaboration is lost', async () => {
    const dto = {
      content: 'Once',
      expectedCycleId: subtask.createdInCycleId,
      clientRequestId: randomUUID(),
    };
    const results = await Promise.all([
      post(`/tickets/${owned.id}/messages`, 'otherAgent', dto),
      post(`/tickets/${owned.id}/messages`, 'otherAgent', dto),
    ]);
    expect(results.some((result) => result.status === 201)).toBe(true);
    expect(results.every((result) => [201, 409].includes(result.status))).toBe(
      true,
    );
    expect(
      await db.ticketMessage.count({
        where: { authorId: users.otherAgent.id },
      }),
    ).toBe(1);
    await patch(`/tickets/subtasks/${subtask.id}`, 'manager', {
      assignedAgentId: null,
    }).expect(200);
    await post(`/tickets/${owned.id}/messages`, 'otherAgent', dto).expect(404);
  });

  it.each([
    'resolution',
    'reassignment',
    'deactivation',
    'reopening',
    'lead-removal',
  ] as const)('rejects communication blocked behind %s', async (change) => {
    if (change === 'reopening')
      await patch(`/tickets/${owned.id}/status`, 'manager', {
        status: 'RESOLVED',
      }).expect(200);
    let release!: () => void;
    let ready!: () => void;
    const locked = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const blocker = db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${owned.id} FOR UPDATE`;
        ready();
        await gate;
        if (change === 'resolution') {
          await tx.ticket.update({
            where: { id: owned.id },
            data: { status: 'RESOLVED' },
          });
          await tx.ticketWorkCycle.update({
            where: { id: subtask.createdInCycleId },
            data: { outcome: 'RESOLVED', endedAt: new Date() },
          });
        } else if (change === 'reassignment') {
          await tx.subtask.update({
            where: { id: subtask.id },
            data: { assignedAgentId: null },
          });
        } else if (change === 'deactivation') {
          await tx.user.update({
            where: { id: users.otherAgent.id },
            data: { status: 'INACTIVE', sessionVersion: { increment: 1 } },
          });
        } else if (change === 'lead-removal') {
          await tx.team.update({
            where: { id: teamA.id },
            data: { teamLeadId: null },
          });
        } else {
          await tx.ticketWorkCycle.create({
            data: {
              ticketId: owned.id,
              sequenceNumber: 2,
              type: 'REOPENED',
              startedAt: new Date(),
              startedById: users.employee.id,
              startReason: 'Concurrent reopen',
            },
          });
          await tx.ticket.update({
            where: { id: owned.id },
            data: { status: 'IN_PROGRESS', resolvedAt: null },
          });
        }
      },
      { timeout: 15000 },
    );
    await locked;
    const stale = communicate(
      change === 'reopening'
        ? 'employee'
        : change === 'lead-removal'
          ? 'lead'
          : 'otherAgent',
    ).then((response) => response);
    try {
      await waitForBlocked(1);
    } finally {
      release();
      await blocker;
    }
    const result = await stale;
    expect([401, 404, 409]).toContain(result.status);
    expect(
      await db.ticketMessage.count({ where: { ticketId: owned.id } }),
    ).toBe(0);
  });

  it('rolls back the new employee message when the waiting transition fails', async () => {
    await db.ticket.update({
      where: { id: owned.id },
      data: { status: 'WAITING_FOR_EMPLOYEE' },
    });
    const name = `fail_message_${owned.id}`;
    await db.$executeRawUnsafe(
      `CREATE FUNCTION "${name}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = ${owned.id} AND NEW.status = 'IN_PROGRESS' THEN RAISE EXCEPTION 'test message rollback'; END IF; RETURN NEW; END $$`,
    );
    await db.$executeRawUnsafe(
      `CREATE TRIGGER "${name}" BEFORE UPDATE ON "Ticket" FOR EACH ROW EXECUTE FUNCTION "${name}"()`,
    );
    try {
      const response = await communicate('employee');
      expect(response.status).toBe(500);
      expect(
        await db.ticketMessage.count({ where: { ticketId: owned.id } }),
      ).toBe(0);
      expect(
        (await db.ticket.findUniqueOrThrow({ where: { id: owned.id } })).status,
      ).toBe('WAITING_FOR_EMPLOYEE');
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER "${name}" ON "Ticket"`);
      await db.$executeRawUnsafe(`DROP FUNCTION "${name}"()`);
    }
  });
  it('exposes only real ticket reference options to operational roles', async () => {
    await request(app.getHttpServer()).get('/ticket-options').expect(401);
    for (const name of ['employee', 'agent', 'manager']) {
      const response = await get('/ticket-options', name).expect(200);
      expect(Object.keys(response.body).sort()).toEqual([
        'categories',
        'departments',
        'regions',
        'tags',
      ]);
      expect(response.body.categories).toContainEqual({
        id: categoryId,
        name: expect.any(String) as unknown,
      });
      expect(response.body.regions).toContainEqual({
        id: regionId,
        name: expect.any(String) as unknown,
      });
      expect(response.body.departments).toContainEqual({
        id: departmentId,
        name: expect.any(String) as unknown,
      });
      for (const values of Object.values(response.body)) {
        for (const value of values)
          expect(Object.keys(value).sort()).toEqual(['id', 'name']);
      }
    }
    await get('/ticket-options', 'admin').expect(403);
    await get('/ticket-options', 'superAdmin').expect(403);
  });

  it('limits workspace context to the caller led team and operational roles', async () => {
    await request(app.getHttpServer()).get('/ticket-workspace').expect(401);
    for (const name of ['employee', 'admin', 'superAdmin'])
      await get('/ticket-workspace', name).expect(403);
    expect((await get('/ticket-workspace', 'lead').expect(200)).body).toEqual({
      ledTeams: [{ id: teamA.id, name: teamA.name }],
    });
    expect((await get('/ticket-workspace', 'member').expect(200)).body).toEqual(
      { ledTeams: [] },
    );
    expect(
      (await get('/ticket-workspace', 'otherManager').expect(200)).body,
    ).toEqual({ ledTeams: [] });
  });

  it('projects ticket actions from ownership and exposes only eligible choices', async () => {
    await db.user.update({
      where: { id: users.member.id },
      data: { status: 'INACTIVE' },
    });
    await db.user.update({
      where: { id: users.thirdManager.id },
      data: { status: 'INACTIVE' },
    });
    const own = (
      await get(`/ticket-workspace/tickets/${owned.id}`, 'manager').expect(200)
    ).body;
    expect(own.permissions).toEqual({
      edit: true,
      take: false,
      transfer: true,
      assignTeam: true,
      assignAgent: true,
      createSubtask: true,
      reopen: false,
      statuses: ['WAITING_FOR_EMPLOYEE', 'BLOCKED', 'RESOLVED'],
    });
    expect(own.teams).toEqual(
      expect.arrayContaining([
        {
          id: teamA.id,
          name: teamA.name,
        },
        {
          id: teamB.id,
          name: teamB.name,
        },
      ]),
    );
    expect(own.teams.map((team: { id: number }) => team.id)).not.toContain(
      teamC.id,
    );
    expect(own.subtaskTeams.map((team: { id: number }) => team.id)).toContain(
      teamC.id,
    );
    expect(own).not.toHaveProperty('managers');
    for (const team of own.teams) expect(team).not.toHaveProperty('agents');
    const agents = (
      await get(
        `/ticket-workspace/tickets/${owned.id}/people?purpose=primary&teamId=${teamA.id}&search=${users.agent.username}`,
        'manager',
      ).expect(200)
    ).body;
    expect(agents).toContainEqual({
      id: users.agent.id,
      username: users.agent.username,
    });
    expect(agents).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: users.member.id }),
      ]),
    );
    for (const person of agents)
      expect(Object.keys(person).sort()).toEqual(['id', 'username']);
    const queue = (
      await get(`/ticket-workspace/tickets/${intake.id}`, 'manager').expect(200)
    ).body;
    expect(queue).toEqual({
      permissions: {
        edit: false,
        take: true,
        transfer: false,
        assignTeam: false,
        assignAgent: false,
        createSubtask: false,
        reopen: false,
        statuses: [],
      },
      teams: [],
      subtaskTeams: [],
    });
    await get(`/ticket-workspace/tickets/${owned.id}`, 'otherManager').expect(
      404,
    );
    await get(`/ticket-workspace/tickets/${owned.id}`, 'member').expect(401);
    await get(`/ticket-workspace/tickets/${owned.id}`, 'otherAgent').expect(
      200,
    );
    await get(`/ticket-workspace/tickets/${owned.id}`, 'admin').expect(403);
  });

  it('restricts Team Lead choices to the led primary team without manager powers', async () => {
    const lead = (
      await get(`/ticket-workspace/tickets/${owned.id}`, 'lead').expect(200)
    ).body;
    expect(lead.permissions).toMatchObject({
      edit: true,
      assignTeam: false,
      assignAgent: true,
      transfer: false,
      take: false,
      createSubtask: true,
      reopen: false,
    });
    expect(lead.teams.map((team: { id: number }) => team.id)).toEqual([
      teamA.id,
    ]);
    expect(lead).not.toHaveProperty('managers');
    const agent = (
      await get(`/ticket-workspace/tickets/${owned.id}`, 'agent').expect(200)
    ).body;
    expect(agent.permissions).toMatchObject({
      edit: true,
      assignTeam: false,
      assignAgent: false,
      createSubtask: false,
      reopen: false,
    });
    expect(agent.teams).toEqual([]);
    await get(`/ticket-workspace/tickets/${owned.id}`, 'member').expect(404);
    await get(`/ticket-workspace/tickets/${owned.id}`, 'otherLead').expect(404);
  });

  it('keeps delegated subtask projections independent of parent-ticket visibility', async () => {
    const delegated = (
      await get(
        `/ticket-workspace/subtasks/${subtask.id}`,
        'otherAgent',
      ).expect(200)
    ).body;
    expect(delegated.permissions).toEqual({
      edit: true,
      assignTeam: false,
      assignAgent: false,
    });
    expect(delegated.teams).toEqual([]);
    expect(delegated).not.toHaveProperty('ticket');
    expect(delegated.subtask).not.toHaveProperty('ticket');
    expect(delegated.subtask).not.toHaveProperty('requesterId');
    expect(delegated.subtask).not.toHaveProperty('workCycles');
    expect(delegated.subtask.assignedTeam).toEqual({
      id: teamB.id,
      name: teamB.name,
    });
    expect(delegated.subtask.assignedAgent).toEqual({
      id: users.otherAgent.id,
      username: users.otherAgent.username,
    });
    await get(`/ticket-workspace/tickets/${owned.id}`, 'otherAgent').expect(
      200,
    );
    await get(`/tickets/${owned.id}/history`, 'otherAgent').expect(200);
    const lead = (
      await get(`/ticket-workspace/subtasks/${subtask.id}`, 'otherLead').expect(
        200,
      )
    ).body;
    expect(lead.permissions).toEqual({
      edit: true,
      assignTeam: false,
      assignAgent: true,
    });
    expect(lead.teams.map((team: { id: number }) => team.id)).toEqual([
      teamB.id,
    ]);
    await get(`/ticket-workspace/subtasks/${subtask.id}`, 'lead').expect(404);
    await get(`/ticket-workspace/subtasks/${subtask.id}`, 'agent').expect(404);
    await get(
      `/ticket-workspace/subtasks/${subtask.id}`,
      'otherManager',
    ).expect(404);
    await get(`/ticket-workspace/subtasks/${subtask.id}`, 'employee').expect(
      403,
    );
    await get(`/ticket-workspace/subtasks/${subtask.id}`, 'superAdmin').expect(
      403,
    );
  });

  it('freezes terminal and historical subtask projections and preserves completion attribution', async () => {
    await patch(`/tickets/subtasks/${subtask.id}`, 'otherAgent', {
      status: 'COMPLETED',
    }).expect(200);
    const complete = (
      await get(`/ticket-workspace/subtasks/${subtask.id}`, 'manager').expect(
        200,
      )
    ).body;
    expect(complete.subtask.completedBy).toEqual({
      id: users.otherAgent.id,
      username: users.otherAgent.username,
    });
    expect(complete.subtask.completedAt).not.toBeNull();
    await patch(`/tickets/${owned.id}/status`, 'manager', {
      status: 'RESOLVED',
    }).expect(200);
    const terminal = (
      await get(`/ticket-workspace/tickets/${owned.id}`, 'manager').expect(200)
    ).body;
    expect(terminal.permissions).toEqual({
      edit: false,
      take: false,
      transfer: false,
      assignTeam: false,
      assignAgent: false,
      createSubtask: false,
      reopen: true,
      statuses: ['CLOSED'],
    });
    expect(terminal.teams).toEqual([]);
    expect(
      (
        await get(
          `/ticket-workspace/subtasks/${subtask.id}`,
          'otherAgent',
        ).expect(200)
      ).body,
    ).toMatchObject({
      frozen: true,
      historical: false,
      permissions: { edit: false, assignAgent: false, assignTeam: false },
      teams: [],
    });
    await post(`/tickets/${owned.id}/reopen`, 'manager', {
      reason: 'Retry',
    }).expect(201);
    expect(
      (
        await get(
          `/ticket-workspace/subtasks/${subtask.id}`,
          'otherAgent',
        ).expect(200)
      ).body,
    ).toMatchObject({
      frozen: true,
      historical: true,
      permissions: { edit: false, assignAgent: false, assignTeam: false },
      teams: [],
    });
    await patch(`/tickets/subtasks/${subtask.id}`, 'otherAgent', {
      status: 'TODO',
    }).expect(409);
  });

  it.each(['admin', 'superAdmin'])(
    'enforces the account provisioning matrix over HTTP for %s',
    async (caller) => {
      const allowed: UserRole[] =
        caller === 'superAdmin'
          ? [
              UserRole.ADMIN,
              UserRole.MANAGER,
              UserRole.AGENT,
              UserRole.EMPLOYEE,
            ]
          : [UserRole.MANAGER, UserRole.AGENT, UserRole.EMPLOYEE];
      for (const role of Object.values(UserRole)) {
        const suffix = randomUUID().slice(0, 8);
        const response = await post('/auth/accounts', caller, {
          username: `new-${suffix}`,
          email: `${suffix}@test.invalid`,
          password: 'StrongPass123!',
          role,
        }).expect(allowed.includes(role) ? 201 : 403);
        if (allowed.includes(role)) {
          users[suffix] = await db.user.findUniqueOrThrow({
            where: { id: response.body.user.id },
          });
          expect(response.body.user).not.toHaveProperty('password');
          expect(response.body.user.role).toBe(role);
          expect(users[suffix].status).toBe('ACTIVE');
          expect(users[suffix].regionId).toBeNull();
          expect(users[suffix].departmentId).toBeNull();
        }
      }
    },
  );

  it('adds only safe account organization labels and member identity projections for administration', async () => {
    for (const caller of ['admin', 'superAdmin']) {
      const directory = (
        await get(`/users?search=${users.agent.username}`, caller).expect(200)
      ).body;
      const account = directory.items.find(
        (row: { id: number }) => row.id === users.agent.id,
      );
      expect(account!.region).toEqual({
        id: regionId,
        name: expect.any(String) as unknown,
      });
      expect(account!.department).toEqual({
        id: departmentId,
        name: expect.any(String) as unknown,
      });
      expect(account).not.toHaveProperty('password');
      expect(account).not.toHaveProperty('tickets');
      const teams = (await get('/organization/teams', caller).expect(200)).body;
      const team = teams.find((row: { id: number }) => row.id === teamA.id);
      expect(team).not.toHaveProperty('members');
      const members = (
        await get(`/organization/teams/${teamA.id}/members`, caller).expect(200)
      ).body.items;
      expect(members.map((member) => member.id)).toEqual(
        expect.arrayContaining([users.agent.id, users.lead.id]),
      );
      for (const member of members)
        expect(Object.keys(member).sort()).toEqual([
          'id',
          'role',
          'status',
          'username',
        ]);
      expect(team).not.toHaveProperty('tickets');
    }
    for (const caller of ['employee', 'agent', 'manager']) {
      await get('/users', caller).expect(403);
      await get('/organization/teams', caller).expect(403);
      await post('/auth/accounts', caller, {
        username: 'unauthorized',
        email: 'not-allowed@test.invalid',
        password: 'StrongPass123!',
        role: UserRole.EMPLOYEE,
      }).expect(403);
    }
  });

  it('requires authentication and filters actual rows for all operational roles', async () => {
    await request(app.getHttpServer()).get('/tickets').expect(401);
    const expected: Record<string, number[]> = {
      employee: [owned.id, intake.id],
      otherEmployee: [],
      manager: [owned.id, intake.id],
      otherManager: [intake.id],
      agent: [owned.id],
      lead: [owned.id],
      member: [],
      otherAgent: [owned.id],
      otherLead: [],
    };
    for (const [name, ids] of Object.entries(expected)) {
      const response = await get('/tickets', name).expect(200);
      expect(
        response.body.items.map((row: { id: number }) => row.id).sort(),
      ).toEqual(ids.sort());
    }
    await get(`/tickets/${owned.id}`, 'otherManager').expect(404);
    await get(`/tickets/${owned.id}`, 'otherAgent').expect(200);
    // Scope, home organization, TeamManager and ordinary membership grant nothing.
    await db.ticket.update({
      where: { id: intake.id },
      data: { status: TicketStatus.ASSIGNED },
    });
    expect(
      (await get('/tickets', 'otherManager').expect(200)).body.items,
    ).toEqual([]);
  });

  it.each(['admin', 'superAdmin'])(
    'denies %s every ticket/subtask API while preserving administration',
    async (name) => {
      for (const path of [
        '/tickets',
        `/tickets/${owned.id}`,
        '/tickets/subtasks',
        `/tickets/subtasks/${subtask.id}`,
        `/tickets/${owned.id}/subtasks`,
      ])
        await get(path, name).expect(403);
      await post('/tickets', name, {}).expect(403);
      for (const suffix of ['', '/manager', '/assignment', '/status'])
        await patch(`/tickets/${owned.id}${suffix}`, name, {}).expect(403);
      await post(`/tickets/${owned.id}/subtasks`, name, {}).expect(403);
      await patch(`/tickets/subtasks/${subtask.id}`, name, {}).expect(403);
      await get('/users', name).expect(200);
      await get('/organization/teams', name).expect(200);
    },
  );

  it('creates employee tickets with no ownership and rejects injected ownership', async () => {
    const body = {
      title: 'Fresh',
      description: 'Issue',
      categoryId,
      allRegions: true,
      allDepartments: true,
      affectedRegionIds: [],
      affectedDepartmentIds: [],
    };
    const result = await post('/tickets', 'employee', body).expect(201);
    expect(result.body).toMatchObject({
      status: 'NEW',
      assignedManagerId: null,
      assignedTeamId: null,
      assignedAgentId: null,
      requesterId: users.employee.id,
    });
    await post('/tickets', 'employee', {
      ...body,
      assignedManagerId: users.manager.id,
    }).expect(400);
    await post('/tickets', 'manager', body).expect(403);
  });

  it('allows intake assignment to another real manager without changing status', async () => {
    await patch(`/tickets/${intake.id}`, 'otherManager', {
      title: 'Cannot edit intake',
    }).expect(403);
    await patch(`/tickets/${intake.id}/assignment`, 'otherManager', {
      teamId: teamA.id,
    }).expect(403);
    await patch(`/tickets/${intake.id}/manager`, 'otherManager', {
      assignedManagerId: users.agent.id,
    }).expect(400);
    await patch(`/tickets/${intake.id}/manager`, 'otherManager', {
      assignedManagerId: 2147483647,
    }).expect(404);
    const result = await patch(
      `/tickets/${intake.id}/manager`,
      'otherManager',
      { assignedManagerId: users.manager.id },
    ).expect(200);
    expect(result.body).toMatchObject({
      status: 'NEW',
      assignedManagerId: users.manager.id,
      assignedTeamId: null,
      assignedAgentId: null,
    });
    await get(`/tickets/${intake.id}`, 'otherManager').expect(404);
    await patch(`/tickets/${intake.id}/status`, 'manager', {
      status: 'ASSIGNED',
    }).expect(409);
    const assigned = await patch(
      `/tickets/${intake.id}/assignment`,
      'manager',
      { teamId: teamB.id },
    ).expect(200);
    expect(assigned.body).toMatchObject({
      status: 'ASSIGNED',
      assignedAgentId: null,
    });
  });

  it('transfers only manager responsibility and immediately changes manager authorization', async () => {
    const management = await db.teamManager.findMany({
      where: { teamId: { in: [teamA.id, teamB.id, teamC.id] } },
      orderBy: { teamId: 'asc' },
    });
    await patch(`/tickets/${owned.id}/manager`, 'otherManager', {
      assignedManagerId: users.otherManager.id,
    }).expect(403);
    const result = await patch(`/tickets/${owned.id}/manager`, 'manager', {
      assignedManagerId: users.thirdManager.id,
    }).expect(200);
    expect(result.body).toMatchObject({
      assignedManagerId: users.thirdManager.id,
      assignedTeamId: teamA.id,
      assignedAgentId: users.agent.id,
      status: 'IN_PROGRESS',
      resolvedAt: null,
      closedAt: null,
    });
    await get(`/tickets/${owned.id}`, 'manager').expect(404);
    await patch(`/tickets/${owned.id}`, 'manager', {
      title: 'Stale authority',
    }).expect(403);
    await patch(`/tickets/${owned.id}`, 'thirdManager', {
      title: 'New owner',
    }).expect(200);
    await patch(`/tickets/${owned.id}/manager`, 'thirdManager', {
      assignedManagerId: null,
    }).expect(400);
    expect(
      await db.teamManager.findMany({
        where: { teamId: { in: [teamA.id, teamB.id, teamC.id] } },
        orderBy: { teamId: 'asc' },
      }),
    ).toEqual(management);
    const choices = (
      await get(`/ticket-workspace/tickets/${owned.id}`, 'thirdManager').expect(
        200,
      )
    ).body;
    expect(choices.teams.map((team: { id: number }) => team.id)).not.toContain(
      teamA.id,
    );
    await patch(`/tickets/${owned.id}/assignment`, 'thirdManager', {
      teamId: teamA.id,
      agentId: null,
    }).expect(403);
  });

  it('allows a responsible manager to select their managed regional team', async () => {
    await patch(`/tickets/${intake.id}/manager`, 'manager', {
      assignedManagerId: users.manager.id,
    }).expect(200);
    const result = await patch(`/tickets/${intake.id}/assignment`, 'manager', {
      teamId: teamA.id,
      agentId: users.agent.id,
    }).expect(200);
    expect(result.body).toMatchObject({
      assignedManagerId: users.manager.id,
      assignedTeamId: teamA.id,
      assignedAgentId: users.agent.id,
      status: 'ASSIGNED',
    });
  });

  it('forbids another manager regional team without changing responsibility or assignments', async () => {
    await patch(`/tickets/${owned.id}/assignment`, 'manager', {
      teamId: teamC.id,
      agentId: null,
    }).expect(403);
    expect(
      await db.ticket.findUniqueOrThrow({ where: { id: owned.id } }),
    ).toEqual(owned);
    // Removing organizational management does not make a regional team eligible.
    await db.teamManager.delete({ where: { teamId: teamC.id } });
    await patch(`/tickets/${owned.id}/assignment`, 'manager', {
      teamId: teamC.id,
      agentId: null,
    }).expect(403);
    const choices = (
      await get(`/ticket-workspace/tickets/${owned.id}`, 'manager').expect(200)
    ).body;
    expect(choices.teams.map((team: { id: number }) => team.id)).not.toContain(
      teamC.id,
    );
  });

  it('forbids a matching regional specialty under another manager and offers GLOBAL routing', async () => {
    // Tickets have categories rather than a Specialty FK; match the problem's
    // category/title and affected region to the destination specialty explicitly.
    const specialty = await db.specialty.create({
      data: { name: `Cybersecurity-${randomUUID()}` },
    });
    try {
      await db.ticketCategory.update({
        where: { id: categoryId },
        data: { name: specialty.name },
      });
      await db.ticket.update({
        where: { id: owned.id },
        data: {
          title: `${specialty.name} incident`,
          allRegions: false,
          affectedRegions: { create: { regionId } },
        },
      });
      await db.teamSpecialty.createMany({
        data: [teamB, teamC].map((team) => ({
          teamId: team.id,
          specialtyId: specialty.id,
        })),
      });
      await patch(`/tickets/${owned.id}/assignment`, 'manager', {
        teamId: teamC.id,
        agentId: null,
      }).expect(403);
      const choices = (
        await get(`/ticket-workspace/tickets/${owned.id}`, 'manager').expect(
          200,
        )
      ).body;
      expect(
        choices.teams.map((team: { id: number }) => team.id),
      ).not.toContain(teamC.id);
      expect(choices.teams.map((team: { id: number }) => team.id)).toContain(
        teamB.id,
      );
      const result = await patch(`/tickets/${owned.id}/assignment`, 'manager', {
        teamId: teamB.id,
        agentId: users.otherAgent.id,
      }).expect(200);
      expect(result.body).toMatchObject({
        assignedManagerId: users.manager.id,
        assignedTeamId: teamB.id,
        assignedAgentId: users.otherAgent.id,
      });
      expect(
        await db.teamManager.findUnique({ where: { teamId: teamB.id } }),
      ).toMatchObject({ managerId: users.otherManager.id });
    } finally {
      await db.specialty.delete({ where: { id: specialty.id } });
    }
  });

  it.each(['REGION', 'GLOBAL'] as const)(
    'requires an active member AGENT for primary %s assignment',
    async (scope) => {
      const team = scope === 'REGION' ? teamA : teamB;
      const member = scope === 'REGION' ? users.agent : users.otherAgent;
      const outsider = scope === 'REGION' ? users.otherAgent : users.agent;
      await patch(`/tickets/${owned.id}/assignment`, 'manager', {
        teamId: team.id,
        agentId: outsider.id,
      }).expect(400);
      await patch(`/tickets/${owned.id}/assignment`, 'manager', {
        teamId: team.id,
        agentId: users.manager.id,
      }).expect(400);
      await db.user.update({
        where: { id: member.id },
        data: { status: 'INACTIVE' },
      });
      await patch(`/tickets/${owned.id}/assignment`, 'manager', {
        teamId: team.id,
        agentId: member.id,
      }).expect(400);
      await db.user.update({
        where: { id: member.id },
        data: { status: 'ACTIVE' },
      });
      await patch(`/tickets/${owned.id}/assignment`, 'manager', {
        teamId: team.id,
        agentId: null,
      }).expect(200);
      // A current subtask collaborator never fills the explicit NULL primary agent.
      expect(
        (await db.ticket.findUniqueOrThrow({ where: { id: owned.id } }))
          .assignedAgentId,
      ).toBeNull();
      await patch(`/tickets/${owned.id}/assignment`, 'manager', {
        agentId: member.id,
      }).expect(200);
    },
  );

  it('rejects primary routing after organizational management is removed', async () => {
    await db.teamManager.delete({ where: { teamId: teamA.id } });
    await patch(`/tickets/${owned.id}/assignment`, 'manager', {
      agentId: null,
    }).expect(403);
    const choices = (
      await get(`/ticket-workspace/tickets/${owned.id}`, 'manager').expect(200)
    ).body;
    expect(choices.teams.map((team: { id: number }) => team.id)).not.toContain(
      teamA.id,
    );
    // The existing lead's within-team powers do not depend on TeamManager.
    await patch(`/tickets/${owned.id}/assignment`, 'lead', {
      agentId: users.member.id,
    }).expect(200);
    await patch(`/tickets/${owned.id}/assignment`, 'lead', {
      teamId: teamB.id,
      agentId: null,
    }).expect(403);
  });

  it('rejects primary routing waiting behind removal of organizational management', async () => {
    let unlock!: () => void;
    let locked!: () => void;
    const ready = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const release = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const removal = db.$transaction(
      async (tx) => {
        await tx.teamManager.delete({ where: { teamId: teamA.id } });
        locked();
        await release;
      },
      { timeout: 15000 },
    );
    await ready;
    const assignment = patch(`/tickets/${owned.id}/assignment`, 'manager', {
      teamId: teamA.id,
      agentId: null,
    }).then((response) => response);
    try {
      await waitForBlocked(1, 'SELECT "teamId" FROM "TeamManager"%');
    } finally {
      unlock();
      await removal;
    }
    expect((await assignment).status).toBe(409);
    expect(
      await db.ticket.findUniqueOrThrow({ where: { id: owned.id } }),
    ).toEqual(owned);
    await patch(`/tickets/${owned.id}/assignment`, 'manager', {
      agentId: null,
    }).expect(403);
  });

  it('preserves omitted agents and requires explicit correction when changing teams', async () => {
    await patch(`/tickets/${owned.id}/assignment`, 'otherManager', {
      teamId: teamB.id,
      agentId: users.otherAgent.id,
    }).expect(403);
    await patch(`/tickets/${owned.id}/assignment`, 'manager', {
      teamId: teamB.id,
    }).expect(400);
    expect(
      await db.ticket.findUnique({ where: { id: owned.id } }),
    ).toMatchObject({
      assignedTeamId: teamA.id,
      assignedAgentId: users.agent.id,
    });
    await patch(`/tickets/${owned.id}/assignment`, 'manager', {
      teamId: teamB.id,
      agentId: null,
    }).expect(200);
    const result = await patch(`/tickets/${owned.id}/assignment`, 'manager', {
      agentId: users.otherAgent.id,
    }).expect(200);
    expect(result.body).toMatchObject({
      assignedManagerId: users.manager.id,
      assignedTeamId: teamB.id,
      assignedAgentId: users.otherAgent.id,
      status: 'IN_PROGRESS',
    });
    await patch(`/tickets/${owned.id}/assignment`, 'manager', {
      teamId: null,
    }).expect(400);
  });

  it('permits a Team Lead to change only primary agents within their led team', async () => {
    await patch(`/tickets/${owned.id}/assignment`, 'lead', {
      agentId: users.member.id,
    }).expect(200);
    await patch(`/tickets/${owned.id}/assignment`, 'lead', {
      agentId: users.otherAgent.id,
    }).expect(400);
    await patch(`/tickets/${owned.id}/assignment`, 'lead', {
      teamId: teamB.id,
      agentId: null,
    }).expect(403);
    await patch(`/tickets/${owned.id}/manager`, 'lead', {
      assignedManagerId: users.otherManager.id,
    }).expect(403);
    await patch(`/tickets/${owned.id}/assignment`, 'member', {
      agentId: users.agent.id,
    }).expect(403);
  });

  it.each([
    TicketStatus.ASSIGNED,
    TicketStatus.IN_PROGRESS,
    TicketStatus.WAITING_FOR_EMPLOYEE,
    TicketStatus.BLOCKED,
  ])('preserves %s on ownership changes', async (status) => {
    await db.ticket.update({ where: { id: owned.id }, data: { status } });
    const response = await patch(`/tickets/${owned.id}/assignment`, 'manager', {
      agentId: null,
    }).expect(200);
    expect(response.body).toMatchObject({
      status,
      resolvedAt: null,
      closedAt: null,
    });
    expect(
      (
        await patch(`/tickets/${owned.id}/manager`, 'manager', {
          assignedManagerId: users.otherManager.id,
        }).expect(200)
      ).body.status,
    ).toBe(status);
  });

  it.each([TicketStatus.RESOLVED, TicketStatus.CLOSED])(
    'freezes ownership and all subtask mutations under %s',
    async (status) => {
      const resolvedAt = new Date('2026-01-01T00:00:00Z');
      const closedAt =
        status === TicketStatus.CLOSED
          ? new Date('2026-01-02T00:00:00Z')
          : null;
      await db.ticket.update({
        where: { id: owned.id },
        data: { status, resolvedAt, closedAt },
      });
      await patch(`/tickets/${owned.id}/manager`, 'manager', {
        assignedManagerId: users.otherManager.id,
      }).expect(409);
      await patch(`/tickets/${owned.id}/assignment`, 'manager', {
        teamId: teamB.id,
        agentId: null,
      }).expect(409);
      await patch(`/tickets/${owned.id}/assignment`, 'lead', {
        agentId: users.member.id,
      }).expect(409);
      await post(`/tickets/${owned.id}/subtasks`, 'manager', {
        title: 'New',
        description: 'Work',
      }).expect(409);
      for (const name of ['manager', 'otherLead', 'otherAgent']) {
        await patch(`/tickets/subtasks/${subtask.id}`, name, {
          title: 'Changed',
        }).expect(409);
        await patch(`/tickets/subtasks/${subtask.id}`, name, {
          status: 'COMPLETED',
        }).expect(409);
      }
      await patch(`/tickets/subtasks/${subtask.id}`, 'manager', {
        assignedAgentId: null,
      }).expect(409);
      expect(
        await db.ticket.findUnique({ where: { id: owned.id } }),
      ).toMatchObject({
        assignedManagerId: users.manager.id,
        assignedTeamId: teamA.id,
        assignedAgentId: users.agent.id,
        status,
        resolvedAt,
        closedAt,
      });
      await get(`/tickets/subtasks/${subtask.id}`, 'otherAgent').expect(200);
    },
  );

  it('allows resolution and employee-confirmed closure without assignment bypass', async () => {
    await patch(`/tickets/${owned.id}/status`, 'agent', {
      status: 'BLOCKED',
    }).expect(200);
    await patch(`/tickets/${owned.id}/status`, 'agent', {
      status: 'IN_PROGRESS',
    }).expect(200);
    const resolved = await patch(`/tickets/${owned.id}/status`, 'agent', {
      status: 'RESOLVED',
    }).expect(200);
    await patch(`/tickets/${owned.id}/status`, 'otherManager', {
      status: 'CLOSED',
    }).expect(403);
    const closed = await patch(`/tickets/${owned.id}/status`, 'employee', {
      status: 'CLOSED',
    }).expect(200);
    expect(closed.body.resolvedAt).toBe(resolved.body.resolvedAt);
    expect(closed.body.closedAt).not.toBeNull();
    await patch(`/tickets/${owned.id}/status`, 'manager', {
      status: 'IN_PROGRESS',
    }).expect(409);
  });

  it('filters support subtasks independently of parent visibility and never includes the parent', async () => {
    for (const name of ['manager', 'otherLead', 'otherAgent']) {
      const result = await get(`/tickets/subtasks/${subtask.id}`, name).expect(
        200,
      );
      expect(result.body.id).toBe(subtask.id);
      expect(result.body).not.toHaveProperty('ticket');
      expect(result.body).not.toHaveProperty('requester');
      expect(result.body).not.toHaveProperty('assignedTeam');
      expect(
        (await get('/tickets/subtasks', name).expect(200)).body.items.map(
          (row: { id: number }) => row.id,
        ),
      ).toEqual([subtask.id]);
    }
    for (const name of ['agent', 'lead', 'member', 'otherManager']) {
      await get(`/tickets/subtasks/${subtask.id}`, name).expect(404);
      expect(
        (await get(`/tickets/${owned.id}/subtasks`, name).expect(200)).body
          .items,
      ).toEqual([]);
      await patch(`/tickets/subtasks/${subtask.id}`, name, {
        status: 'COMPLETED',
      }).expect(403);
    }
    await get('/tickets/subtasks', 'employee').expect(403);
    await patch(`/tickets/subtasks/${subtask.id}`, 'employee', {
      status: 'COMPLETED',
    }).expect(403);
  });

  it('separates subtask work, within-team coordination, and cross-team delegation', async () => {
    await patch(`/tickets/subtasks/${subtask.id}`, 'otherAgent', {
      status: 'COMPLETED',
    }).expect(200);
    expect(
      (await db.ticket.findUniqueOrThrow({ where: { id: owned.id } })).status,
    ).toBe(TicketStatus.IN_PROGRESS);
    await patch(`/tickets/subtasks/${subtask.id}`, 'otherAgent', {
      assignedAgentId: null,
    }).expect(403);
    await patch(`/tickets/subtasks/${subtask.id}`, 'otherLead', {
      assignedAgentId: null,
    }).expect(200);
    await patch(`/tickets/subtasks/${subtask.id}`, 'otherLead', {
      assignedTeamId: teamA.id,
    }).expect(403);
    await patch(`/tickets/subtasks/${subtask.id}`, 'manager', {
      assignedTeamId: teamA.id,
      assignedAgentId: users.agent.id,
    }).expect(200);
    await get(`/tickets/subtasks/${subtask.id}`, 'otherLead').expect(404);
    await get(`/tickets/subtasks/${subtask.id}`, 'lead').expect(200);
  });

  it('requires explicit NULLs and validates the persisted subtask ownership state', async () => {
    await patch(`/tickets/subtasks/${subtask.id}`, 'manager', {
      assignedTeamId: null,
    }).expect(400);
    await patch(`/tickets/subtasks/${subtask.id}`, 'manager', {
      assignedTeamId: teamA.id,
    }).expect(400);
    expect(
      await db.subtask.findUnique({ where: { id: subtask.id } }),
    ).toMatchObject({
      assignedTeamId: teamB.id,
      assignedAgentId: users.otherAgent.id,
    });
    const cleared = await patch(`/tickets/subtasks/${subtask.id}`, 'manager', {
      assignedTeamId: null,
      assignedAgentId: null,
    }).expect(200);
    expect(cleared.body).toMatchObject({
      assignedTeamId: null,
      assignedAgentId: null,
    });
    const edited = await patch(`/tickets/subtasks/${subtask.id}`, 'manager', {
      title: 'Still unassigned',
    }).expect(200);
    expect(edited.body).toMatchObject({
      assignedTeamId: null,
      assignedAgentId: null,
    });
    await patch(`/tickets/subtasks/${subtask.id}`, 'manager', {
      status: null,
    }).expect(400);
    await patch(`/tickets/subtasks/${subtask.id}`, 'manager', {
      title: null,
    }).expect(400);
  });

  it('allows lead creation only explicitly within their parent-ticket team', async () => {
    const body = { title: 'Local work', description: 'Work' };
    await post(`/tickets/${owned.id}/subtasks`, 'lead', body).expect(403);
    await post(`/tickets/${owned.id}/subtasks`, 'lead', {
      ...body,
      assignedTeamId: teamB.id,
    }).expect(403);
    await post(`/tickets/${owned.id}/subtasks`, 'lead', {
      ...body,
      assignedTeamId: teamA.id,
      assignedAgentId: users.member.id,
    }).expect(201);
    await post(`/tickets/${owned.id}/subtasks`, 'agent', {
      ...body,
      assignedTeamId: teamA.id,
    }).expect(403);
    await post(`/tickets/${owned.id}/subtasks`, 'otherManager', body).expect(
      403,
    );
    expect(
      (await post(`/tickets/${owned.id}/subtasks`, 'manager', body).expect(201))
        .body,
    ).toMatchObject({ assignedTeamId: null, assignedAgentId: null });
  });

  it('restricts manager deletion while preserving nullable legacy ownership', async () => {
    await expect(
      db.user.delete({ where: { id: users.manager.id } }),
    ).rejects.toMatchObject({ code: 'P2003' });
    const legacy = await db.ticket.create({
      data: {
        title: 'Legacy',
        description: 'No inferred manager',
        requesterId: users.employee.id,
        categoryId,
        status: 'ASSIGNED',
        assignedTeamId: teamA.id,
      },
    });
    expect(legacy.assignedManagerId).toBeNull();
    await get(`/tickets/${legacy.id}`, 'otherManager').expect(404);
    await patch(`/tickets/${legacy.id}/manager`, 'otherManager', {
      assignedManagerId: users.otherManager.id,
    }).expect(403);
  });

  async function waitForBlocked(
    count: number,
    query = 'SELECT id FROM "Ticket"%',
  ) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const rows = await db.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*) FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'
        AND query LIKE ${query}
      `;
      if (Number(rows[0].count) >= count) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('Requests did not reach the database lock');
  }

  it('allows exactly one concurrent claim, including assigning the same target manager', async () => {
    let unlock!: () => void;
    let locked!: () => void;
    const ready = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const release = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const blocker = db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${intake.id} FOR UPDATE`;
        locked();
        await release;
      },
      { timeout: 15000 },
    );
    await ready;
    const requests = ['manager', 'otherManager'].map((name) =>
      patch(`/tickets/${intake.id}/manager`, name, {
        assignedManagerId: users.manager.id,
      }).then((response) => response),
    );
    try {
      await waitForBlocked(2);
    } finally {
      unlock();
      await blocker;
    }
    const responses = await Promise.all(requests);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    expect(
      await db.ticket.findUnique({ where: { id: intake.id } }),
    ).toMatchObject({
      assignedManagerId: users.manager.id,
      status: TicketStatus.NEW,
    });
  });

  it('rejects stale manager edits waiting behind an ownership transfer', async () => {
    let unlock!: () => void;
    let locked!: () => void;
    const ready = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const release = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const transfer = db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${owned.id} FOR UPDATE`;
        locked();
        await release;
        await tx.ticket.update({
          where: { id: owned.id },
          data: { assignedManagerId: users.otherManager.id },
        });
      },
      { timeout: 15000 },
    );
    await ready;
    const stale = patch(`/tickets/${owned.id}`, 'manager', {
      title: 'Must not persist',
    }).then((response) => response);
    try {
      await waitForBlocked(1);
    } finally {
      unlock();
      await transfer;
    }
    expect((await stale).status).toBe(409);
    expect(
      await db.ticket.findUnique({ where: { id: owned.id } }),
    ).toMatchObject({
      title: 'Owned',
      assignedManagerId: users.otherManager.id,
    });
  });

  it('rejects subtask work waiting behind parent resolution', async () => {
    let unlock!: () => void;
    let locked!: () => void;
    const ready = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const release = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const resolution = db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${owned.id} FOR UPDATE`;
        locked();
        await release;
        await tx.ticket.update({
          where: { id: owned.id },
          data: { status: TicketStatus.RESOLVED, resolvedAt: new Date() },
        });
      },
      { timeout: 15000 },
    );
    await ready;
    const stale = patch(`/tickets/subtasks/${subtask.id}`, 'otherAgent', {
      status: 'COMPLETED',
    }).then((response) => response);
    try {
      await waitForBlocked(1);
    } finally {
      unlock();
      await resolution;
    }
    expect((await stale).status).toBe(409);
    expect(
      (await db.subtask.findUniqueOrThrow({ where: { id: subtask.id } }))
        .status,
    ).toBe(SubtaskStatus.TODO);
  });

  const deactivate = (name: string, actor = 'admin') =>
    patch(`/users/${users[name].id}/status`, actor, { status: 'INACTIVE' });
  const reactivate = (name: string, actor = 'admin') =>
    patch(`/users/${users[name].id}/status`, actor, { status: 'ACTIVE' });
  async function resolveOwned(close = false) {
    await patch(`/tickets/${owned.id}/status`, 'agent', {
      status: 'RESOLVED',
      resolutionSummary: 'Connection verified',
    }).expect(200);
    if (close)
      await patch(`/tickets/${owned.id}/status`, 'employee', {
        status: 'CLOSED',
      }).expect(200);
  }

  it('creates an ORIGINAL cycle atomically with an employee ticket', async () => {
    const response = await post('/tickets', 'employee', {
      title: 'Fresh',
      description: 'Description',
      categoryId,
      allRegions: true,
      allDepartments: true,
      affectedRegionIds: [],
      affectedDepartmentIds: [],
    }).expect(201);
    const cycles = await db.ticketWorkCycle.findMany({
      where: { ticketId: response.body.id },
    });
    expect(cycles).toHaveLength(1);
    expect(cycles[0]).toMatchObject({
      type: 'ORIGINAL',
      sequenceNumber: 1,
      startedById: users.employee.id,
      outcome: null,
    });
    expect(cycles[0].startedAt.toISOString()).toBe(response.body.createdAt);
  });

  it.each(['NEW', 'ASSIGNED'] as TicketStatus[])(
    'cancels own %s and preserves existing data',
    async (status) => {
      await db.ticket.update({ where: { id: owned.id }, data: { status } });
      await post(`/tickets/${owned.id}/cancel`, 'otherEmployee', {}).expect(
        403,
      );
      await post(`/tickets/${owned.id}/cancel`, 'manager', {}).expect(403);
      const before = await db.subtask.findUniqueOrThrow({
        where: { id: subtask.id },
      });
      await post(`/tickets/${owned.id}/cancel`, 'employee', {}).expect(201);
      const ticket = await db.ticket.findUniqueOrThrow({
        where: { id: owned.id },
      });
      expect(ticket).toMatchObject({
        status: 'CANCELLED',
        assignedManagerId: users.manager.id,
        assignedTeamId: teamA.id,
        assignedAgentId: users.agent.id,
        resolvedAt: null,
        closedAt: null,
      });
      expect(
        await db.subtask.findUniqueOrThrow({ where: { id: subtask.id } }),
      ).toEqual(before);
      const cycle = await db.ticketWorkCycle.findFirstOrThrow({
        where: { ticketId: owned.id },
      });
      expect(cycle).toMatchObject({
        outcome: 'CANCELLED',
        endedById: users.employee.id,
      });
      expect(cycle.endedAt).not.toBeNull();
      await post(`/tickets/${owned.id}/reopen`, 'employee', {
        reason: 'Changed mind',
      }).expect(409);
    },
  );

  it.each([
    'IN_PROGRESS',
    'WAITING_FOR_EMPLOYEE',
    'BLOCKED',
    'RESOLVED',
    'CLOSED',
    'CANCELLED',
  ] as TicketStatus[])('rejects cancellation from %s', async (status) => {
    await db.ticket.update({ where: { id: owned.id }, data: { status } });
    await post(`/tickets/${owned.id}/cancel`, 'employee', {}).expect(409);
  });

  it.each(['RESOLVED', 'CLOSED', 'CANCELLED'] as TicketStatus[])(
    'freezes all ordinary mutations on %s',
    async (status) => {
      await db.ticket.update({ where: { id: owned.id }, data: { status } });
      for (const body of [
        { title: 'Changed' },
        { description: 'Changed' },
        { categoryId },
        { priority: 'LOW' },
        { tagIds: [] },
        { allRegions: true },
        { allDepartments: true },
      ]) {
        await patch(`/tickets/${owned.id}`, 'manager', body).expect(409);
      }
      await patch(`/tickets/${owned.id}/manager`, 'manager', {
        assignedManagerId: users.otherManager.id,
      }).expect(409);
      await patch(`/tickets/${owned.id}/assignment`, 'manager', {
        teamId: teamB.id,
        agentId: null,
      }).expect(409);
      await post(`/tickets/${owned.id}/subtasks`, 'manager', {
        title: 'New',
        description: 'Work',
      }).expect(409);
      for (const body of [
        { title: 'Changed' },
        { status: 'COMPLETED' },
        { assignedAgentId: null },
      ]) {
        await patch(`/tickets/subtasks/${subtask.id}`, 'manager', body).expect(
          409,
        );
      }
    },
  );

  it.each([
    'agent',
    'lead',
    'otherManager',
    'otherEmployee',
    'admin',
    'superAdmin',
  ])('rejects reopen authority for %s', async (name) => {
    await resolveOwned();
    await post(`/tickets/${owned.id}/reopen`, name, { reason: 'Again' }).expect(
      403,
    );
  });

  it.each([
    ['employee', false],
    ['employee', true],
    ['manager', false],
    ['manager', true],
  ] as const)('allows %s reopening (closed=%s)', async (name, close) => {
    await resolveOwned(close);
    await post(`/tickets/${owned.id}/reopen`, name, { reason: 'Again' }).expect(
      201,
    );
    expect(
      await db.ticket.findUniqueOrThrow({ where: { id: owned.id } }),
    ).toMatchObject({
      status: 'IN_PROGRESS',
      assignedManagerId: users.manager.id,
      assignedTeamId: teamA.id,
      assignedAgentId: users.agent.id,
      resolvedAt: null,
      closedAt: null,
    });
  });

  it('preserves two previous attempts, timestamps, ownership and independently authorized work', async () => {
    await patch(`/tickets/subtasks/${subtask.id}`, 'otherAgent', {
      status: 'COMPLETED',
    }).expect(200);
    const originalSubtask = await db.subtask.findUniqueOrThrow({
      where: { id: subtask.id },
    });
    expect(originalSubtask.completedById).toBe(users.otherAgent.id);
    await resolveOwned(true);
    const first = await db.ticketWorkCycle.findFirstOrThrow({
      where: { ticketId: owned.id },
    });
    expect(first.endedAt).not.toBeNull();
    expect(first.closedAt).not.toBeNull();
    expect(first.endedById).toBe(users.agent.id);
    expect(first.closedById).toBe(users.employee.id);
    await post(`/tickets/${owned.id}/reopen`, 'employee', {
      reason: 'First recurrence',
    }).expect(201);
    await patch(`/tickets/${owned.id}/assignment`, 'manager', {
      agentId: users.member.id,
    }).expect(200);
    await patch(`/tickets/subtasks/${subtask.id}`, 'otherAgent', {
      status: 'IN_PROGRESS',
    }).expect(409);
    await patch(`/tickets/subtasks/${subtask.id}`, 'manager', {
      title: 'Rewrite',
    }).expect(409);
    expect(
      await db.subtask.findUniqueOrThrow({ where: { id: subtask.id } }),
    ).toEqual(originalSubtask);
    const newTask = await post(`/tickets/${owned.id}/subtasks`, 'manager', {
      title: 'New investigation',
      description: 'Private new work',
    }).expect(201);
    expect(newTask.body.createdInCycleId).not.toBe(first.id);
    await patch(`/tickets/${owned.id}/status`, 'manager', {
      status: 'RESOLVED',
    }).expect(200);
    await post(`/tickets/${owned.id}/reopen`, 'employee', {
      reason: 'Second recurrence',
    }).expect(201);
    const history = (
      await get(`/tickets/${owned.id}/history`, 'manager').expect(200)
    ).body;
    expect(history.cycles.map((cycle) => cycle.sequenceNumber)).toEqual([
      3, 2, 1,
    ]);
    expect(history.cycles.map((cycle) => cycle.type)).toEqual([
      'REOPENED',
      'REOPENED',
      'ORIGINAL',
    ]);
    expect(history.cycles[2].ownership.agent!.id).toBe(users.agent.id);
    expect(history.cycles[0].ownership.agent!.id).toBe(users.member.id);
    expect(history.cycles[2].subtasks![0].id).toBe(subtask.id);
    expect(history.cycles[1].subtasks![0].status).toBe('TODO');
    expect(history.cycles[1].subtasks![0].id).toBe(newTask.body.id);
    expect(history.cycles[2].endedAt).toBe(first.endedAt!.toISOString());
    expect(history.cycles[2].closedAt).toBe(first.closedAt!.toISOString());
    expect(history.cycles[0]).toMatchObject({
      isCurrent: true,
      isEnded: false,
      startReason: 'Second recurrence',
    });
    const employeeHistory = (
      await get(`/tickets/${owned.id}/history`, 'employee').expect(200)
    ).body;
    expect(employeeHistory.subtasksAccess).toBe('NONE');
    expect(
      employeeHistory.cycles.every((cycle) => !('subtasks' in cycle)),
    ).toBe(true);
    expect(JSON.stringify(employeeHistory)).not.toContain('Private new work');
    const agentHistory = (
      await get(`/tickets/${owned.id}/history`, 'member').expect(200)
    ).body;
    expect(agentHistory.subtasksAccess).toBe('FILTERED');
    expect(
      agentHistory.cycles.every((cycle) => cycle.subtasks!.length === 0),
    ).toBe(true);
    await get(`/tickets/${owned.id}/history`, 'agent').expect(404);
    await get(`/tickets/${owned.id}/history`, 'otherAgent').expect(404);
    await get(`/tickets/subtasks/${subtask.id}`, 'otherAgent').expect(200);
    await get(`/tickets/${owned.id}/history`, 'admin').expect(403);
    await get(`/tickets/${owned.id}/history`, 'superAdmin').expect(403);
    expect(
      (await get('/tickets', 'agent')).body.items.some(
        (ticket: { id: number }) => ticket.id === owned.id,
      ),
    ).toBe(false);
    expect(
      (await get(`/tickets/${owned.id}`, 'employee')).body.currentCycle!
        .sequenceNumber,
    ).toBe(3);
  });

  it('requires a nonempty reopening reason and rejects ordinary status reopening', async () => {
    await resolveOwned();
    await post(`/tickets/${owned.id}/reopen`, 'employee', {
      reason: '   ',
    }).expect(400);
    await patch(`/tickets/${owned.id}/status`, 'manager', {
      status: 'IN_PROGRESS',
    }).expect(409);
    expect(
      await db.ticketWorkCycle.count({ where: { ticketId: owned.id } }),
    ).toBe(1);
  });

  it('offboards a manager to empty intake without altering terminal history or granting admin visibility', async () => {
    await db.ticket.update({
      where: { id: intake.id },
      data: { assignedManagerId: users.manager.id },
    });
    await db.teamManager.create({
      data: {
        teamId: (
          await db.team.create({
            data: { name: `offboard-${randomUUID()}`, scope: 'GLOBAL' },
          })
        ).id,
        managerId: users.manager.id,
      },
    });
    const managed = await db.teamManager.findFirstOrThrow({
      where: { managerId: users.manager.id, teamId: { not: teamA.id } },
    });
    try {
      await resolveOwned(true);
      const before = await db.ticket.findUniqueOrThrow({
        where: { id: owned.id },
      });
      const cycle = await db.ticketWorkCycle.findFirstOrThrow({
        where: { ticketId: owned.id },
      });
      const result = await deactivate('manager').expect(200);
      expect(result.body).toEqual({ id: users.manager.id, status: 'INACTIVE' });
      expect(
        await db.ticket.findUniqueOrThrow({ where: { id: intake.id } }),
      ).toMatchObject({
        status: 'NEW',
        assignedManagerId: null,
        assignedTeamId: null,
        assignedAgentId: null,
      });
      expect(
        await db.ticket.findUniqueOrThrow({ where: { id: owned.id } }),
      ).toEqual(before);
      expect(
        await db.ticketWorkCycle.findUniqueOrThrow({ where: { id: cycle.id } }),
      ).toEqual(cycle);
      expect(
        await db.teamManager.count({ where: { managerId: users.manager.id } }),
      ).toBe(0);
      await get(`/tickets/${owned.id}`, 'admin').expect(403);
      await post(`/tickets/${owned.id}/reopen`, 'employee', {
        reason: 'Manager departed',
      }).expect(201);
      expect(
        await db.ticket.findUniqueOrThrow({ where: { id: owned.id } }),
      ).toMatchObject({
        status: 'NEW',
        assignedManagerId: null,
        assignedTeamId: null,
        assignedAgentId: null,
      });
      await get(`/tickets/${owned.id}`, 'otherManager').expect(200);
      await get(`/tickets/${owned.id}`, 'agent').expect(404);
      expect(
        (await get(`/tickets/${owned.id}/history`, 'otherManager')).body
          .subtasksAccess,
      ).toBe('NONE');
    } finally {
      await db.teamManager.deleteMany({ where: { teamId: managed.teamId } });
      await db.team.delete({ where: { id: managed.teamId } });
    }
  });

  it.each([
    'NEW',
    'ASSIGNED',
    'IN_PROGRESS',
    'WAITING_FOR_EMPLOYEE',
    'BLOCKED',
  ] as TicketStatus[])(
    'returns manager-owned %s work to intake within the same cycle',
    async (status) => {
      await db.ticket.update({ where: { id: owned.id }, data: { status } });
      const cycle = await db.ticketWorkCycle.findFirstOrThrow({
        where: { ticketId: owned.id },
      });
      await deactivate('manager').expect(200);
      expect(
        await db.ticket.findUniqueOrThrow({ where: { id: owned.id } }),
      ).toMatchObject({
        status: 'NEW',
        assignedManagerId: null,
        assignedTeamId: null,
        assignedAgentId: null,
      });
      expect(
        await db.ticketWorkCycle.findUniqueOrThrow({ where: { id: cycle.id } }),
      ).toEqual(cycle);
      expect(
        await db.ticketWorkCycle.count({ where: { ticketId: owned.id } }),
      ).toBe(1);
    },
  );

  it('offboards an agent and lead, clearing only actionable current responsibilities', async () => {
    await db.team.update({
      where: { id: teamB.id },
      data: { teamLeadId: users.otherAgent.id },
    });
    await db.ticket.update({
      where: { id: owned.id },
      data: { assignedAgentId: users.otherAgent.id, assignedTeamId: teamB.id },
    });
    const completed = await db.subtask.create({
      data: {
        ticketId: owned.id,
        createdInCycleId: subtask.createdInCycleId,
        title: 'Completed',
        description: 'History',
        status: 'COMPLETED',
        completedAt: new Date(),
        completedById: users.otherAgent.id,
        assignedAgentId: users.otherAgent.id,
        assignedTeamId: teamB.id,
      },
    });
    await deactivate('otherAgent').expect(200);
    expect(
      await db.ticket.findUniqueOrThrow({ where: { id: owned.id } }),
    ).toMatchObject({
      status: 'IN_PROGRESS',
      assignedManagerId: users.manager.id,
      assignedTeamId: teamB.id,
      assignedAgentId: null,
    });
    expect(
      await db.subtask.findUniqueOrThrow({ where: { id: subtask.id } }),
    ).toMatchObject({
      status: 'TODO',
      assignedTeamId: teamB.id,
      assignedAgentId: null,
    });
    expect(
      await db.subtask.findUniqueOrThrow({ where: { id: completed.id } }),
    ).toEqual(completed);
    expect(
      (await db.team.findUniqueOrThrow({ where: { id: teamB.id } })).teamLeadId,
    ).toBeNull();
    await patch(`/tickets/${owned.id}/assignment`, 'manager', {
      agentId: users.otherAgent.id,
    }).expect(400);
    await patch(`/tickets/subtasks/${subtask.id}`, 'manager', {
      assignedAgentId: users.otherAgent.id,
    }).expect(400);
    await post(
      `/organization/teams/${teamB.id}/lead/${users.otherAgent.id}`,
      'admin',
      {},
    ).expect(400);
    await post(
      `/organization/teams/${teamB.id}/members/${users.otherAgent.id}`,
      'admin',
      {},
    ).expect(400);
  });

  it('clears an inactive historical agent automatically on reopen while preserving the old cycle', async () => {
    await resolveOwned();
    await deactivate('agent').expect(200);
    expect(
      (await db.ticket.findUniqueOrThrow({ where: { id: owned.id } }))
        .assignedAgentId,
    ).toBe(users.agent.id);
    await post(`/tickets/${owned.id}/reopen`, 'employee', {
      reason: 'Again',
    }).expect(201);
    expect(
      await db.ticket.findUniqueOrThrow({ where: { id: owned.id } }),
    ).toMatchObject({
      status: 'IN_PROGRESS',
      assignedManagerId: users.manager.id,
      assignedTeamId: teamA.id,
      assignedAgentId: null,
    });
    expect(
      (
        await db.ticketWorkCycle.findFirstOrThrow({
          where: { ticketId: owned.id, sequenceNumber: 1 },
        })
      ).endingAgentId,
    ).toBe(users.agent.id);
  });

  it('returns legacy managerless terminal tickets to intake without fabricated ownership', async () => {
    await resolveOwned(true);
    await db.ticket.update({
      where: { id: owned.id },
      data: { assignedManagerId: null },
    });
    await post(`/tickets/${owned.id}/reopen`, 'employee', {
      reason: 'Again',
    }).expect(201);
    expect(
      await db.ticket.findUniqueOrThrow({ where: { id: owned.id } }),
    ).toMatchObject({
      status: 'NEW',
      assignedManagerId: null,
      assignedTeamId: null,
      assignedAgentId: null,
    });
  });

  it.each(['manager', 'agent', 'employee'])(
    'denies lifecycle authority to %s',
    async (name) => {
      await deactivate('member', name).expect(403);
    },
  );
  it('enforces administrative target authority and has no deletion routes', async () => {
    await deactivate('admin').expect(403);
    await deactivate('superAdmin').expect(403);
    await deactivate('superAdmin', 'superAdmin').expect(403);
    await deactivate('admin', 'superAdmin').expect(200);
    await reactivate('admin', 'superAdmin').expect(200);
    await request(app.getHttpServer())
      .delete(`/users/${users.employee.id}`)
      .set('Authorization', `Bearer ${token('superAdmin')}`)
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/tickets/${owned.id}`)
      .set('Authorization', `Bearer ${token('employee')}`)
      .expect(404);
  });
  it.each(['manager', 'agent', 'employee'])(
    'allows SUPER_ADMIN to offboard and reactivate %s without ticket authority',
    async (name) => {
      await deactivate(name, 'superAdmin').expect(200);
      await reactivate(name, 'superAdmin').expect(200);
    },
  );

  it('rotates atomically and logs out only the supplied session across independent logins', async () => {
    await db.user.update({
      where: { id: users.employee.id },
      data: { password: await bcrypt.hash('StrongPass123!', 4) },
    });
    const login = () =>
      request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: users.employee.email, password: 'StrongPass123!' })
        .expect(201);
    const [laptop, phone] = await Promise.all([login(), login()]);
    const contenders = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer())
          .post('/auth/refresh')
          .set('Cookie', laptop.headers['set-cookie']),
      ),
    );
    expect(contenders.filter((result) => result.status === 201)).toHaveLength(
      1,
    );
    // Serializable contention can reject before replay validation runs.
    expect([401, 409]).toContain(
      contenders.find((result) => result.status !== 201)?.status,
    );
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', laptop.headers['set-cookie'])
      .expect(401);
    const rotated = contenders.find((result) => result.status === 201)!;
    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', rotated.headers['set-cookie'])
      .expect(201);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', rotated.headers['set-cookie'])
      .expect(401);
    await request(app.getHttpServer())
      .get('/users/profile')
      .set('Authorization', `Bearer ${phone.body.accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', phone.headers['set-cookie'])
      .expect(201);
  });

  it('invalidates login, refresh and existing access; reactivation never restores old sessions', async () => {
    await db.user.update({
      where: { id: users.employee.id },
      data: { password: await bcrypt.hash('StrongPass123!', 4) },
    });
    const login = () =>
      request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: users.employee.email, password: 'StrongPass123!' });
    const session = await login().expect(201);
    const cookie = session.headers['set-cookie'];
    const refreshed = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', cookie)
      .expect(201);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', cookie)
      .expect(401);
    await deactivate('employee').expect(200);
    await login().expect(401);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', refreshed.headers['set-cookie'])
      .expect(401);
    await request(app.getHttpServer())
      .get('/users/profile')
      .set('Authorization', `Bearer ${session.body.accessToken}`)
      .expect(401);
    await reactivate('employee').expect(200);
    await request(app.getHttpServer())
      .get('/users/profile')
      .set('Authorization', `Bearer ${session.body.accessToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', refreshed.headers['set-cookie'])
      .expect(401);
    const fresh = await login().expect(201);
    await request(app.getHttpServer())
      .get('/users/profile')
      .set('Authorization', `Bearer ${fresh.body.accessToken}`)
      .expect(200);
    expect(
      await db.ticket.count({ where: { requesterId: users.employee.id } }),
    ).toBe(2);
  });

  it.each([
    ['employee', 'manager'],
    ['employee', 'employee'],
  ])(
    'creates exactly one cycle for simultaneous %s/%s reopen',
    async (first, second) => {
      await resolveOwned();
      let release!: () => void, ready!: () => void;
      const locked = new Promise<void>((resolve) => {
        ready = resolve;
      });
      const hold = new Promise<void>((resolve) => {
        release = resolve;
      });
      const blocker = db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${owned.id} FOR UPDATE`;
          ready();
          await hold;
        },
        { timeout: 15000 },
      );
      await locked;
      const requests = [first, second].map((name) =>
        post(`/tickets/${owned.id}/reopen`, name, {
          reason: 'Concurrent recurrence',
        }).then((response) => response),
      );
      try {
        await waitForBlocked(2);
      } finally {
        release();
        await blocker;
      }
      expect(
        (await Promise.all(requests)).map((response) => response.status).sort(),
      ).toEqual([201, 409]);
      expect(
        await db.ticketWorkCycle.count({ where: { ticketId: owned.id } }),
      ).toBe(2);
    },
  );

  it('rolls back cycle creation if the accompanying ticket update fails', async () => {
    await resolveOwned();
    // An isolated fixture trigger forces a failure after cycle insertion.
    const triggerName = `fail_reopen_${owned.id}`;
    await db.$executeRawUnsafe(
      `CREATE FUNCTION "${triggerName}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = ${owned.id} AND NEW.status = 'IN_PROGRESS' THEN RAISE EXCEPTION 'test rollback'; END IF; RETURN NEW; END $$`,
    );
    await db.$executeRawUnsafe(
      `CREATE TRIGGER "${triggerName}" BEFORE UPDATE ON "Ticket" FOR EACH ROW EXECUTE FUNCTION "${triggerName}"()`,
    );
    try {
      await post(`/tickets/${owned.id}/reopen`, 'employee', {
        reason: 'Failure test',
      }).expect(500);
      expect(
        await db.ticketWorkCycle.count({ where: { ticketId: owned.id } }),
      ).toBe(1);
      expect(
        (await db.ticket.findUniqueOrThrow({ where: { id: owned.id } })).status,
      ).toBe('RESOLVED');
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER "${triggerName}" ON "Ticket"`);
      await db.$executeRawUnsafe(`DROP FUNCTION "${triggerName}"()`);
    }
  });

  async function waitForUserLock() {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const rows = await db.$queryRaw<
        Array<{ count: bigint }>
      >`SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE 'SELECT id FROM "User"%'`;
      if (Number(rows[0].count) >= 1) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('Request did not reach a user lock');
  }

  it.each(['agent', 'otherManager'])(
    'rejects a new %s assignment waiting behind deactivation',
    async (target) => {
      let release!: () => void, ready!: () => void;
      const locked = new Promise<void>((resolve) => {
        ready = resolve;
      });
      const hold = new Promise<void>((resolve) => {
        release = resolve;
      });
      const offboarding = db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${users[target].id} FOR UPDATE`;
          ready();
          await hold;
          if (target === 'agent')
            await tx.ticket.update({
              where: { id: owned.id },
              data: { assignedAgentId: null },
            });
          await tx.user.update({
            where: { id: users[target].id },
            data: { status: 'INACTIVE', sessionVersion: { increment: 1 } },
          });
        },
        { timeout: 15000 },
      );
      await locked;
      const path =
        target === 'agent'
          ? `/tickets/${intake.id}/assignment`
          : `/tickets/${intake.id}/manager`;
      // Let the regular manager own intake so the agent assignment is authorized.
      if (target === 'agent')
        await db.ticket.update({
          where: { id: intake.id },
          data: { assignedManagerId: users.manager.id },
        });
      const body =
        target === 'agent'
          ? { teamId: teamA.id, agentId: users.agent.id }
          : { assignedManagerId: users.otherManager.id };
      const assignment = patch(path, 'manager', body).then(
        (response) => response,
      );
      try {
        await waitForUserLock();
      } finally {
        release();
        await offboarding;
      }
      expect((await assignment).status).toBe(409);
      await patch(path, 'manager', body).expect(400);
      const current = await db.ticket.findUniqueOrThrow({
        where: { id: intake.id },
      });
      expect(current.assignedAgentId).toBeNull();
      expect(current.assignedManagerId).not.toBe(users.otherManager.id);
    },
  );

  it.each(['agent', 'otherManager'])(
    'offboards a %s assignment committed before deactivation completes',
    async (target) => {
      let release!: () => void, ready!: () => void;
      const locked = new Promise<void>((resolve) => {
        ready = resolve;
      });
      const hold = new Promise<void>((resolve) => {
        release = resolve;
      });
      const assignment = db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${intake.id} FOR UPDATE`;
          await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${users[target].id} FOR UPDATE`;
          ready();
          await hold;
          await tx.ticket.update({
            where: { id: intake.id },
            data:
              target === 'agent'
                ? {
                    status: 'ASSIGNED',
                    assignedManagerId: users.manager.id,
                    assignedTeamId: teamA.id,
                    assignedAgentId: users.agent.id,
                  }
                : { assignedManagerId: users.otherManager.id },
          });
        },
        { timeout: 15000, isolationLevel: 'Serializable' },
      );
      await locked;
      const deactivation = deactivate(target).then((response) => response);
      try {
        await waitForUserLock();
      } finally {
        release();
        await assignment;
      }
      const response = await deactivation;
      // Serializable may reject the old snapshot. Retry the same explicit offboarding
      // request after reload; it must remove the assignment rather than report a blocker.
      if (response.status === 409) await deactivate(target).expect(200);
      else expect(response.status).toBe(200);
      const ticket = await db.ticket.findUniqueOrThrow({
        where: { id: intake.id },
      });
      expect(ticket.assignedAgentId).toBeNull();
      if (target === 'otherManager')
        expect(ticket).toMatchObject({
          status: 'NEW',
          assignedManagerId: null,
          assignedTeamId: null,
        });
      else
        expect(ticket).toMatchObject({
          status: 'ASSIGNED',
          assignedManagerId: users.manager.id,
          assignedTeamId: teamA.id,
        });
      expect(
        (await db.user.findUniqueOrThrow({ where: { id: users[target].id } }))
          .status,
      ).toBe('INACTIVE');
    },
  );

  it('serializes close versus reopen without conflicting history', async () => {
    await resolveOwned();
    let release!: () => void, ready!: () => void;
    const locked = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const blocker = db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${owned.id} FOR UPDATE`;
        ready();
        await hold;
      },
      { timeout: 15000 },
    );
    await locked;
    const close = patch(`/tickets/${owned.id}/status`, 'employee', {
      status: 'CLOSED',
    }).then((response) => response);
    const reopen = post(`/tickets/${owned.id}/reopen`, 'manager', {
      reason: 'Race',
    }).then((response) => response);
    try {
      await waitForBlocked(2);
    } finally {
      release();
      await blocker;
    }
    const responses = await Promise.all([close, reopen]);
    expect(
      responses.filter((response) => response.status === 409),
    ).toHaveLength(1);
    const current = await db.ticket.findUniqueOrThrow({
      where: { id: owned.id },
    });
    const cycles = await db.ticketWorkCycle.findMany({
      where: { ticketId: owned.id },
      orderBy: { sequenceNumber: 'asc' },
    });
    if (current.status === 'IN_PROGRESS') {
      expect(cycles).toHaveLength(2);
      expect(current.closedAt).toBeNull();
      expect(cycles[0].outcome).toBe('RESOLVED');
    } else {
      expect(current.status).toBe('CLOSED');
      expect(cycles).toHaveLength(1);
      expect(cycles[0].closedAt).toEqual(current.closedAt);
    }
  });

  it('rolls back all offboarding effects when user status cannot be persisted', async () => {
    const before = await db.ticket.findUniqueOrThrow({
      where: { id: owned.id },
    });
    const name = `fail_offboard_${users.manager.id}`;
    await db.$executeRawUnsafe(
      `CREATE FUNCTION "${name}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = ${users.manager.id} AND NEW.status = 'INACTIVE' THEN RAISE EXCEPTION 'test offboarding rollback'; END IF; RETURN NEW; END $$`,
    );
    await db.$executeRawUnsafe(
      `CREATE TRIGGER "${name}" BEFORE UPDATE ON "User" FOR EACH ROW EXECUTE FUNCTION "${name}"()`,
    );
    try {
      await deactivate('manager').expect(500);
      expect(
        await db.ticket.findUniqueOrThrow({ where: { id: owned.id } }),
      ).toEqual(before);
      expect(
        (await db.user.findUniqueOrThrow({ where: { id: users.manager.id } }))
          .status,
      ).toBe('ACTIVE');
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER "${name}" ON "User"`);
      await db.$executeRawUnsafe(`DROP FUNCTION "${name}"()`);
    }
  });

  it('keeps old incomplete cycle assignments historical during offboarding and current-work listing', async () => {
    const old = await db.subtask.findUniqueOrThrow({
      where: { id: subtask.id },
    });
    await resolveOwned();
    await post(`/tickets/${owned.id}/reopen`, 'employee', {
      reason: 'Again',
    }).expect(201);
    const current = await post(`/tickets/${owned.id}/subtasks`, 'manager', {
      title: 'Current work',
      description: 'New attempt',
      assignedTeamId: teamB.id,
      assignedAgentId: users.otherAgent.id,
    }).expect(201);
    expect(
      (
        await get('/tickets/subtasks?currentWork=true', 'otherAgent')
      ).body.items.map((task) => task.id),
    ).toEqual([current.body.id]);
    await deactivate('otherAgent').expect(200);
    expect(
      await db.subtask.findUniqueOrThrow({ where: { id: subtask.id } }),
    ).toEqual(old);
    expect(
      (await db.subtask.findUniqueOrThrow({ where: { id: current.body.id } }))
        .assignedAgentId,
    ).toBeNull();
    await patch(`/tickets/subtasks/${subtask.id}`, 'manager', {
      assignedAgentId: null,
    }).expect(409);
    await resolveOwned();
    expect(
      (await get('/tickets?active=true', 'employee')).body.items.map(
        (ticket: Pick<Ticket, 'id'>) => ticket.id,
      ),
    ).not.toContain(owned.id);
    expect(
      (await get('/tickets?status=RESOLVED', 'employee')).body.items.map(
        (ticket: Pick<Ticket, 'id'>) => ticket.id,
      ),
    ).toContain(owned.id);
    await get('/tickets?status=REOPENED', 'employee').expect(400);
  });

  it('does not grant history to a transferred manager and lets current led-team users read only their authorized subtasks', async () => {
    await resolveOwned();
    const lead = (await get(`/tickets/${owned.id}/history`, 'lead').expect(200))
      .body;
    expect(lead.subtasksAccess).toBe('FILTERED');
    expect(lead.cycles[0].subtasks).toEqual([]);
    await post(`/tickets/${owned.id}/reopen`, 'manager', {
      reason: 'Again',
    }).expect(201);
    await patch(`/tickets/${owned.id}/manager`, 'manager', {
      assignedManagerId: users.thirdManager.id,
    }).expect(200);
    await get(`/tickets/${owned.id}/history`, 'manager').expect(404);
    expect(
      (await get(`/tickets/${owned.id}/history`, 'thirdManager')).body.cycles[1]
        .ownership.manager!.id,
    ).toBe(users.manager.id);
  });

  it('rejects inactive manager assignment and organizational management assignment', async () => {
    await deactivate('otherManager').expect(200);
    await patch(`/tickets/${intake.id}/manager`, 'manager', {
      assignedManagerId: users.otherManager.id,
    }).expect(400);
    await post(
      `/organization/teams/${teamA.id}/manager/${users.otherManager.id}`,
      'admin',
      {},
    ).expect(400);
  });

  it('requires explicit legacy routing recovery and does not allow discretionary intake reopening', async () => {
    await resolveOwned();
    await post(`/tickets/${owned.id}/reopen`, 'employee', {
      reason: 'Again',
      returnToIntake: true,
    }).expect(400);
    await db.ticket.update({
      where: { id: owned.id },
      data: { assignedTeamId: null },
    });
    await post(`/tickets/${owned.id}/reopen`, 'employee', {
      reason: 'Again',
    }).expect(409);
    await post(`/tickets/${owned.id}/reopen`, 'employee', {
      reason: 'Again',
      returnToIntake: true,
    }).expect(201);
    expect(
      await db.ticket.findUniqueOrThrow({ where: { id: owned.id } }),
    ).toMatchObject({
      status: 'NEW',
      assignedManagerId: null,
      assignedTeamId: null,
      assignedAgentId: null,
    });
  });

  it('rejects reassignment waiting behind a terminal transition and its cycle snapshot', async () => {
    let release!: () => void, ready!: () => void;
    const locked = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const now = new Date();
    const resolution = db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${owned.id} FOR UPDATE`;
        ready();
        await hold;
        await tx.ticketWorkCycle.updateMany({
          where: { ticketId: owned.id },
          data: {
            outcome: 'RESOLVED',
            endedAt: now,
            endingManagerId: users.manager.id,
            endingTeamId: teamA.id,
            endingAgentId: users.agent.id,
            ownershipSnapshotBasis: 'END_OF_WORK',
            ownershipCapturedAt: now,
          },
        });
        await tx.ticket.update({
          where: { id: owned.id },
          data: { status: 'RESOLVED', resolvedAt: now },
        });
      },
      { timeout: 15000 },
    );
    await locked;
    const assignment = patch(`/tickets/${owned.id}/assignment`, 'manager', {
      agentId: users.member.id,
    }).then((response) => response);
    try {
      await waitForBlocked(1);
    } finally {
      release();
      await resolution;
    }
    expect((await assignment).status).toBe(409);
    expect(
      (await db.ticket.findUniqueOrThrow({ where: { id: owned.id } }))
        .assignedAgentId,
    ).toBe(users.agent.id);
    expect(
      (
        await db.ticketWorkCycle.findFirstOrThrow({
          where: { ticketId: owned.id },
        })
      ).endingAgentId,
    ).toBe(users.agent.id);
  });

  it('handles resolution versus cancellation without an impossible mixed outcome', async () => {
    const responses = await Promise.all([
      patch(`/tickets/${owned.id}/status`, 'agent', {
        status: 'RESOLVED',
      }).then((response) => response),
      post(`/tickets/${owned.id}/cancel`, 'employee', {}).then(
        (response) => response,
      ),
    ]);
    expect(responses[0].status).toBe(200);
    expect(responses[1].status).toBe(409);
    expect(
      (await db.ticket.findUniqueOrThrow({ where: { id: owned.id } })).status,
    ).toBe('RESOLVED');
    expect(
      (
        await db.ticketWorkCycle.findFirstOrThrow({
          where: { ticketId: owned.id },
        })
      ).outcome,
    ).toBe('RESOLVED');
  });

  it('serializes reopening against historical-manager deactivation', async () => {
    await resolveOwned(true);
    const responses = await Promise.all([
      post(`/tickets/${owned.id}/reopen`, 'employee', {
        reason: 'Recurrence',
      }).then((response) => response),
      deactivate('manager').then((response) => response),
    ]);
    expect([201, 409]).toContain(responses[0].status);
    expect([200, 409]).toContain(responses[1].status);
    if (responses[1].status === 409) await deactivate('manager').expect(200);
    if (responses[0].status === 409)
      await post(`/tickets/${owned.id}/reopen`, 'employee', {
        reason: 'Recurrence',
      }).expect(201);
    expect(
      await db.ticket.findUniqueOrThrow({ where: { id: owned.id } }),
    ).toMatchObject({
      status: 'NEW',
      assignedManagerId: null,
      assignedTeamId: null,
      assignedAgentId: null,
    });
    expect(
      await db.ticketWorkCycle.count({ where: { ticketId: owned.id } }),
    ).toBe(2);
    expect(
      (
        await db.ticketWorkCycle.findFirstOrThrow({
          where: { ticketId: owned.id, sequenceNumber: 1 },
        })
      ).endingManagerId,
    ).toBe(users.manager.id);
  });
});
