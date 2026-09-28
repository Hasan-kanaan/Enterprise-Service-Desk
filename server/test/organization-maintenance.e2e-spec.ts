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
  Subtask,
} from '../generated/prisma/client';

describe('Organization maintenance (focused PostgreSQL and HTTP)', () => {
  let app: INestApplication<import('node:http').Server>;
  let db: PrismaService;
  let users: Record<string, User>;
  let teamA: Team, teamB: Team, teamC: Team;
  let owned: Ticket;
  let subtask: Subtask;
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

  it('renames all four stable IDs, including archived records; validates and reports conflicts', async () => {
    const specialty = await db.specialty.create({
      data: { name: `specialty-${randomUUID()}` },
    });
    try {
      for (const [catalog, id] of [
        ['regions', regionId],
        ['departments', departmentId],
        ['specialties', specialty.id],
        ['teams', teamA.id],
      ] as const) {
        const name = `renamed-${randomUUID()}`;
        const result = await patch(`/organization/${catalog}/${id}`, 'admin', {
          name: `  ${name}  `,
        }).expect(200);
        expect(result.body).toMatchObject({ id, name, archivedAt: null });
        await patch(`/organization/${catalog}/${id}`, 'admin', {
          name: '   ',
        }).expect(400);
        await patch(`/organization/${catalog}/${id}`, 'admin', {
          name: 'x'.repeat(catalog === 'teams' ? 151 : 101),
        }).expect(400);
        await patch(`/organization/${catalog}/2147483647`, 'admin', {
          name,
        }).expect(404);
      }
      await patch(`/organization/teams/${teamA.id}`, 'admin', {
        name: teamC.name,
      }).expect(409);
      await archive('departments', departmentId).expect(201);
      await patch(`/organization/departments/${departmentId}`, 'superAdmin', {
        name: `archived-name-${randomUUID()}`,
      }).expect(200);
      expect(
        (await db.user.findUniqueOrThrow({ where: { id: users.employee.id } }))
          .departmentId,
      ).toBe(departmentId);
      expect(
        (await db.ticket.findUniqueOrThrow({ where: { id: owned.id } }))
          .assignedTeamId,
      ).toBe(teamA.id);
    } finally {
      await db.specialty.delete({ where: { id: specialty.id } });
    }
  });

  it('archives/reactivates catalogs without deleting references and excludes new scope choices', async () => {
    const specialty = await db.specialty.create({
      data: {
        name: `specialty-${randomUUID()}`,
        users: { create: { userId: users.agent.id } },
        teams: { create: { teamId: teamA.id } },
      },
    });
    await db.ticketRegion.create({ data: { ticketId: owned.id, regionId } });
    await db.ticketDepartment.create({
      data: { ticketId: owned.id, departmentId },
    });
    await db.ticket.update({
      where: { id: owned.id },
      data: { allRegions: false, allDepartments: false },
    });
    try {
      const blocked = await archive('regions', regionId).expect(409);
      expect(blocked.body).toMatchObject({
        message: "Archive the region's active teams first.",
      });
      await archive('teams', teamA.id).expect(201);
      await archive('teams', teamC.id).expect(201);
      for (const [catalog, id] of [
        ['regions', regionId],
        ['departments', departmentId],
        ['specialties', specialty.id],
      ] as const) {
        await archive(catalog, id).expect(201);
        const again = await archive(catalog, id).expect(201);
        expect(again.body).toMatchObject({
          id,
          archivedAt: expect.any(String) as unknown,
        });
      }
      expect(
        await db.userSpecialty.count({ where: { specialtyId: specialty.id } }),
      ).toBe(1);
      expect(
        await db.teamSpecialty.count({ where: { specialtyId: specialty.id } }),
      ).toBe(1);
      expect(
        await db.ticketRegion.count({
          where: { ticketId: owned.id, regionId },
        }),
      ).toBe(1);
      expect(
        await db.ticketDepartment.count({
          where: { ticketId: owned.id, departmentId },
        }),
      ).toBe(1);
      expect(
        (await db.user.findUniqueOrThrow({ where: { id: users.employee.id } }))
          .regionId,
      ).toBe(regionId);
      const options = (await get('/ticket-options', 'employee').expect(200))
        .body;
      expect(options.regions.some((r) => r.id === regionId)).toBe(false);
      expect(options.departments.some((d) => d.id === departmentId)).toBe(
        false,
      );
      await post('/organization/teams', 'admin', {
        name: `new-${randomUUID()}`,
        scope: 'REGION',
        regionId,
      }).expect(409);
      await reactivate('teams', teamA.id).expect(409);
      const payload = {
        title: 'New',
        description: 'New ticket',
        categoryId,
        affectedRegionIds: [regionId],
        affectedDepartmentIds: [departmentId],
      };
      await post('/tickets', 'employee', payload).expect(404);
      await patch(`/tickets/${owned.id}`, 'employee', {
        title: 'Retain scope',
        affectedRegionIds: [regionId],
        affectedDepartmentIds: [departmentId],
      }).expect(200);
      const visible = (
        await get(`/tickets/${owned.id}`, 'employee').expect(200)
      ).body;
      expect(visible).toMatchObject({
        affectedRegionIds: [regionId],
        affectedDepartmentIds: [departmentId],
      });
      await reactivate('regions', regionId).expect(201);
      expect(
        (await db.team.findUniqueOrThrow({ where: { id: teamA.id } }))
          .archivedAt,
      ).not.toBeNull();
      await post('/tickets', 'employee', payload).expect(404); // Department still archived.
      await reactivate('departments', departmentId).expect(201);
      await reactivate('specialties', specialty.id).expect(201);
      await post('/tickets', 'employee', payload).expect(201);
      const restored = (await get('/ticket-options', 'employee')).body;
      expect(restored.regions.some((r) => r.id === regionId)).toBe(true);
      expect(restored.departments.some((d) => d.id === departmentId)).toBe(
        true,
      );
    } finally {
      await db.specialty.delete({ where: { id: specialty.id } });
    }
  });

  it('offboards only current actionable responsibility, preserves historical facts and does not restore responsibility', async () => {
    const original = await db.ticketWorkCycle.findFirstOrThrow({
      where: { ticketId: owned.id },
    });
    await db.ticketWorkCycle.update({
      where: { id: original.id },
      data: {
        outcome: 'RESOLVED',
        endedAt: new Date(),
        endingTeamId: teamA.id,
        endingManagerId: users.manager.id,
        endingAgentId: users.agent.id,
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
    const historical = await db.subtask.create({
      data: {
        ticketId: owned.id,
        createdInCycleId: original.id,
        title: 'Old unfinished',
        description: 'Work',
        assignedTeamId: teamA.id,
        assignedAgentId: users.agent.id,
      },
    });
    const actionable = await db.subtask.create({
      data: {
        ticketId: owned.id,
        createdInCycleId: current.id,
        title: 'Current',
        description: 'Work',
        assignedTeamId: teamA.id,
        assignedAgentId: users.agent.id,
      },
    });
    const completed = await db.subtask.create({
      data: {
        ticketId: owned.id,
        createdInCycleId: current.id,
        title: 'Completed',
        description: 'Work',
        status: 'COMPLETED',
        assignedTeamId: teamA.id,
        assignedAgentId: users.agent.id,
        completedById: users.agent.id,
        completedAt: new Date(),
      },
    });
    const terminal = await db.ticket.create({
      data: {
        title: 'Secret historical ticket',
        description: 'Private',
        requesterId: users.employee.id,
        categoryId,
        status: 'CLOSED',
        assignedManagerId: users.manager.id,
        assignedTeamId: teamA.id,
        assignedAgentId: users.agent.id,
      },
    });
    const snapshot = await db.ticketWorkCycle.findUniqueOrThrow({
      where: { id: original.id },
    });
    const archived = await archive('teams', teamA.id).expect(201);
    expect(Object.keys(archived.body as object).sort()).toEqual([
      'archivedAt',
      'id',
      'name',
    ]);
    expect(
      await db.ticket.findUniqueOrThrow({ where: { id: owned.id } }),
    ).toMatchObject({
      status: 'IN_PROGRESS',
      assignedManagerId: users.manager.id,
      assignedTeamId: null,
      assignedAgentId: null,
    });
    expect(
      await db.subtask.findUniqueOrThrow({ where: { id: actionable.id } }),
    ).toMatchObject({ assignedTeamId: null, assignedAgentId: null });
    expect(
      await db.subtask.findUniqueOrThrow({ where: { id: historical.id } }),
    ).toEqual(historical);
    expect(
      await db.subtask.findUniqueOrThrow({ where: { id: completed.id } }),
    ).toEqual(completed);
    expect(
      await db.ticket.findUniqueOrThrow({ where: { id: terminal.id } }),
    ).toEqual(terminal);
    expect(
      await db.ticketWorkCycle.findUniqueOrThrow({
        where: { id: original.id },
      }),
    ).toEqual(snapshot);
    expect(await db.teamMember.count({ where: { teamId: teamA.id } })).toBe(3);
    expect(await db.teamManager.count({ where: { teamId: teamA.id } })).toBe(0);
    expect(
      (await db.team.findUniqueOrThrow({ where: { id: teamA.id } })).teamLeadId,
    ).toBeNull();
    const choices = (
      await get(`/ticket-workspace/tickets/${owned.id}`, 'manager')
    ).body;
    expect(choices.teams.some((t) => t.id === teamA.id)).toBe(false);
    expect(choices.subtaskTeams.some((t) => t.id === teamA.id)).toBe(false);
    await patch(`/tickets/${owned.id}/assignment`, 'manager', {
      teamId: teamA.id,
      agentId: null,
    }).expect(409);
    await post(`/tickets/${owned.id}/subtasks`, 'manager', {
      title: 'No',
      description: 'Work',
      assignedTeamId: teamA.id,
    }).expect(409);
    await patch(`/tickets/subtasks/${actionable.id}`, 'manager', {
      assignedTeamId: teamA.id,
    }).expect(409);
    await patch(`/tickets/subtasks/${completed.id}`, 'manager', {
      status: 'TODO',
    }).expect(409);
    expect(
      (
        await get(
          `/ticket-workspace/tickets/${owned.id}/people?purpose=subtask&teamId=${teamA.id}&search=agent`,
          'manager',
        )
      ).body,
    ).toEqual([]);
    await get(
      `/organization/teams/${teamA.id}/people?purpose=lead&search=lead`,
      'admin',
    ).expect(409);
    await post(
      `/organization/teams/${teamA.id}/lead/${users.lead.id}`,
      'admin',
      {},
    ).expect(409);
    await post(
      `/organization/teams/${teamA.id}/manager/${users.manager.id}`,
      'admin',
      {},
    ).expect(409);
    await post(
      `/organization/teams/${teamA.id}/members/${users.otherAgent.id}`,
      'admin',
      {},
    ).expect(409);
    await get(`/tickets/${owned.id}`, 'admin').expect(403);
    await get(`/tickets/${owned.id}`, 'lead').expect(404);
    await reactivate('teams', teamA.id).expect(201);
    expect(
      (await db.team.findUniqueOrThrow({ where: { id: teamA.id } })).teamLeadId,
    ).toBeNull();
    expect(await db.teamManager.count({ where: { teamId: teamA.id } })).toBe(0);
    expect(
      (await db.ticket.findUniqueOrThrow({ where: { id: owned.id } }))
        .assignedTeamId,
    ).toBeNull();
    expect(
      (await db.subtask.findUniqueOrThrow({ where: { id: actionable.id } }))
        .assignedTeamId,
    ).toBeNull();
  });

  it('does not revive archived historical routing on reopen and restores only future GLOBAL eligibility', async () => {
    const cycle = await db.ticketWorkCycle.findFirstOrThrow({
      where: { ticketId: owned.id },
    });
    await db.ticketWorkCycle.update({
      where: { id: cycle.id },
      data: {
        outcome: 'RESOLVED',
        endedAt: new Date(),
        endingTeamId: teamA.id,
      },
    });
    await db.ticket.update({
      where: { id: owned.id },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    });
    await archive('teams', teamA.id).expect(201);
    await post(`/tickets/${owned.id}/reopen`, 'employee', {
      reason: 'Try again',
    }).expect(409);
    await post(`/tickets/${owned.id}/reopen`, 'employee', {
      reason: 'Try again',
      returnToIntake: true,
    }).expect(201);
    expect(
      await db.ticket.findUniqueOrThrow({ where: { id: owned.id } }),
    ).toMatchObject({
      status: 'NEW',
      assignedTeamId: null,
      assignedAgentId: null,
      assignedManagerId: null,
    });
    expect(
      (await db.ticketWorkCycle.findUniqueOrThrow({ where: { id: cycle.id } }))
        .endingTeamId,
    ).toBe(teamA.id);
    await db.ticket.update({
      where: { id: owned.id },
      data: { assignedManagerId: users.manager.id },
    });
    await archive('teams', teamB.id).expect(201);
    const archived = (await get('/organization/teams', 'admin')).body.find(
      (t) => t.id === teamB.id,
    );
    expect(archived?.archivedAt).not.toBeNull();
    expect(
      (
        await get(`/ticket-workspace/tickets/${owned.id}`, 'manager')
      ).body.teams.some((t) => t.id === teamB.id),
    ).toBe(false);
    expect((await get('/ticket-workspace', 'otherLead')).body).toEqual({
      ledTeams: [],
    });
    await patch(`/tickets/${owned.id}/assignment`, 'manager', {
      teamId: teamB.id,
    }).expect(409);
    await reactivate('teams', teamB.id).expect(201);
    expect(
      (
        await get(`/ticket-workspace/tickets/${owned.id}`, 'manager')
      ).body.teams.some((t) => t.id === teamB.id),
    ).toBe(true);
    await patch(`/tickets/${owned.id}/assignment`, 'manager', {
      teamId: teamB.id,
      agentId: users.otherAgent.id,
    }).expect(200);
  });

  it('returns invalid manager ownership safely to NEW intake', async () => {
    await db.ticket.update({
      where: { id: owned.id },
      data: { assignedManagerId: null },
    });
    await archive('teams', teamA.id).expect(201);
    expect(
      await db.ticket.findUniqueOrThrow({ where: { id: owned.id } }),
    ).toMatchObject({
      status: 'NEW',
      assignedManagerId: null,
      assignedTeamId: null,
      assignedAgentId: null,
    });
  });

  it('guards every maintenance endpoint and rejects inactive actors and stale sessions', async () => {
    for (const catalog of ['regions', 'departments', 'specialties', 'teams']) {
      for (const role of ['employee', 'agent', 'manager']) {
        await patch(`/organization/${catalog}/${regionId}`, role, {
          name: 'Forbidden',
        }).expect(403);
        await archive(catalog, regionId, role).expect(403);
        await post(
          `/organization/${catalog}/${regionId}/reactivate`,
          role,
          {},
        ).expect(403);
      }
      await request(app.getHttpServer())
        .post(`/organization/${catalog}/${regionId}/archive`)
        .expect(401);
      await archive(catalog, 2147483647).expect(404);
      await reactivate(catalog, 2147483647).expect(404);
    }
    await db.user.update({
      where: { id: users.admin.id },
      data: { status: 'INACTIVE' },
    });
    await archive('teams', teamA.id).expect(401);
    await db.user.update({
      where: { id: users.admin.id },
      data: { status: 'ACTIVE', sessionVersion: { increment: 1 } },
    });
    await archive('teams', teamA.id).expect(401);
  });

  it('rolls back archive and all offboarding on a failure', async () => {
    const service = app.get(OrganizationService);
    const spy = jest.spyOn(
      service as unknown as {
        offboardTeam: (...args: unknown[]) => Promise<void>;
      },
      'offboardTeam',
    );
    spy.mockImplementationOnce(async (tx: unknown) => {
      const transaction =
        tx as import('../generated/prisma/client').Prisma.TransactionClient;
      await transaction.ticket.update({
        where: { id: owned.id },
        data: { assignedTeamId: null, assignedAgentId: null },
      });
      throw new Error('Injected offboarding failure');
    });
    try {
      await archive('teams', teamA.id).expect(500);
    } finally {
      spy.mockRestore();
    }
    expect(
      (await db.team.findUniqueOrThrow({ where: { id: teamA.id } })).archivedAt,
    ).toBeNull();
    expect(
      (await db.ticket.findUniqueOrThrow({ where: { id: owned.id } }))
        .assignedTeamId,
    ).toBe(teamA.id);
    expect(await db.teamManager.count({ where: { teamId: teamA.id } })).toBe(1);
  });

  it('serializes Team archival against new primary responsibility without partial offboarding', async () => {
    const results = await Promise.all([
      archive('teams', teamB.id),
      patch(`/tickets/${owned.id}/assignment`, 'manager', {
        teamId: teamB.id,
        agentId: users.otherAgent.id,
      }),
    ]);
    expect([201, 409]).toContain(results[0].status);
    expect([200, 409]).toContain(results[1].status);
    expect(results.some((r) => r.status < 300)).toBe(true);
    const team = await db.team.findUniqueOrThrow({ where: { id: teamB.id } });
    if (team.archivedAt) {
      expect(
        await db.ticket.count({
          where: {
            assignedTeamId: teamB.id,
            status: {
              in: [
                'NEW',
                'ASSIGNED',
                'IN_PROGRESS',
                'WAITING_FOR_EMPLOYEE',
                'BLOCKED',
              ],
            },
          },
        }),
      ).toBe(0);
      expect(
        (await db.subtask.findUniqueOrThrow({ where: { id: subtask.id } }))
          .assignedTeamId,
      ).toBeNull();
      const choices = (
        await get(`/ticket-workspace/tickets/${owned.id}`, 'manager')
      ).body;
      expect(choices.teams.some((t) => t.id === teamB.id)).toBe(false);
      await reactivate('teams', teamB.id).expect(201);
      expect(
        (
          await get(`/ticket-workspace/tickets/${owned.id}`, 'manager')
        ).body.teams.some((t) => t.id === teamB.id),
      ).toBe(true);
    }
  });

  it('preserves every terminal status and clears every operational status', async () => {
    const records: Ticket[] = [];
    for (const status of [
      'NEW',
      'ASSIGNED',
      'IN_PROGRESS',
      'WAITING_FOR_EMPLOYEE',
      'BLOCKED',
      'RESOLVED',
      'CLOSED',
      'CANCELLED',
    ] as const) {
      records.push(
        await db.ticket.create({
          data: {
            title: status,
            description: 'Private',
            categoryId,
            requesterId: users.employee.id,
            status,
            assignedTeamId: teamA.id,
            assignedAgentId: users.agent.id,
            assignedManagerId: users.manager.id,
          },
        }),
      );
    }
    await archive('teams', teamA.id, 'superAdmin').expect(201);
    for (const before of records) {
      const after = await db.ticket.findUniqueOrThrow({
        where: { id: before.id },
      });
      if (['RESOLVED', 'CLOSED', 'CANCELLED'].includes(before.status))
        expect(after).toEqual(before);
      else
        expect(after).toMatchObject({
          status: before.status,
          assignedManagerId: users.manager.id,
          assignedTeamId: null,
          assignedAgentId: null,
        });
    }
  });

  it('serializes Region archival against regional Team creation', async () => {
    await archive('teams', teamA.id).expect(201);
    await archive('teams', teamC.id).expect(201);
    const name = `racing-${randomUUID()}`;
    try {
      const results = await Promise.all([
        archive('regions', regionId),
        post('/organization/teams', 'superAdmin', {
          name,
          scope: 'REGION',
          regionId,
        }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      const region = await db.region.findUniqueOrThrow({
        where: { id: regionId },
      });
      if (region.archivedAt)
        expect(
          await db.team.count({ where: { regionId, archivedAt: null } }),
        ).toBe(0);
    } finally {
      await db.team.deleteMany({ where: { name } });
    }
  });
});
