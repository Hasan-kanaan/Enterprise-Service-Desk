import { actionHash } from '../src/auth/account-security.service';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID, randomBytes } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MailProvider } from '../src/auth/mail.provider';
import { FakeMailProvider } from './fake-mail.provider';
import { jwtConstants } from '../src/auth/auth.constants';
import { configureTestSecurity } from './security-test-app';
import request from './http-test';
import { UserRole, User, Subtask, Team } from '../generated/prisma/client';

describe('Universal requester and identity lifecycle (PostgreSQL/HTTP)', () => {
  let app: NestExpressApplication;
  let db: PrismaService;
  let categoryId: number;
  const people: Record<string, User> = {};
  const sessions: Record<string, string> = {};
  const prefix = randomUUID().slice(0, 8);
  const jwt = new JwtService({ secret: jwtConstants.secret });
  const token = (name: string) =>
    jwt.sign({
      sub: people[name].id,
      sid: sessions[name],
      sessionVersion: people[name].sessionVersion,
    });
  const get = <P extends string>(path: P, name: string) =>
    request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${token(name)}`);
  const post = <P extends string>(path: P, name: string, body: object = {}) =>
    request(app.getHttpServer())
      .post(path)
      .set('X-Requested-With', 'service-desk')
      .set('Authorization', `Bearer ${token(name)}`)
      .send(body);
  const patch = <P extends string>(path: P, name: string, body: object) =>
    request(app.getHttpServer())
      .patch(path)
      .set('Authorization', `Bearer ${token(name)}`)
      .send(body);
  async function person(name: string, role: UserRole, extra: object = {}) {
    sessions[name] = randomUUID();
    people[name] = await db.user.create({
      data: {
        username: `${prefix}-${Object.keys(people).length}`,
        email: `${prefix}-${name}@test.invalid`,
        password: 'fixture',
        activatedAt: new Date(),
        role,
        sessions: { create: { id: sessions[name] } },
        ...extra,
      },
    });
    return people[name];
  }
  const cycle = async (id: number) =>
    (
      await db.ticketWorkCycle.findFirstOrThrow({
        where: { ticketId: id },
        orderBy: { sequenceNumber: 'desc' },
      })
    ).id;
  const create = (name: string) =>
    post('/tickets', name, {
      clientRequestId: randomUUID(),
      title: `Request ${prefix}`,
      description: 'Help',
      categoryId,
      allRegions: true,
      allDepartments: true,
      affectedRegionIds: [],
      affectedDepartmentIds: [],
    });
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailProvider)
      .useValue(new FakeMailProvider())
      .compile();
    app = module.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });
    configureTestSecurity(app);
    await app.init();
    db = app.get(PrismaService);
    categoryId = (await db.ticketCategory.create({ data: { name: prefix } }))
      .id;
    for (const role of Object.values(UserRole)) await person(role, role);
  });
  afterAll(async () => {
    if (db && categoryId) {
      const tickets = {
        ticketId: {
          in: (
            await db.ticket.findMany({
              where: { categoryId },
              select: { id: true },
            })
          ).map((t) => t.id),
        },
      };
      await db.notification.deleteMany({ where: tickets });
      await db.attachment.deleteMany({ where: tickets });
      await db.ticketMessage.deleteMany({ where: tickets });
      await db.ticketInternalNote.deleteMany({ where: tickets });
      await db.subtask.deleteMany({ where: tickets });
      await db.ticket.deleteMany({ where: { categoryId } });
      await db.team.deleteMany({ where: { name: { startsWith: prefix } } });
      await db.accountActionToken.deleteMany({
        where: { user: { email: { startsWith: prefix } } },
      });
      await db.user.deleteMany({ where: { email: { startsWith: prefix } } });
      await db.region.deleteMany({ where: { name: { startsWith: prefix } } });
      await db.specialty.deleteMany({
        where: { name: { startsWith: prefix } },
      });
      await db.ticketCategory.delete({ where: { id: categoryId } });
    }
    await app?.close();
  });

  it.each(Object.values(UserRole))(
    '%s creates, lists, edits, communicates and cancels own requests',
    async (role) => {
      const created = await create(role).expect(201);
      const id = created.body.id;
      expect(created.body).toMatchObject({
        requesterId: people[role].id,
        status: 'NEW',
        assignedManagerId: null,
        assignedTeamId: null,
        assignedAgentId: null,
      });
      await get('/ticket-options', role).expect(200);
      const list = await get('/tickets?queue=requests', role).expect(200);
      expect(
        list.body.items.every(
          (t: { requesterId: number }) => t.requesterId === people[role].id,
        ),
      ).toBe(true);
      await get(`/tickets/${id}`, role).expect(200);
      await get(`/tickets/${id}/history`, role).expect(200);
      await patch(`/tickets/${id}`, role, {
        title: 'Updated own request',
      }).expect(200);
      await post(`/tickets/${id}/messages`, role, {
        expectedCycleId: await cycle(id),
        content: 'Requester message',
        clientRequestId: randomUUID(),
      }).expect(201);
      if (role === 'AGENT') {
        const work = await get('/tickets?queue=mine', role).expect(200);
        expect(work.body.items.some((t: { id: number }) => t.id === id)).toBe(
          false,
        );
      }
      if (role === 'MANAGER') {
        const work = await get('/tickets?queue=mine', role).expect(200);
        expect(work.body.items.some((t: { id: number }) => t.id === id)).toBe(
          false,
        );
      }
      if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
        await get('/tickets?queue=intake', role).expect(403);
        await get(`/tickets/${id}/internal-notes`, role).expect(403);
        await get(`/tickets/${id}/subtasks`, role).expect(403);
        await patch(`/tickets/${id}/manager`, role, {
          assignedManagerId: people.MANAGER.id,
        }).expect(403);
      }
      await post(`/tickets/${id}/cancel`, role).expect(201);
    },
  );

  it.each(Object.values(UserRole))(
    '%s requester reply resumes waiting and receives support notifications',
    async (role) => {
      const id = (await create(role).expect(201)).body.id;
      await db.ticket.update({
        where: { id },
        data: {
          assignedManagerId: people.MANAGER.id,
          status: 'WAITING_FOR_EMPLOYEE',
        },
      });
      await post(`/tickets/${id}/messages`, role, {
        expectedCycleId: await cycle(id),
        content: 'Reply',
        clientRequestId: randomUUID(),
      }).expect(201);
      expect(
        (await db.ticket.findUniqueOrThrow({ where: { id } })).status,
      ).toBe('IN_PROGRESS');
      await post(`/tickets/${id}/messages`, 'MANAGER', {
        expectedCycleId: await cycle(id),
        content: 'Support reply',
        clientRequestId: randomUUID(),
      }).expect(201);
      if (role !== 'MANAGER')
        expect(
          await db.notification.count({
            where: {
              ticketId: id,
              recipientUserId: people[role].id,
              type: 'SUPPORT_MESSAGE',
            },
          }),
        ).toBe(1);
      await patch(`/tickets/${id}/status`, 'MANAGER', {
        status: 'RESOLVED',
        resolutionSummary: 'Fixed',
      }).expect(200);
      await patch(`/tickets/${id}/status`, role, { status: 'CLOSED' }).expect(
        200,
      );
      await post(`/tickets/${id}/reopen`, role, {
        reason: 'Still broken',
        returnToIntake: true,
      }).expect(201);
    },
  );

  it('administrators cannot read other requests; requester-only Agents cannot read internal notes or support context', async () => {
    const id = (await create('EMPLOYEE').expect(201)).body.id;
    for (const role of ['ADMIN', 'SUPER_ADMIN'])
      await get(`/tickets/${id}`, role).expect(404);
    const own = (await create('AGENT').expect(201)).body.id;
    await get(`/tickets/${own}/internal-notes`, 'AGENT').expect(404);
    await get(`/ticket-workspace/tickets/${own}`, 'AGENT').expect(404);
  });

  it('inactive requester is a support warning only', async () => {
    const requester = await person('inactive-requester', 'EMPLOYEE');
    const id = (await create('inactive-requester').expect(201)).body.id;
    await db.ticket.update({
      where: { id },
      data: {
        assignedManagerId: people.MANAGER.id,
        status: 'WAITING_FOR_EMPLOYEE',
      },
    });
    await patch(`/users/${requester.id}/status`, 'ADMIN', {
      status: 'INACTIVE',
    }).expect(200);
    const detail = await get(`/tickets/${id}`, 'MANAGER').expect(200);
    expect(detail.body).toMatchObject({
      requesterStatus: 'INACTIVE',
      status: 'WAITING_FOR_EMPLOYEE',
      requesterId: requester.id,
    });
  });

  it('requires trimmed metadata on provisioning; legacy values stay NULL and may be populated, never cleared', async () => {
    expect(people.EMPLOYEE.displayName).toBeNull();
    expect(people.EMPLOYEE.jobTitle).toBeNull();
    const input = {
      username: `${prefix}-new`,
      email: `${prefix}-new@test.invalid`,
      role: 'EMPLOYEE',
    };
    await post('/auth/accounts', 'ADMIN', input).expect(400);
    await post('/auth/accounts', 'ADMIN', {
      ...input,
      displayName: ' ',
      jobTitle: 'Job',
    }).expect(400);
    const result = await post('/auth/accounts', 'ADMIN', {
      ...input,
      displayName: ' New Person ',
      jobTitle: ' Analyst ',
    }).expect(201);
    expect(result.body.user).toMatchObject({
      displayName: 'New Person',
      jobTitle: 'Analyst',
    });
    const path = `/users/${people.EMPLOYEE.id}`;
    await patch(path, 'ADMIN', {
      displayName: ' Legacy Person ',
      jobTitle: 'Director',
    }).expect(200);
    for (const change of [
      { displayName: null },
      { jobTitle: '' },
      { email: 'new@test.invalid' },
      { role: 'AGENT' },
    ])
      await patch(path, 'ADMIN', change).expect(400);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: people.EMPLOYEE.id } }))
        .role,
    ).toBe('EMPLOYEE');
  });
  it.each(['ADMIN', 'SUPER_ADMIN'])(
    '%s enforces the full role transition matrix and stable identity',
    async (caller) => {
      for (const source of Object.values(UserRole))
        for (const destination of Object.values(UserRole)) {
          const name = `matrix-${caller}-${source}-${destination}`;
          const target = await person(name, source);
          const permitted =
            source !== 'SUPER_ADMIN' &&
            destination !== 'SUPER_ADMIN' &&
            (caller === 'SUPER_ADMIN' ||
              (source !== 'ADMIN' && destination !== 'ADMIN'));
          const response = await patch(`/users/${target.id}/role`, caller, {
            role: destination,
          });
          expect(response.status).toBe(
            destination === 'SUPER_ADMIN' ? 400 : permitted ? 200 : 403,
          );
          const current = await db.user.findUniqueOrThrow({
            where: { id: target.id },
          });
          expect(current).toMatchObject({
            id: target.id,
            email: target.email,
            username: target.username,
            role: permitted ? destination : source,
            sessionVersion: permitted && source !== destination ? 1 : 0,
          });
          expect(
            await db.userSession.count({
              where: { userId: target.id, revokedAt: null },
            }),
          ).toBe(permitted && source !== destination ? 0 : 1);
        }
    },
  );

  it.each(['ACTIVE', 'INACTIVE', 'PENDING'])(
    'invalidates all authorization for %s role changes without inventing responsibility',
    async (state) => {
      const name = `state-${state}`;
      const target = await person(name, 'EMPLOYEE', {
        status: state === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
        activatedAt: state === 'PENDING' ? null : new Date(),
        displayName: 'Real Name',
        jobTitle: 'Actual Job',
      });
      await db.refreshToken.create({
        data: {
          userId: target.id,
          sessionId: sessions[name],
          tokenHash: randomUUID(),
          expiresAt: new Date(Date.now() + 60000),
        },
      });
      await db.accountActionToken.create({
        data: {
          userId: target.id,
          type: 'ACCOUNT_ACTIVATION',
          tokenHash: randomUUID(),
          expiresAt: new Date(Date.now() + 60000),
        },
      });
      await patch(`/users/${target.id}/role`, 'ADMIN', {
        role: 'AGENT',
      }).expect(200);
      expect(
        await db.refreshToken.count({
          where: { userId: target.id, revokedAt: null },
        }),
      ).toBe(0);
      expect(
        await db.accountActionToken.count({
          where: { userId: target.id, revokedAt: null },
        }),
      ).toBe(0);
      expect(await db.teamMember.count({ where: { userId: target.id } })).toBe(
        0,
      );
      expect(
        await db.userSpecialty.count({ where: { userId: target.id } }),
      ).toBe(0);
      expect(
        await db.user.findUniqueOrThrow({ where: { id: target.id } }),
      ).toMatchObject({
        displayName: target.displayName,
        jobTitle: target.jobTitle,
        activatedAt: target.activatedAt,
        status: target.status,
        sessionVersion: 1,
      });
      await get('/ticket-options', name).expect(401);
    },
  );

  async function agentWork(name: string) {
    const agent = await person(name, 'AGENT');
    const team = await db.team.create({
      data: {
        name: `${prefix}-${name}`,
        scope: 'GLOBAL',
        teamLeadId: agent.id,
        members: { create: { userId: agent.id } },
      },
    });
    const specialty = await db.specialty.create({
      data: { name: `${prefix}-${name}` },
    });
    await db.userSpecialty.create({
      data: { userId: agent.id, specialtyId: specialty.id },
    });
    const ticket = (await create('EMPLOYEE').expect(201)).body;
    await db.ticket.update({
      where: { id: ticket.id },
      data: {
        assignedManagerId: people.MANAGER.id,
        assignedTeamId: team.id,
        assignedAgentId: agent.id,
        status: 'IN_PROGRESS',
      },
    });
    const cycleId = await cycle(ticket.id);
    const tasks: Subtask[] = [];
    for (const status of [
      'TODO',
      'IN_PROGRESS',
      'COMPLETED',
      'CANCELLED',
    ] as const)
      tasks.push(
        await db.subtask.create({
          data: {
            ticketId: ticket.id,
            createdInCycleId: cycleId,
            title: status,
            description: 'task',
            status,
            assignedTeamId: team.id,
            assignedAgentId: agent.id,
            ...(status === 'COMPLETED'
              ? { completedById: agent.id, completedAt: new Date() }
              : {}),
          },
        }),
      );
    const historical = (await create('EMPLOYEE').expect(201)).body;
    await db.ticket.update({
      where: { id: historical.id },
      data: {
        assignedManagerId: people.MANAGER.id,
        assignedTeamId: team.id,
        assignedAgentId: agent.id,
        status: 'IN_PROGRESS',
      },
    });
    const historicalTask = await db.subtask.create({
      data: {
        ticketId: historical.id,
        createdInCycleId: await cycle(historical.id),
        title: 'Historical completion',
        description: 'Completed',
        status: 'COMPLETED',
        assignedAgentId: agent.id,
        assignedTeamId: team.id,
        completedById: agent.id,
        completedAt: new Date(),
      },
    });
    await patch(`/tickets/${historical.id}/status`, 'MANAGER', {
      status: 'RESOLVED',
      resolutionSummary: 'Fixed',
    }).expect(200);
    return {
      agent,
      team,
      specialty,
      ticket,
      tasks,
      historical,
      historicalTask,
    };
  }

  it('leaving AGENT clears every current assignment, retains completion credit/specialties/history, and reopen clears a former Agent', async () => {
    const {
      agent,
      team,
      specialty,
      ticket,
      tasks,
      historical,
      historicalTask,
    } = await agentWork('leaving-agent');
    await patch(`/users/${agent.id}/role`, 'ADMIN', { role: 'MANAGER' }).expect(
      200,
    );
    expect(
      await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } }),
    ).toMatchObject({
      status: 'IN_PROGRESS',
      assignedManagerId: people.MANAGER.id,
      assignedTeamId: team.id,
      assignedAgentId: null,
    });
    for (const task of tasks)
      expect(
        await db.subtask.findUniqueOrThrow({ where: { id: task.id } }),
      ).toMatchObject({
        assignedAgentId: null,
        assignedTeamId: team.id,
        status: task.status,
        completedById: task.completedById,
        completedAt: task.completedAt,
      });
    expect(
      (await db.team.findUniqueOrThrow({ where: { id: team.id } })).teamLeadId,
    ).toBeNull();
    expect(await db.teamMember.count({ where: { userId: agent.id } })).toBe(0);
    expect(await db.userSpecialty.count({ where: { userId: agent.id } })).toBe(
      1,
    );
    expect(
      await db.subtask.findUniqueOrThrow({ where: { id: historicalTask.id } }),
    ).toEqual(historicalTask);
    await get(`/organization/agents/${agent.id}/specialties`, 'ADMIN').expect(
      200,
    );
    await post(
      `/organization/agents/${agent.id}/specialties/${specialty.id}`,
      'ADMIN',
    ).expect(400);
    await request(app.getHttpServer())
      .delete(`/organization/agents/${agent.id}/specialties/${specialty.id}`)
      .set('Authorization', `Bearer ${token('ADMIN')}`)
      .expect(200);
    expect(
      (await db.ticket.findUniqueOrThrow({ where: { id: historical.id } }))
        .assignedAgentId,
    ).toBe(agent.id);
    await post(`/tickets/${historical.id}/reopen`, 'EMPLOYEE', {
      reason: 'Again',
    }).expect(201);
    expect(
      await db.ticket.findUniqueOrThrow({ where: { id: historical.id } }),
    ).toMatchObject({ status: 'IN_PROGRESS', assignedAgentId: null });
    await patch(`/users/${agent.id}/role`, 'ADMIN', { role: 'AGENT' }).expect(
      200,
    );
    expect(await db.teamMember.count({ where: { userId: agent.id } })).toBe(0);
  });

  it('deactivation keeps Agent memberships and completed/cancelled links but permanently revokes unused action tokens', async () => {
    const { agent, team, tasks } = await agentWork('deactivated-agent');
    const oldToken = randomBytes(32).toString('base64url');
    const action = await db.accountActionToken.create({
      data: {
        userId: agent.id,
        type: 'PASSWORD_RESET',
        tokenHash: actionHash(oldToken),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    await patch(`/users/${agent.id}/status`, 'ADMIN', {
      status: 'INACTIVE',
    }).expect(200);
    expect(
      await db.teamMember.count({
        where: { userId: agent.id, teamId: team.id },
      }),
    ).toBe(1);
    for (const task of tasks)
      expect(
        (await db.subtask.findUniqueOrThrow({ where: { id: task.id } }))
          .assignedAgentId,
      ).toBe(['TODO', 'IN_PROGRESS'].includes(task.status) ? null : agent.id);
    const revoked = (
      await db.accountActionToken.findUniqueOrThrow({
        where: { id: action.id },
      })
    ).revokedAt;
    expect(revoked).not.toBeNull();
    await patch(`/users/${agent.id}/status`, 'ADMIN', {
      status: 'ACTIVE',
    }).expect(200);
    expect(
      (
        await db.accountActionToken.findUniqueOrThrow({
          where: { id: action.id },
        })
      ).revokedAt,
    ).toEqual(revoked);
    await post('/auth/reset-password', 'ADMIN', {
      token: oldToken,
      newPassword: 'NewSafePassword123!',
    }).expect(400);
  });

  it.each(['role', 'status'])(
    'Manager %s cleanup returns only active regional Team metadata and keeps terminal history',
    async (operation) => {
      const name = `manager-${operation}`;
      const manager = await person(name, 'MANAGER');
      const region = await db.region.create({
        data: { name: `${prefix}-${name}` },
      });
      const teams: Team[] = [];
      for (const [scope, archived] of [
        ['REGION', false],
        ['REGION', true],
        ['GLOBAL', false],
      ] as const)
        teams.push(
          await db.team.create({
            data: {
              name: `${prefix}-${name}-${scope}-${archived}`,
              scope,
              regionId: scope === 'REGION' ? region.id : null,
              archivedAt: archived ? new Date() : null,
              managers: { create: { managerId: manager.id } },
            },
          }),
        );
      const ticket = (await create('EMPLOYEE').expect(201)).body;
      const historical = (await create('EMPLOYEE').expect(201)).body;
      for (const id of [ticket.id, historical.id])
        await db.ticket.update({
          where: { id },
          data: {
            assignedManagerId: manager.id,
            assignedTeamId: teams[0].id,
            status: 'IN_PROGRESS',
          },
        });
      await patch(`/tickets/${historical.id}/status`, name, {
        status: 'RESOLVED',
        resolutionSummary: 'Fixed',
      }).expect(200);
      const before = await db.ticketWorkCycle.findMany({
        where: { ticketId: historical.id },
      });
      const response = await patch(
        `/users/${manager.id}/${operation}`,
        'ADMIN',
        operation === 'role' ? { role: 'EMPLOYEE' } : { status: 'INACTIVE' },
      ).expect(200);
      expect(response.body).toMatchObject({
        managerlessTeams: [{ id: teams[0].id, name: teams[0].name }],
      });
      expect(
        await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } }),
      ).toMatchObject({
        status: 'NEW',
        assignedManagerId: null,
        assignedTeamId: null,
        assignedAgentId: null,
      });
      expect(
        await db.teamManager.count({ where: { managerId: manager.id } }),
      ).toBe(0);
      expect(
        await db.ticketWorkCycle.findMany({
          where: { ticketId: historical.id },
        }),
      ).toEqual(before);
      expect(
        (await db.ticket.findUniqueOrThrow({ where: { id: historical.id } }))
          .assignedManagerId,
      ).toBe(manager.id);
      await post(`/tickets/${historical.id}/reopen`, 'EMPLOYEE', {
        reason: 'Again',
      }).expect(201);
      expect(
        await db.ticket.findUniqueOrThrow({ where: { id: historical.id } }),
      ).toMatchObject({
        status: 'NEW',
        assignedManagerId: null,
        assignedTeamId: null,
        assignedAgentId: null,
      });
    },
  );

  it.each(['assignment', 'team'])(
    'role transition racing %s leaves atomic compatible state or a reload conflict',
    async (operation) => {
      const { agent, team, ticket } = await agentWork(`race-${operation}`);
      const change = patch(`/users/${agent.id}/role`, 'ADMIN', {
        role: 'MANAGER',
      });
      const write =
        operation === 'assignment'
          ? patch(`/tickets/${ticket.id}/assignment`, 'MANAGER', {
              teamId: team.id,
              agentId: agent.id,
            })
          : post(`/organization/teams/${team.id}/members/${agent.id}`, 'ADMIN');
      const [changed, written] = await Promise.all([change, write]);
      expect([200, 409]).toContain(changed.status);
      expect([200, 201, 400, 409]).toContain(written.status);
      const current = await db.user.findUniqueOrThrow({
        where: { id: agent.id },
      });
      if (changed.status === 200) {
        expect(current).toMatchObject({ role: 'MANAGER', sessionVersion: 1 });
        expect(await db.teamMember.count({ where: { userId: agent.id } })).toBe(
          0,
        );
        expect(
          await db.subtask.count({
            where: { ticketId: ticket.id, assignedAgentId: agent.id },
          }),
        ).toBe(0);
        expect(
          (await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } }))
            .assignedAgentId,
        ).toBeNull();
      } else {
        expect(current).toMatchObject({ role: 'AGENT', sessionVersion: 0 });
        expect(await db.teamMember.count({ where: { userId: agent.id } })).toBe(
          1,
        );
        expect(
          await db.userSession.count({
            where: { userId: agent.id, revokedAt: null },
          }),
        ).toBe(1);
      }
    },
  );
  it('rolls back role, work, memberships and authorization together if the role update fails', async () => {
    const { agent, team, ticket, tasks } = await agentWork('rollback-role');
    const name = `role_failure_${agent.id}`;
    await db.$executeRawUnsafe(
      `CREATE FUNCTION "${name}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = ${agent.id} AND NEW.role = 'MANAGER' THEN RAISE EXCEPTION 'test role rollback'; END IF; RETURN NEW; END $$`,
    );
    await db.$executeRawUnsafe(
      `CREATE TRIGGER "${name}" BEFORE UPDATE ON "User" FOR EACH ROW EXECUTE FUNCTION "${name}"()`,
    );
    try {
      await patch(`/users/${agent.id}/role`, 'ADMIN', {
        role: 'MANAGER',
      }).expect(500);
      expect(
        await db.user.findUniqueOrThrow({ where: { id: agent.id } }),
      ).toEqual(agent);
      expect(
        (await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } }))
          .assignedAgentId,
      ).toBe(agent.id);
      expect(
        await db.subtask.findMany({
          where: { id: { in: tasks.map((task) => task.id) } },
          orderBy: { id: 'asc' },
        }),
      ).toEqual(tasks);
      expect(
        (await db.team.findUniqueOrThrow({ where: { id: team.id } }))
          .teamLeadId,
      ).toBe(agent.id);
      expect(await db.teamMember.count({ where: { userId: agent.id } })).toBe(
        1,
      );
      expect(
        await db.userSession.count({
          where: { userId: agent.id, revokedAt: null },
        }),
      ).toBe(1);
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER "${name}" ON "User"`);
      await db.$executeRawUnsafe(`DROP FUNCTION "${name}"()`);
    }
  });

  it('deactivation racing reset consumption cannot leave usable authorization on an inactive account', async () => {
    const target = await person('reset-race', 'EMPLOYEE');
    const raw = randomBytes(32).toString('base64url');
    const action = await db.accountActionToken.create({
      data: {
        userId: target.id,
        type: 'PASSWORD_RESET',
        tokenHash: actionHash(raw),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    const [deactivation, reset] = await Promise.all([
      patch(`/users/${target.id}/status`, 'ADMIN', { status: 'INACTIVE' }),
      post('/auth/reset-password', 'ADMIN', {
        token: raw,
        newPassword: 'AnotherPassword456!',
      }),
    ]);
    expect([200, 409]).toContain(deactivation.status);
    expect([201, 400, 409]).toContain(reset.status);
    const current = await db.user.findUniqueOrThrow({
      where: { id: target.id },
    });
    const link = await db.accountActionToken.findUniqueOrThrow({
      where: { id: action.id },
    });
    if (deactivation.status === 200) {
      expect(current.status).toBe('INACTIVE');
      expect(link.revokedAt || link.usedAt).not.toBeNull();
      expect(
        await db.userSession.count({
          where: { userId: target.id, revokedAt: null },
        }),
      ).toBe(0);
    } else expect(current.status).toBe('ACTIVE');
  });
});
