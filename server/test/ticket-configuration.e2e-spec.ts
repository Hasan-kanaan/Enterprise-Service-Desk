import { TicketConfigurationService } from '../src/organization/ticket-configuration.service';
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

describe('Service desk configuration (focused PostgreSQL and HTTP)', () => {
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

  const del = (path: string, name = 'admin') =>
    request(app.getHttpServer())
      .delete(path)
      .set('Authorization', `Bearer ${token(name)}`);
  const config = (kind: string, id: number, action: string) =>
    post(`/ticket-configuration/${kind}/${id}/${action}`, 'admin', {});
  const remove = () =>
    del(`/organization/teams/${teamA.id}/members/${users.agent.id}`);
  const createTicket = (extra: object = {}) =>
    post('/tickets', 'employee', {
      title: 'New issue',
      description: '',
      categoryId,
      allRegions: true,
      allDepartments: true,
      affectedRegionIds: [],
      affectedDepartmentIds: [],
      ...extra,
    });

  it.each(['categories', 'tags'])(
    'manages %s with stable IDs, reserved names, validation and safe projections',
    async (kind) => {
      const name = `config-${randomUUID()}`;
      const created = await post(`/ticket-configuration/${kind}`, 'admin', {
        name: ` ${name} `,
      }).expect(201);
      const id = (created.body as { id: number }).id;
      try {
        expect(created.body).toEqual({ id, name, archivedAt: null });
        await config(kind, id, 'archive').expect(201);
        await post(`/ticket-configuration/${kind}`, 'superAdmin', {
          name,
        }).expect(409);
        await patch(`/ticket-configuration/${kind}/${id}`, 'superAdmin', {
          name: `${name}-renamed`,
        }).expect(200);
        const list = await get(`/ticket-configuration/${kind}`, 'admin').expect(
          200,
        );
        const row = (
          list.body as { id: number; name: string; archivedAt: string | null }[]
        ).find((item) => item.id === id)!;
        expect(row.name).toBe(`${name}-renamed`);
        expect(row.archivedAt).toBeTruthy();
        expect(Object.keys(row).sort()).toEqual(['archivedAt', 'id', 'name']);
        await config(kind, id, 'reactivate').expect(201);
        await patch(`/ticket-configuration/${kind}/${id}`, 'admin', {
          name: ' ',
        }).expect(400);
        await patch(`/ticket-configuration/${kind}/${id}`, 'admin', {
          name: 'x'.repeat(101),
        }).expect(400);
        await patch(`/ticket-configuration/${kind}/2147483647`, 'admin', {
          name,
        }).expect(404);
        await del(`/ticket-configuration/${kind}/${id}`).expect(404);
        for (const role of ['employee', 'manager', 'agent']) {
          await get(`/ticket-configuration/${kind}`, role).expect(403);
          await post(`/ticket-configuration/${kind}`, role, { name }).expect(
            403,
          );
          await patch(`/ticket-configuration/${kind}/${id}`, role, {
            name,
          }).expect(403);
          await post(
            `/ticket-configuration/${kind}/${id}/archive`,
            role,
            {},
          ).expect(403);
          await post(
            `/ticket-configuration/${kind}/${id}/reactivate`,
            role,
            {},
          ).expect(403);
        }
        await request(app.getHttpServer())
          .get(`/ticket-configuration/${kind}`)
          .expect(401);
      } finally {
        if (kind === 'categories')
          await db.ticketCategory.delete({ where: { id } });
        else await db.ticketTag.delete({ where: { id } });
      }
    },
  );

  it('preserves archived references, rejects new use and duplicates, and restores choices', async () => {
    const tag = await db.ticketTag.create({ data: { name: randomUUID() } });
    const other = await db.ticketTag.create({ data: { name: randomUUID() } });
    try {
      await db.ticket.update({
        where: { id: owned.id },
        data: {
          aiSuggestedCategoryId: categoryId,
          tags: { create: { tagId: tag.id } },
          aiSuggestedTags: { create: { tagId: tag.id } },
        },
      });
      const before = await db.ticket.findUniqueOrThrow({
        where: { id: owned.id },
        include: { tags: true, aiSuggestedTags: true },
      });
      await config('categories', categoryId, 'archive').expect(201);
      await config('tags', tag.id, 'archive').expect(201);
      await config('tags', other.id, 'archive').expect(201);
      expect(
        await db.ticket.findUniqueOrThrow({
          where: { id: owned.id },
          include: { tags: true, aiSuggestedTags: true },
        }),
      ).toEqual(before);
      const options = (await get('/ticket-options', 'employee').expect(200))
        .body;
      expect(options.categories.some((item) => item.id === categoryId)).toBe(
        false,
      );
      expect(options.tags.some((item) => item.id === tag.id)).toBe(false);
      await createTicket().expect(409);
      await patch(`/tickets/${owned.id}`, 'manager', {
        title: 'Retained',
        categoryId,
        tagIds: [tag.id],
      }).expect(200);
      const detail = (await get(`/tickets/${owned.id}`, 'manager').expect(200))
        .body;
      expect(detail.category.id).toBe(categoryId);
      expect(detail.tags).toEqual([{ id: tag.id, name: tag.name }]);
      await patch(`/tickets/${owned.id}`, 'manager', {
        tagIds: [tag.id, other.id],
      }).expect(404);
      await patch(`/tickets/${owned.id}`, 'manager', {
        tagIds: [tag.id, tag.id],
      }).expect(400);
      await patch(`/tickets/${owned.id}`, 'manager', { tagIds: [] }).expect(
        200,
      );
      await patch(`/tickets/${owned.id}`, 'manager', {
        tagIds: [tag.id],
      }).expect(404);
      await config('categories', categoryId, 'reactivate').expect(201);
      await createTicket({ tagIds: [tag.id] }).expect(404);
      await createTicket({ tagIds: [tag.id, tag.id] }).expect(400);
      await config('tags', tag.id, 'reactivate').expect(201);
      await createTicket({ tagIds: [tag.id] }).expect(201);
      const active = (await get('/ticket-options', 'employee')).body;
      expect(active.categories.some((item) => item.id === categoryId)).toBe(
        true,
      );
      expect(active.tags.some((item) => item.id === tag.id)).toBe(true);
    } finally {
      await db.ticketTagOnTicket.deleteMany({
        where: { tagId: { in: [tag.id, other.id] } },
      });
      await db.ticketSuggestedTag.deleteMany({ where: { tagId: tag.id } });
      await db.ticketTag.deleteMany({
        where: { id: { in: [tag.id, other.id] } },
      });
    }
  });

  it('manages specialty links without authority or work changes and preserves links across lifecycle changes', async () => {
    const specialty = await db.specialty.create({
      data: { name: randomUUID() },
    });
    const agentPath = `/organization/agents/${users.agent.id}/specialties/${specialty.id}`;
    const teamPath = `/organization/teams/${teamA.id}/specialties/${specialty.id}`;
    const before = await db.ticket.findUnique({ where: { id: owned.id } });
    try {
      for (const path of [agentPath, teamPath]) {
        for (const role of ['employee', 'agent', 'manager']) {
          await post(path, role, {}).expect(403);
          await del(path, role).expect(403);
        }
        await post(path, 'admin', {}).expect(201);
        await post(path, 'superAdmin', {}).expect(409);
        await del(path).expect(200);
        await del(path).expect(404);
        await post(path, 'superAdmin', {}).expect(201);
      }
      expect(await db.ticket.findUnique({ where: { id: owned.id } })).toEqual(
        before,
      );
      expect(
        await db.teamMember.count({
          where: { teamId: teamA.id, userId: users.agent.id },
        }),
      ).toBe(1);
      await post(
        `/organization/agents/${users.employee.id}/specialties/${specialty.id}`,
        'admin',
        {},
      ).expect(400);
      await post(
        `/organization/agents/2147483647/specialties/${specialty.id}`,
        'admin',
        {},
      ).expect(404);
      await db.user.update({
        where: { id: users.member.id },
        data: { activatedAt: null },
      });
      await post(
        `/organization/agents/${users.member.id}/specialties/${specialty.id}`,
        'admin',
        {},
      ).expect(409);
      await patch(`/users/${users.agent.id}/status`, 'admin', {
        status: 'INACTIVE',
      }).expect(200);
      expect(
        (
          await get(
            `/organization/agents/${users.agent.id}/specialties`,
            'admin',
          )
        ).body,
      ).toHaveLength(1);
      await post(agentPath, 'admin', {}).expect(409);
      await post(`/organization/teams/${teamA.id}/archive`, 'admin', {}).expect(
        201,
      );
      expect(
        await db.teamSpecialty.count({ where: { teamId: teamA.id } }),
      ).toBe(1);
      await del(teamPath).expect(200);
      await post(teamPath, 'admin', {}).expect(409);
      await post(
        `/organization/specialties/${specialty.id}/archive`,
        'admin',
        {},
      ).expect(201);
      await post(
        `/organization/teams/${teamB.id}/specialties/${specialty.id}`,
        'admin',
        {},
      ).expect(409);
      await post(
        `/organization/agents/${users.otherAgent.id}/specialties/${specialty.id}`,
        'admin',
        {},
      ).expect(409);
      await del(agentPath).expect(200);
      await get(`/tickets/${owned.id}`, 'admin').expect(404);
      const ownRequests = await get('/tickets', 'superAdmin').expect(200);
      expect(ownRequests.body.items).toEqual([]);
    } finally {
      await db.specialty.delete({ where: { id: specialty.id } });
    }
  });

  it('clears only current operational Agent assignments and preserves terminal/historical evidence', async () => {
    await db.subtask.update({
      where: { id: subtask.id },
      data: { assignedTeamId: teamA.id, assignedAgentId: users.agent.id },
    });
    const completed = await db.subtask.create({
      data: {
        ticketId: owned.id,
        createdInCycleId: subtask.createdInCycleId,
        title: 'Done',
        description: '',
        status: 'COMPLETED',
        assignedTeamId: teamA.id,
        assignedAgentId: users.agent.id,
        completedById: users.agent.id,
        completedAt: new Date(),
      },
    });
    const cancelled = await db.subtask.create({
      data: {
        ticketId: owned.id,
        createdInCycleId: subtask.createdInCycleId,
        title: 'Cancelled',
        description: '',
        status: 'CANCELLED',
        assignedTeamId: teamA.id,
        assignedAgentId: users.agent.id,
      },
    });
    await db.ticketWorkCycle.update({
      where: { id: subtask.createdInCycleId },
      data: { sequenceNumber: 2, type: 'REOPENED' },
    });
    const old = await db.ticketWorkCycle.create({
      data: {
        ticketId: owned.id,
        sequenceNumber: 1,
        type: 'ORIGINAL',
        startedAt: new Date(),
        outcome: 'RESOLVED',
        endedAt: new Date(),
        endingAgentId: users.agent.id,
        endingTeamId: teamA.id,
      },
    });
    const historical = await db.subtask.create({
      data: {
        ticketId: owned.id,
        createdInCycleId: old.id,
        title: 'Old',
        description: '',
        assignedTeamId: teamA.id,
        assignedAgentId: users.agent.id,
      },
    });
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
    ] as const)
      records.push(
        await db.ticket.create({
          data: {
            title: status,
            description: '',
            requesterId: users.employee.id,
            categoryId,
            status,
            assignedManagerId: users.manager.id,
            assignedTeamId: teamA.id,
            assignedAgentId: users.agent.id,
          },
        }),
      );
    const response = await remove().expect(200);
    expect(response.body).toEqual({ message: 'Team member removed' });
    expect(
      await db.teamMember.count({
        where: { teamId: teamA.id, userId: users.agent.id },
      }),
    ).toBe(0);
    for (const ticket of [owned, ...records]) {
      const after = await db.ticket.findUniqueOrThrow({
        where: { id: ticket.id },
      });
      if (['RESOLVED', 'CLOSED', 'CANCELLED'].includes(ticket.status))
        expect(after).toEqual(ticket);
      else
        expect(after).toEqual({
          ...ticket,
          assignedAgentId: null,
          updatedAt: after.updatedAt,
        });
    }
    expect(
      await db.subtask.findUnique({ where: { id: subtask.id } }),
    ).toMatchObject({
      assignedTeamId: teamA.id,
      assignedAgentId: null,
      status: 'TODO',
    });
    for (const task of [completed, cancelled, historical])
      expect(await db.subtask.findUnique({ where: { id: task.id } })).toEqual(
        task,
      );
    expect(
      await db.ticketWorkCycle.findUnique({ where: { id: old.id } }),
    ).toEqual(old);
    for (const task of [completed, cancelled]) {
      await patch(`/tickets/subtasks/${task.id}`, 'manager', {
        status: 'TODO',
      }).expect(400);
      await patch(`/tickets/subtasks/${task.id}`, 'manager', {
        status: 'IN_PROGRESS',
        assignedAgentId: null,
      }).expect(200);
    }
    await remove().expect(404);
    await del(
      `/organization/teams/${teamA.id}/members/${users.lead.id}`,
    ).expect(400);
    await post(
      `/organization/teams/${teamA.id}/members/${users.lead.id}`,
      'admin',
      {},
    ).expect(409);
  });

  it('rolls back reconciliation and membership together on failure', async () => {
    const service = app.get<OrganizationService>(
      OrganizationService,
    ) as unknown as {
      reconcileMember: (
        tx: import('../generated/prisma/client').Prisma.TransactionClient,
        team: number,
        user: number,
      ) => Promise<void>;
    };
    const original = service.reconcileMember;
    const spy = jest
      .spyOn(service, 'reconcileMember')
      .mockImplementationOnce(async (...args) => {
        await original(...args);
        throw new Error('Injected reconciliation failure');
      });
    try {
      await remove().expect(500);
    } finally {
      spy.mockRestore();
    }
    expect(
      await db.teamMember.count({
        where: { teamId: teamA.id, userId: users.agent.id },
      }),
    ).toBe(1);
    expect(
      (await db.ticket.findUniqueOrThrow({ where: { id: owned.id } }))
        .assignedAgentId,
    ).toBe(users.agent.id);
  });

  it('serializes assignment and member removal without invalid committed assignment', async () => {
    await db.ticket.update({
      where: { id: owned.id },
      data: { assignedAgentId: null },
    });
    const results = await Promise.all([
      remove(),
      patch(`/tickets/${owned.id}/assignment`, 'manager', {
        teamId: teamA.id,
        agentId: users.agent.id,
      }),
    ]);
    expect([200, 409]).toContain(results[0].status);
    expect([200, 400, 409]).toContain(results[1].status);
    expect(results.some((result) => result.status === 200)).toBe(true);
    if (
      !(await db.teamMember.findUnique({
        where: { teamId_userId: { teamId: teamA.id, userId: users.agent.id } },
      }))
    )
      expect(
        (await db.ticket.findUniqueOrThrow({ where: { id: owned.id } }))
          .assignedAgentId,
      ).toBeNull();
  });
  it('rejects a changed destination category after archival and rechecks configuration actors', async () => {
    const destination = await db.ticketCategory.create({
      data: { name: randomUUID(), archivedAt: new Date() },
    });
    try {
      await patch(`/tickets/${owned.id}`, 'manager', {
        categoryId: destination.id,
      }).expect(409);
      await patch(`/tickets/${owned.id}`, 'manager', {
        description: 'Unrelated',
      }).expect(200);
      await db.userSession.update({
        where: { id: sessionIds.admin },
        data: { revokedAt: new Date() },
      });
      await config('categories', categoryId, 'archive').expect(401);
      await remove().expect(401);
      await post(
        `/organization/agents/${users.agent.id}/specialties/2147483647`,
        'admin',
        {},
      ).expect(401);
      const actor = {
        id: users.superAdmin.id,
        role: users.superAdmin.role,
        sessionVersion: users.superAdmin.sessionVersion,
      };
      await db.user.update({
        where: { id: actor.id },
        data: { status: 'INACTIVE' },
      });
      await expect(
        app
          .get<TicketConfigurationService>(TicketConfigurationService)
          .write('categories', categoryId, { archived: true }, actor),
      ).rejects.toMatchObject({ status: 401 });
      await expect(
        app
          .get<OrganizationService>(OrganizationService)
          .removeMember(teamA.id, users.agent.id, actor),
      ).rejects.toMatchObject({ status: 401 });
    } finally {
      await db.ticketCategory.delete({ where: { id: destination.id } });
    }
  });

  it('serializes current subtask assignment with removal, preserving other Team membership', async () => {
    await db.teamMember.create({
      data: { teamId: teamB.id, userId: users.agent.id },
    });
    const results = await Promise.all([
      remove(),
      patch(`/tickets/subtasks/${subtask.id}`, 'manager', {
        assignedTeamId: teamA.id,
        assignedAgentId: users.agent.id,
        status: 'IN_PROGRESS',
      }),
    ]);
    expect([200, 409]).toContain(results[0].status);
    expect([200, 400, 409]).toContain(results[1].status);
    if (
      !(await db.teamMember.findUnique({
        where: { teamId_userId: { teamId: teamA.id, userId: users.agent.id } },
      }))
    ) {
      const task = await db.subtask.findUniqueOrThrow({
        where: { id: subtask.id },
      });
      expect(
        task.assignedTeamId === teamA.id &&
          task.assignedAgentId === users.agent.id,
      ).toBe(false);
    }
    expect(
      await db.teamMember.count({
        where: { teamId: teamB.id, userId: users.agent.id },
      }),
    ).toBe(1);
  });
});
