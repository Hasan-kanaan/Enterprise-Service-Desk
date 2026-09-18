import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
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
  let app: INestApplication;
  let db: PrismaService;
  let users: Record<string, User>;
  let teamA: Team, teamB: Team;
  let owned: Ticket, intake: Ticket;
  let subtask: Subtask;
  let categoryId: number, regionId: number, departmentId: number;
  const jwt = new JwtService({ secret: jwtConstants.secret });
  const token = (name: string) =>
    jwt.sign({ sub: users[name].id, role: users[name].role });
  const get = (path: string, name: string) =>
    request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${token(name)}`);
  const patch = (path: string, name: string, body: object) =>
    request(app.getHttpServer())
      .patch(path)
      .set('Authorization', `Bearer ${token(name)}`)
      .send(body);
  const post = (path: string, name: string, body: object) =>
    request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${token(name)}`)
      .send(body);

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
    // Another manager manages BOTH teams, but does not own the ticket.
    await db.teamManager.createMany({
      data: [teamA, teamB].map((team) => ({
        teamId: team.id,
        managerId: users.otherManager.id,
      })),
    });
    categoryId = (
      await db.ticketCategory.create({ data: { name: `category-${prefix}` } })
    ).id;
    owned = await db.ticket.create({
      data: {
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
        title: 'Intake',
        description: 'Unowned',
        requesterId: users.employee.id,
        categoryId,
      },
    });
    subtask = await db.subtask.create({
      data: {
        ticketId: owned.id,
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
    await db.ticket.deleteMany({ where: { requesterId: { in: ids } } });
    await db.team.deleteMany({ where: { id: { in: [teamA.id, teamB.id] } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.ticketCategory.delete({ where: { id: categoryId } });
    await db.region.delete({ where: { id: regionId } });
    await db.department.delete({ where: { id: departmentId } });
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
      otherAgent: [],
      otherLead: [],
    };
    for (const [name, ids] of Object.entries(expected)) {
      const response = await get('/tickets', name).expect(200);
      expect(response.body.map((row: { id: number }) => row.id).sort()).toEqual(
        ids.sort(),
      );
    }
    await get(`/tickets/${owned.id}`, 'otherManager').expect(404);
    await get(`/tickets/${owned.id}`, 'otherAgent').expect(404);
    // Scope, home organization, TeamManager and ordinary membership grant nothing.
    await db.ticket.update({
      where: { id: intake.id },
      data: { status: TicketStatus.ASSIGNED },
    });
    expect((await get('/tickets', 'otherManager').expect(200)).body).toEqual(
      [],
    );
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
        (await get('/tickets/subtasks', name).expect(200)).body.map(
          (row: { id: number }) => row.id,
        ),
      ).toEqual([subtask.id]);
    }
    for (const name of ['agent', 'lead', 'member', 'otherManager']) {
      await get(`/tickets/subtasks/${subtask.id}`, name).expect(404);
      expect(
        (await get(`/tickets/${owned.id}/subtasks`, name).expect(200)).body,
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

  async function waitForBlocked(count: number) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const rows = await db.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*) FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'
        AND query LIKE 'SELECT id FROM "Ticket"%'
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
});
