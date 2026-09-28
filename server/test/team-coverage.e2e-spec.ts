import { OrganizationService } from '../src/organization/organization.service';
import { MailProvider } from '../src/auth/mail.provider';
import { FakeMailProvider } from './fake-mail.provider';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureTestSecurity } from './security-test-app';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from './http-test';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { jwtConstants } from '../src/auth/auth.constants';
import {
  TicketStatus,
  UserRole,
  User,
  Team,
  Ticket,
} from '../generated/prisma/client';

describe('Team coverage (focused PostgreSQL and HTTP)', () => {
  let app: INestApplication<import('node:http').Server>;
  let db: PrismaService;
  let users: Record<string, User>;
  let teamA: Team, teamB: Team, teamC: Team;
  let owned: Ticket;
  let categoryId: number, regionId: number, departmentId: number;
  const sessionIds: Record<string, string> = {};
  const jwt = new JwtService({ secret: jwtConstants.secret });
  const token = (name: string) =>
    jwt.sign({
      sub: users[name].id,
      sid: sessionIds[name],
      sessionVersion: users[name].sessionVersion,
    });
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
      .send(
        path === '/tickets' ? { clientRequestId: randomUUID(), ...body } : body,
      );

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailProvider)
      .useValue(new FakeMailProvider())
      .compile();
    app = module.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });
    configureTestSecurity(app as NestExpressApplication);
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
      sessionIds[name] = randomUUID();
      users[name] = await db.user.create({
        data: {
          sessions: { create: { id: sessionIds[name] } },
          username: `${name}-${prefix}`,
          email: `${name}-${prefix}@test.invalid`,
          password: 'unused-test-hash',
          activatedAt: new Date(),
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
    await db.subtask.create({
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
    await db.accountActionToken.deleteMany({
      where: { userId: { in: Object.values(users).map((user) => user.id) } },
    });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.ticketCategory.delete({ where: { id: categoryId } });
    await db.region.delete({ where: { id: regionId } });
    await db.department.delete({ where: { id: departmentId } });
  });

  const archive = (catalog: string, id: number, name = 'admin') =>
    post(`/organization/${catalog}/${id}/archive`, name, {});
  const reactivate = (catalog: string, id: number) =>
    post(`/organization/${catalog}/${id}/reactivate`, 'superAdmin', {});

  const coverage = (id: number, body: object, actor = 'admin') =>
    patch(`/organization/teams/${id}/coverage`, actor, body);

  it('validates coverage shape, missing destinations and active target even for archived Teams', async () => {
    for (const body of [
      {},
      { scope: 'INVALID' },
      { scope: 'REGION' },
      { scope: 'REGION', regionId: null },
      { scope: 'REGION', regionId: 0 },
      { scope: 'REGION', regionId: -1 },
      { scope: 'REGION', regionId: 1.5 },
      { scope: 'REGION', regionId: 2147483648 },
      { scope: 'REGION', regionId: '1' },
      { scope: 'GLOBAL', regionId },
    ])
      await coverage(teamA.id, body).expect(400);
    await coverage(2147483647, { scope: 'GLOBAL' }).expect(404);
    await coverage(teamA.id, { scope: 'REGION', regionId: 2147483647 }).expect(
      404,
    );
    await archive('teams', teamA.id).expect(201);
    await archive('teams', teamC.id).expect(201);
    await archive('regions', regionId).expect(201);
    await coverage(teamB.id, { scope: 'REGION', regionId }).expect(409);
    await coverage(teamA.id, { scope: 'REGION', regionId }).expect(409);
    const archived = await db.team.findUniqueOrThrow({
      where: { id: teamA.id },
    });
    await coverage(
      teamA.id,
      { scope: 'GLOBAL', regionId: null },
      'superAdmin',
    ).expect(200);
    expect(
      await db.team.findUniqueOrThrow({ where: { id: teamA.id } }),
    ).toEqual({
      ...archived,
      scope: 'GLOBAL',
      regionId: null,
      updatedAt: expect.any(Date) as unknown,
    });
    await reactivate('regions', regionId).expect(201);
    await coverage(teamA.id, { scope: 'REGION', regionId }).expect(200);
    expect(
      (await db.team.findUniqueOrThrow({ where: { id: teamA.id } })).archivedAt,
    ).toEqual(archived.archivedAt);
  });

  it('guards roles, inactive actors, revoked sessions and stale versions authoritatively', async () => {
    for (const actor of ['employee', 'agent', 'manager'])
      await coverage(teamA.id, { scope: 'GLOBAL' }, actor).expect(403);
    await request(app.getHttpServer())
      .patch(`/organization/teams/${teamA.id}/coverage`)
      .send({ scope: 'GLOBAL' })
      .expect(401);
    await db.user.update({
      where: { id: users.admin.id },
      data: { status: 'INACTIVE' },
    });
    await coverage(teamA.id, { scope: 'GLOBAL' }).expect(401);
    const service = app.get(OrganizationService);
    await expect(
      service.changeTeamCoverage(
        teamA.id,
        { scope: 'GLOBAL' },
        { ...users.admin, sessionVersion: 0, sid: sessionIds.admin },
      ),
    ).rejects.toMatchObject({ status: 401 });
    await db.user.update({
      where: { id: users.admin.id },
      data: { status: 'ACTIVE', sessionVersion: { increment: 1 } },
    });
    await coverage(teamA.id, { scope: 'GLOBAL' }).expect(401);
    await expect(
      service.changeTeamCoverage(
        teamA.id,
        { scope: 'GLOBAL' },
        { ...users.admin, sid: sessionIds.admin },
      ),
    ).rejects.toMatchObject({ status: 401 });
    await db.userSession.update({
      where: { id: sessionIds.superAdmin },
      data: { revokedAt: new Date() },
    });
    await coverage(teamA.id, { scope: 'GLOBAL' }, 'superAdmin').expect(401);
    await expect(
      service.changeTeamCoverage(
        teamA.id,
        { scope: 'GLOBAL' },
        { ...users.superAdmin, sid: sessionIds.superAdmin },
      ),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('preserves stable identity, all relationships, current and terminal work through every transition', async () => {
    const region = await db.region.create({ data: { name: randomUUID() } });
    const specialty = await db.specialty.create({
      data: { name: randomUUID() },
    });
    try {
      await db.teamSpecialty.create({
        data: { teamId: teamA.id, specialtyId: specialty.id },
      });
      for (const status of ['RESOLVED', 'CLOSED', 'CANCELLED'] as const)
        await db.ticket.create({
          data: {
            title: status,
            description: 'History',
            requesterId: users.employee.id,
            categoryId,
            status,
            assignedTeamId: teamA.id,
            assignedAgentId: users.agent.id,
            assignedManagerId: users.manager.id,
          },
        });
      const old = await db.ticketWorkCycle.findFirstOrThrow({
        where: { ticketId: owned.id },
      });
      await db.ticketWorkCycle.update({
        where: { id: old.id },
        data: {
          endedAt: new Date(),
          outcome: 'RESOLVED',
          endingTeamId: teamA.id,
          endingAgentId: users.agent.id,
          endingManagerId: users.manager.id,
        },
      });
      const current = await db.ticketWorkCycle.create({
        data: {
          ticketId: owned.id,
          sequenceNumber: 2,
          type: 'REOPENED',
          startedAt: new Date(),
        },
      });
      for (const status of [
        'TODO',
        'IN_PROGRESS',
        'COMPLETED',
        'CANCELLED',
      ] as const)
        await db.subtask.create({
          data: {
            ticketId: owned.id,
            createdInCycleId: current.id,
            title: status,
            description: 'Work',
            status,
            assignedTeamId: teamA.id,
            assignedAgentId: users.agent.id,
          },
        });
      const snapshot = async () => ({
        tickets: await db.ticket.findMany({
          where: { requesterId: users.employee.id },
          orderBy: { id: 'asc' },
        }),
        subtasks: await db.subtask.findMany({
          where: { ticketId: owned.id },
          orderBy: { id: 'asc' },
        }),
        cycles: await db.ticketWorkCycle.findMany({
          where: { ticketId: owned.id },
          orderBy: { id: 'asc' },
        }),
        team: await db.team.findUniqueOrThrow({
          where: { id: teamA.id },
          include: { members: true, managers: true, specialties: true },
        }),
        notifications: await db.notification.findMany({
          where: { recipientUserId: users.agent.id },
        }),
      });
      const before = await snapshot();
      for (const body of [
        { scope: 'REGION', regionId: region.id },
        { scope: 'GLOBAL' },
        { scope: 'REGION', regionId },
      ]) {
        const result = await coverage(teamA.id, body).expect(200);
        expect(Object.keys(result.body as object).sort()).toEqual([
          'archivedAt',
          'id',
          'name',
          'regionId',
          'scope',
        ]);
        const after = await snapshot();
        expect(after).toEqual({
          ...before,
          team: {
            ...before.team,
            updatedAt: expect.any(Date) as unknown,
            scope: body.scope,
            regionId: body.regionId ?? null,
          },
        });
      }
      await get(`/tickets/${owned.id}`, 'admin').expect(403);
      await get(`/tickets/${owned.id}`, 'superAdmin').expect(403);
    } finally {
      await db.team.update({
        where: { id: teamA.id },
        data: { scope: 'REGION', regionId },
      });
      await db.specialty.delete({ where: { id: specialty.id } });
      await db.region.delete({ where: { id: region.id } });
    }
  });

  it('returns 409 for each destination name collision without changing coverage', async () => {
    const region = await db.region.create({ data: { name: randomUUID() } });
    try {
      await db.team.update({
        where: { id: teamC.id },
        data: { regionId: region.id, name: teamA.name },
      });
      await coverage(teamC.id, { scope: 'REGION', regionId }).expect(409);
      await db.team.update({
        where: { id: teamB.id },
        data: { name: teamA.name },
      });
      await coverage(teamA.id, { scope: 'GLOBAL' }).expect(409);
      await coverage(teamB.id, { scope: 'REGION', regionId }).expect(409);
      expect(
        (await db.team.findUniqueOrThrow({ where: { id: teamA.id } })).regionId,
      ).toBe(regionId);
    } finally {
      await db.team.update({
        where: { id: teamC.id },
        data: { name: teamC.name, regionId },
      });
      await db.region.delete({ where: { id: region.id } });
    }
  });

  it('updates existing routing choices dynamically and preserves previously valid ownership', async () => {
    const choices = async () =>
      (
        await get(`/ticket-workspace/tickets/${owned.id}`, 'manager')
      ).body.teams.map((t: { id: number }) => t.id);
    expect(await choices()).not.toContain(teamC.id);
    await coverage(teamC.id, { scope: 'GLOBAL' }).expect(200);
    expect(await choices()).toContain(teamC.id);
    await patch(`/tickets/${owned.id}/assignment`, 'manager', {
      teamId: teamB.id,
      agentId: users.otherAgent.id,
    }).expect(200);
    const before = await db.ticket.findUniqueOrThrow({
      where: { id: owned.id },
    });
    await coverage(teamB.id, { scope: 'REGION', regionId }).expect(200);
    expect(await choices()).not.toContain(teamB.id);
    expect(
      await db.ticket.findUniqueOrThrow({ where: { id: owned.id } }),
    ).toEqual(before);
    await patch(`/tickets/${owned.id}/assignment`, 'manager', {
      teamId: teamB.id,
      agentId: users.otherAgent.id,
    }).expect(403);
    await db.ticket.update({
      where: { id: owned.id },
      data: { assignedManagerId: users.otherManager.id },
    });
    expect(
      (
        await get(`/ticket-workspace/tickets/${owned.id}`, 'otherManager')
      ).body.teams.some((t: { id: number }) => t.id === teamB.id),
    ).toBe(true);
    await patch(`/tickets/${owned.id}/assignment`, 'otherManager', {
      teamId: teamB.id,
      agentId: users.otherAgent.id,
    }).expect(200);
  });

  it('serializes Region archival with moves and updates which Region is blocked', async () => {
    await coverage(teamA.id, { scope: 'GLOBAL' }).expect(200);
    await coverage(teamC.id, { scope: 'GLOBAL' }).expect(200);
    const results = await Promise.all([
      archive('regions', regionId),
      coverage(teamB.id, { scope: 'REGION', regionId }, 'superAdmin'),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(
      expect.arrayContaining([409]),
    );
    expect(results.some((r) => r.status < 300)).toBe(true);
    for (const r of results) expect([200, 201, 409]).toContain(r.status);
    const region = await db.region.findUniqueOrThrow({
      where: { id: regionId },
    });
    if (region.archivedAt)
      expect(
        await db.team.count({ where: { regionId, archivedAt: null } }),
      ).toBe(0);
    else await archive('regions', regionId).expect(409);
  });

  it('serializes coverage narrowing against assignment without repairing earlier valid writes', async () => {
    const results = await Promise.all([
      coverage(teamB.id, { scope: 'REGION', regionId }),
      patch(`/tickets/${owned.id}/assignment`, 'manager', {
        teamId: teamB.id,
        agentId: users.otherAgent.id,
      }),
    ]);
    expect([200, 409]).toContain(results[0].status);
    expect([200, 403, 409]).toContain(results[1].status);
    expect(results.some((r) => r.status === 200)).toBe(true);
    if (results[1].status === 200)
      expect(
        (await db.ticket.findUniqueOrThrow({ where: { id: owned.id } }))
          .assignedTeamId,
      ).toBe(teamB.id);
    if (results[0].status === 200)
      await patch(`/tickets/${owned.id}/assignment`, 'manager', {
        teamId: teamB.id,
        agentId: users.otherAgent.id,
      }).expect(403);
  });
});
