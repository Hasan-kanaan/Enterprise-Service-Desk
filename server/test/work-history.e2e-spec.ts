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
import { User, UserRole } from '../generated/prisma/client';

describe('My Work History (PostgreSQL and HTTP)', () => {
  let app: INestApplication<import('node:http').Server>, db: PrismaService;
  let users: Record<string, User>,
    ticketId: number,
    cycleId: number,
    taskId: number,
    teamId: number,
    categoryId: number;
  const jwt = new JwtService({ secret: jwtConstants.secret });
  const token = (name: string) =>
    jwt.sign({
      sub: users[name].id,
      role: users[name].role,
      sessionVersion: users[name].sessionVersion,
    });
  const get = <P extends string>(path: P, who = 'agent') =>
    request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${token(who)}`);
  const patch = <P extends string>(path: P, who: string, body: object) =>
    request(app.getHttpServer())
      .patch(path)
      .set('Authorization', `Bearer ${token(who)}`)
      .send(body);
  const history = (who = 'agent', query = '') =>
    get(`/my-work-history${query}`, who);
  beforeAll(async () => {
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureTestSecurity(app as NestExpressApplication);
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
      agent: 'AGENT',
      member: 'AGENT',
      lead: 'AGENT',
      collaborator: 'AGENT',
      reassigned: 'AGENT',
      manager: 'MANAGER',
      otherManager: 'MANAGER',
      admin: 'ADMIN',
      superAdmin: 'SUPER_ADMIN',
    })) {
      users[name] = await db.user.create({
        data: {
          username: `${name}-${prefix}`.slice(0, 50),
          email: `${name}-${prefix}@test.invalid`,
          password: 'unused',
          role: role as UserRole,
        },
      });
    }
    const team = await db.team.create({
      data: {
        name: prefix,
        scope: 'GLOBAL',
        teamLeadId: users.lead.id,
        members: {
          create: ['agent', 'member', 'lead'].map((name) => ({
            userId: users[name].id,
          })),
        },
      },
    });
    const category = await db.ticketCategory.create({ data: { name: prefix } });
    teamId = team.id;
    categoryId = category.id;
    const ticket = await db.ticket.create({
      data: {
        title: 'Private current title',
        description: 'Secret description',
        requesterId: users.employee.id,
        categoryId: category.id,
        assignedTeamId: team.id,
        assignedManagerId: users.manager.id,
        assignedAgentId: users.agent.id,
        status: 'RESOLVED',
        workCycles: {
          create: {
            sequenceNumber: 1,
            type: 'ORIGINAL',
            startedAt: new Date('2026-01-01'),
            endedAt: new Date('2026-01-03'),
            outcome: 'RESOLVED',
            endedById: users.agent.id,
            endingManagerId: users.manager.id,
            endingAgentId: users.agent.id,
            ownershipSnapshotBasis: 'END_OF_WORK',
            resolutionSummary: 'Private summary',
          },
        },
      },
      include: { workCycles: true },
    });
    ticketId = ticket.id;
    cycleId = ticket.workCycles[0].id;
    taskId = (
      await db.subtask.create({
        data: {
          ticketId,
          createdInCycleId: cycleId,
          title: 'Completed VPN check',
          description: 'Secret task body',
          status: 'COMPLETED',
          assignedAgentId: users.reassigned.id,
          completedById: users.collaborator.id,
          completedAt: new Date('2026-01-02'),
        },
      })
    ).id;
    await db.subtask.create({
      data: {
        ticketId,
        createdInCycleId: cycleId,
        title: 'Unrelated task',
        description: 'Private',
        assignedAgentId: users.reassigned.id,
      },
    });
    await db.ticketMessage.create({
      data: {
        ticketId,
        createdInCycleId: cycleId,
        authorId: users.employee.id,
        content: 'Secret conversation',
        clientRequestId: randomUUID(),
        creationHash: 'a'.repeat(64),
      },
    });
    await db.ticketInternalNote.create({
      data: {
        ticketId,
        createdInCycleId: cycleId,
        authorId: users.agent.id,
        content: 'Secret note',
        clientRequestId: randomUUID(),
        creationHash: 'b'.repeat(64),
      },
    });
  });
  afterEach(async () => {
    const ids = Object.values(users).map((user) => user.id);
    await db.notification.deleteMany({
      where: { recipientUserId: { in: ids } },
    });
    await db.ticketMessage.deleteMany({ where: { ticketId } });
    await db.ticketInternalNote.deleteMany({ where: { ticketId } });
    await db.subtask.deleteMany({ where: { ticketId } });
    await db.ticket.delete({ where: { id: ticketId } });
    await db.team.delete({ where: { id: teamId } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.ticketCategory.delete({ where: { id: categoryId } });
  });
  it('deduplicates ending-agent and ender evidence and allows normal current access', async () => {
    const { body } = await history().expect(200);
    expect(body).toMatchObject({ page: 1, pageSize: 25, hasMore: false });
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      kind: 'CYCLE',
      id: cycleId,
      ticketId,
      contributions: ['PRIMARY_AGENT', 'ENDED_WORK'],
      canOpenTicket: true,
    });
    await get(`/tickets/${ticketId}`).expect(200);
  });
  it('retains completed collaborator work without restoring parent, communication or attachment access', async () => {
    const before = await db.notification.count();
    const { body } = await history('collaborator').expect(200);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      kind: 'SUBTASK',
      id: taskId,
      subtaskTitle: 'Completed VPN check',
      subtaskStatus: 'COMPLETED',
      contributions: ['COMPLETED_SUBTASK'],
      canOpenTicket: false,
    });
    expect(Object.keys(body.items[0]).sort()).toEqual(
      [
        'kind',
        'id',
        'ticketId',
        'cycleId',
        'sequenceNumber',
        'cycleType',
        'outcome',
        'activityAt',
        'contributions',
        'subtaskTitle',
        'subtaskStatus',
        'canOpenTicket',
      ].sort(),
    );
    expect(JSON.stringify(body)).not.toMatch(
      /Secret|Private|Unrelated|requester|assigned|attachment|message|note/i,
    );
    for (const suffix of [
      '',
      '/messages',
      '/internal-notes',
      '/attachments',
      '/history',
    ])
      await get(`/tickets/${ticketId}${suffix}`, 'collaborator').expect(404);
    expect(await db.notification.count()).toBe(before);
  });
  it.each(['member', 'lead', 'reassigned', 'otherManager'])(
    '%s relationship alone creates no history',
    async (who) => {
      expect((await history(who).expect(200)).body.items).toEqual([]);
    },
  );
  it('records responsible manager and attributed closure without duplicates', async () => {
    await db.ticketWorkCycle.update({
      where: { id: cycleId },
      data: {
        closedById: users.manager.id,
        closedAt: new Date('2026-01-04'),
        outcome: 'CLOSED',
      },
    });
    const { body } = await history('manager').expect(200);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      contributions: ['RESPONSIBLE_MANAGER', 'CLOSED_WORK'],
      outcome: 'CLOSED',
      activityAt: '2026-01-04T00:00:00.000Z',
    });
  });
  it('does not invent ending responsibility from migration snapshots or missing attribution', async () => {
    await db.ticketWorkCycle.update({
      where: { id: cycleId },
      data: {
        ownershipSnapshotBasis: 'RECORDED_AT_MIGRATION',
        endedById: null,
      },
    });
    expect((await history().expect(200)).body.items).toEqual([]);
    expect((await history('manager').expect(200)).body.items).toEqual([]);
    await db.subtask.update({
      where: { id: taskId },
      data: { completedById: null },
    });
    expect((await history('collaborator').expect(200)).body.items).toEqual([]);
  });
  it('uses ending snapshots independently from lifecycle actors', async () => {
    await db.ticketWorkCycle.update({
      where: { id: cycleId },
      data: { endedById: users.otherManager.id },
    });
    expect((await history().expect(200)).body.items[0].contributions).toEqual([
      'PRIMARY_AGENT',
    ]);
    expect(
      (await history('otherManager').expect(200)).body.items[0].contributions,
    ).toEqual(['ENDED_WORK']);
    expect(
      (await history('manager').expect(200)).body.items[0].contributions,
    ).toEqual(['RESPONSIBLE_MANAGER']);
  });
  it('includes completed tasks in an ongoing cycle but no unended cycle or unfinished task', async () => {
    await db.ticketWorkCycle.update({
      where: { id: cycleId },
      data: {
        endedAt: null,
        outcome: null,
        endedById: null,
        endingAgentId: null,
        endingManagerId: null,
        ownershipSnapshotBasis: null,
      },
    });
    await db.ticket.update({
      where: { id: ticketId },
      data: { status: 'IN_PROGRESS' },
    });
    expect(
      (await history('collaborator').expect(200)).body.items[0],
    ).toMatchObject({ id: taskId, outcome: null, canOpenTicket: false });
    expect((await history().expect(200)).body.items).toEqual([]);
    await db.subtask.update({
      where: { id: taskId },
      data: { status: 'IN_PROGRESS', completedById: null, completedAt: null },
    });
    expect((await history('collaborator').expect(200)).body.items).toEqual([]);
  });
  it.each(['employee', 'admin', 'superAdmin'])(
    'rejects role %s',
    async (who) => {
      await history(who).expect(403);
    },
  );
  it('requires authentication and refuses another-user selectors', async () => {
    await request(app.getHttpServer()).get('/my-work-history').expect(401);
    for (const who of ['agent', 'manager']) {
      await history(who, `?userId=${users.collaborator.id}`).expect(400);
      await get(`/my-work-history/${users.collaborator.id}`, who).expect(404);
    }
  });
  it('reopen preserves old history; later cancellation is a distinct attributed cycle', async () => {
    const original = await db.ticketWorkCycle.findUniqueOrThrow({
      where: { id: cycleId },
    });
    await request(app.getHttpServer())
      .post(`/tickets/${ticketId}/reopen`)
      .set('Authorization', `Bearer ${token('manager')}`)
      .send({ reason: 'Returned problem' })
      .expect(201);
    expect(
      await db.ticketWorkCycle.findUniqueOrThrow({ where: { id: cycleId } }),
    ).toEqual(original);
    expect((await history('manager').expect(200)).body.items).toHaveLength(1);
    // Cancellation remains the requester's existing NEW/ASSIGNED-only action.
    await db.ticket.update({
      where: { id: ticketId },
      data: { status: 'ASSIGNED' },
    });
    await request(app.getHttpServer())
      .post(`/tickets/${ticketId}/cancel`)
      .set('Authorization', `Bearer ${token('employee')}`)
      .expect(201);
    const { body } = await history('manager').expect(200);
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toMatchObject({
      sequenceNumber: 2,
      cycleType: 'REOPENED',
      outcome: 'CANCELLED',
      contributions: ['RESPONSIBLE_MANAGER', 'REOPENED_WORK'],
    });
    expect(body.items[1].id).toBe(cycleId);
  });
  it('resolution and closure through normal lifecycle retain exact attribution', async () => {
    await db.ticketWorkCycle.update({
      where: { id: cycleId },
      data: {
        endedAt: null,
        outcome: null,
        endedById: null,
        endingManagerId: null,
        endingAgentId: null,
        ownershipSnapshotBasis: null,
      },
    });
    await db.ticket.update({
      where: { id: ticketId },
      data: { status: 'IN_PROGRESS' },
    });
    await db.subtask.updateMany({
      where: { ticketId, status: 'TODO' },
      data: { status: 'CANCELLED' },
    });
    await patch(`/tickets/${ticketId}/status`, 'agent', {
      status: 'RESOLVED',
      resolutionSummary: 'Fixed',
    }).expect(200);
    await patch(`/tickets/${ticketId}/status`, 'manager', {
      status: 'CLOSED',
    }).expect(200);
    expect((await history().expect(200)).body.items[0]).toMatchObject({
      outcome: 'CLOSED',
      contributions: ['PRIMARY_AGENT', 'ENDED_WORK'],
    });
    expect(
      (await history('manager').expect(200)).body.items[0].contributions,
    ).toEqual(['RESPONSIBLE_MANAGER', 'CLOSED_WORK']);
  });
  it('loss of current responsibility keeps personal history without detail access', async () => {
    await db.ticket.update({
      where: { id: ticketId },
      data: { assignedAgentId: null, assignedManagerId: users.otherManager.id },
    });
    for (const who of ['agent', 'manager']) {
      expect((await history(who).expect(200)).body.items[0].canOpenTicket).toBe(
        false,
      );
      await get(`/tickets/${ticketId}`, who).expect(404);
    }
  });
  it.each(['agent', 'manager', 'collaborator'])(
    'offboarding %s retains history; reactivation restores no responsibilities',
    async (who) => {
      await request(app.getHttpServer())
        .post(`/tickets/${ticketId}/reopen`)
        .set('Authorization', `Bearer ${token('manager')}`)
        .send({ reason: 'Active work before offboarding' })
        .expect(201);
      const before = (await history(who).expect(200)).body.items.map(
        ({ canOpenTicket, ...row }) => {
          void canOpenTicket;
          return row;
        },
      );
      await patch(`/users/${users[who].id}/status`, 'admin', {
        status: 'INACTIVE',
      }).expect(200);
      await history(who).expect(401);
      await patch(`/users/${users[who].id}/status`, 'admin', {
        status: 'ACTIVE',
      }).expect(200);
      users[who] = await db.user.findUniqueOrThrow({
        where: { id: users[who].id },
      });
      const after = (await history(who).expect(200)).body.items;
      expect(
        after.map(({ canOpenTicket, ...row }) => {
          void canOpenTicket;
          return row;
        }),
      ).toEqual(before);
      // Offboarded manager's ticket returns to ordinary shared intake visibility.
      expect(
        after.every((row) => row.canOpenTicket === (who === 'manager')),
      ).toBe(true);
      const ticket = await db.ticket.findUniqueOrThrow({
        where: { id: ticketId },
      });
      if (who === 'agent') expect(ticket.assignedAgentId).toBeNull();
      if (who === 'manager') expect(ticket.assignedManagerId).toBeNull();
    },
  );
  it('paginates a large fixture deterministically in SQL and filters contributions and dates', async () => {
    await db.ticketWorkCycle.createMany({
      data: Array.from({ length: 260 }, (_, index) => ({
        ticketId,
        sequenceNumber: index + 2,
        type: 'REOPENED' as const,
        startedAt: new Date('2026-02-01'),
        endedAt: new Date('2026-02-02'),
        outcome: 'RESOLVED' as const,
        endedById: users.agent.id,
      })),
    });
    const ids: number[] = [];
    for (let page = 1; page <= 3; page++) {
      const { body } = await history(
        'agent',
        `?page=${page}&pageSize=100`,
      ).expect(200);
      expect(body.items.length).toBe(page === 3 ? 61 : 100);
      expect(body.hasMore).toBe(page !== 3);
      ids.push(...body.items.map((row) => row.id));
    }
    expect(new Set(ids).size).toBe(261);
    expect(ids).toEqual([...ids].sort((a, b) => b - a));
    expect(
      (
        await history('agent', '?contribution=PRIMARY_AGENT').expect(200)
      ).body.items.map((row) => row.id),
    ).toEqual([cycleId]);
    expect(
      (
        await history('agent', '?from=2026-01-01&to=2026-01-31').expect(200)
      ).body.items.map((row) => row.id),
    ).toEqual([cycleId]);
    expect(
      (
        await history('collaborator', '?contribution=COMPLETED_SUBTASK').expect(
          200,
        )
      ).body.items[0].id,
    ).toBe(taskId);
    expect(
      (await history('agent', '?page=100').expect(200)).body.items,
    ).toEqual([]);
  });
  it.each([
    '?page=0',
    '?page=1.5',
    '?pageSize=101',
    '?pageSize=0',
    '?pageSize=abc',
    '?contribution=OWNER',
    '?from=nonsense',
    '?from=2026-03-01&to=2026-01-01',
  ])('rejects invalid query %s', async (query) => {
    await history('agent', query).expect(400);
  });
});
