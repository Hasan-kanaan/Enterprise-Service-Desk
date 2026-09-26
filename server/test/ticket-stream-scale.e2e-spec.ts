import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { jwtConstants } from '../src/auth/auth.constants';
import { configureTestSecurity } from './security-test-app';
import { User, UserRole } from '../generated/prisma/client';
import { Client } from 'pg';

type RecordView = {
  id: number;
  createdInCycleId: number;
  content: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  attachments: { filename: string | null }[];
};
type Stream = {
  records: RecordView[];
  cycles: { id: number }[];
  hasMore: boolean;
  nextCursor: string | null;
};
type Cycle = {
  id: number;
  sequenceNumber: number;
  isCurrent: boolean;
  type: string;
  startReason: string;
  resolutionSummary: string;
  closeSource: string;
  subtasks: { id: number; completedBy: { id: number } }[];
  subtasksNextCursor: string | null;
  subtasksHasMore: boolean;
};
type History = {
  cycles: Cycle[];
  nextCursor: string | null;
  currentCycleId: number;
};
describe('Ticket stream scale (isolated PostgreSQL)', () => {
  let app: NestExpressApplication, db: PrismaService;
  const users: Record<string, User> = {};
  let ticketId: number, categoryId: number;
  let cycles: { id: number; sequenceNumber: number }[] = [];
  const prefix = `streams-${randomUUID()}`;
  const jwt = new JwtService({ secret: jwtConstants.secret });
  const get = (path: string, who = 'manager') =>
    request(app.getHttpServer())
      .get(path)
      .set(
        'Authorization',
        `Bearer ${jwt.sign({ sub: users[who].id, role: users[who].role })}`,
      );
  beforeAll(async () => {
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureTestSecurity(app);
    await app.init();
    db = app.get(PrismaService);
    for (const [name, role] of Object.entries({
      employee: 'EMPLOYEE',
      other: 'EMPLOYEE',
      manager: 'MANAGER',
      agent: 'AGENT',
      collaborator: 'AGENT',
      admin: 'ADMIN',
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
    categoryId = (await db.ticketCategory.create({ data: { name: prefix } }))
      .id;
    ticketId = (
      await db.ticket.create({
        data: {
          title: prefix,
          description: 'scale',
          requesterId: users.employee.id,
          categoryId,
          status: 'IN_PROGRESS',
          assignedManagerId: users.manager.id,
          assignedAgentId: users.agent.id,
        },
      })
    ).id;
    await db.ticketWorkCycle.createMany({
      data: Array.from({ length: 61 }, (_, i) => ({
        ticketId,
        sequenceNumber: i + 1,
        type: i ? ('REOPENED' as const) : ('ORIGINAL' as const),
        startedAt: new Date('2026-01-01'),
        startReason: i ? `Reopen ${i}` : null,
        outcome: i === 60 ? null : ('CLOSED' as const),
        endedAt: i === 60 ? null : new Date('2026-01-02'),
        closedAt: i === 60 ? null : new Date('2026-01-03'),
        closeSource: i === 60 ? null : ('AUTO_TIMEOUT' as const),
        resolutionSummary: i === 60 ? null : 'Retained resolution',
        endingManagerId: users.manager.id,
        endingAgentId: users.agent.id,
        ownershipSnapshotBasis: i === 60 ? null : ('END_OF_WORK' as const),
      })),
    });
    cycles = await db.ticketWorkCycle.findMany({
      where: { ticketId },
      orderBy: { sequenceNumber: 'asc' },
      select: { id: true, sequenceNumber: true },
    });
    for (const kind of ['messages', 'internal-notes']) {
      const data = Array.from(
        { length: kind === 'messages' ? 1201 : 601 },
        (_, i) => ({
          ticketId,
          createdInCycleId:
            cycles[Math.min(60, Math.floor(i / (kind === 'messages' ? 18 : 9)))]
              .id,
          authorId: users.manager.id,
          content: `record ${i}`,
          createdAt: new Date('2026-02-01'),
          editedAt: i % 7 === 0 ? new Date('2026-02-02') : null,
          deletedAt: i % 11 === 0 ? new Date('2026-02-03') : null,
          clientRequestId: randomUUID(),
          creationHash: '0'.repeat(64),
        }),
      );
      if (kind === 'messages') await db.ticketMessage.createMany({ data });
      else await db.ticketInternalNote.createMany({ data });
    }
    await db.subtask.createMany({
      data: Array.from({ length: 671 }, (_, i) => ({
        ticketId,
        createdInCycleId: cycles[Math.min(60, Math.floor(i / 10))].id,
        title: `task ${i}`,
        description: 'immutable history',
        status: 'COMPLETED' as const,
        assignedAgentId: users.collaborator.id,
        completedById: users.collaborator.id,
        completedAt: new Date('2026-02-02'),
        createdAt: new Date('2026-02-01'),
      })),
    });
    const message = await db.ticketMessage.findFirstOrThrow({
      where: { ticketId, deletedAt: null },
      orderBy: { id: 'desc' },
    });
    const note = await db.ticketInternalNote.findFirstOrThrow({
      where: { ticketId, deletedAt: null },
      orderBy: { id: 'desc' },
    });
    await db.attachment.createMany({
      data: [{ messageId: message.id }, { internalNoteId: note.id }].map(
        (parent) => ({
          ...parent,
          uploaderId: users.manager.id,
          filename: 'kept.txt',
          contentType: 'text/plain',
          byteSize: 1,
          storageKey: randomUUID(),
        }),
      ),
    });
  });
  afterAll(async () => {
    try {
      if (db) {
        const userIds = Object.values(users).map((user) => user.id);
        await db.attachment.deleteMany({
          where: { uploaderId: { in: userIds } },
        });
        if (ticketId) {
          await db.notification.deleteMany({ where: { ticketId } });
          await db.ticketMessage.deleteMany({ where: { ticketId } });
          await db.ticketInternalNote.deleteMany({ where: { ticketId } });
          await db.subtask.deleteMany({ where: { ticketId } });
          await db.ticketWorkCycle.deleteMany({ where: { ticketId } });
          await db.ticket.delete({ where: { id: ticketId } });
        }
        if (categoryId)
          await db.ticketCategory.delete({ where: { id: categoryId } });
        await db.user.deleteMany({ where: { id: { in: userIds } } });
      }
    } finally {
      await app?.close();
    }
  });
  it.each([
    ['messages', 1201],
    ['internal-notes', 601],
  ] as const)(
    '%s is bounded with deterministic tied timestamps, redaction, attachments and final page',
    async (kind, count) => {
      const seen = new Set<number>();
      let cursor: string | null = null;
      let edited = false,
        deleted = false,
        attached = false;
      do {
        const response = await get(
          `/tickets/${ticketId}/${kind}${cursor ? `?cursor=${cursor}` : ''}`,
        ).expect(200);
        const page = response.body as Stream;
        expect(page.records.length).toBeLessThanOrEqual(25);
        expect(page.cycles.length).toBeLessThanOrEqual(26);
        expect(page.records.map((row) => row.id)).toEqual(
          page.records.map((row) => row.id).sort((a, b) => a - b),
        );
        for (const row of page.records) {
          expect(seen.has(row.id)).toBe(false);
          seen.add(row.id);
          expect(
            page.cycles.some((cycle) => cycle.id === row.createdInCycleId),
          ).toBe(true);
          if (row.deletedAt) {
            deleted = true;
            expect(row.content).toBeNull();
          }
          if (row.editedAt) edited = true;
          if (row.attachments.some((file) => file.filename === 'kept.txt'))
            attached = true;
        }
        cursor = page.nextCursor;
        expect(page.hasMore).toBe(cursor !== null);
      } while (cursor);
      expect(seen.size).toBe(count);
      expect([edited, deleted, attached]).toEqual([true, true, true]);
    },
  );
  it('keeps an older cursor stable when a new requester message arrives; replay and edits retain lifecycle behavior', async () => {
    const path = `/tickets/${ticketId}/messages`;
    const first = (await get(path, 'employee').expect(200)).body as Stream;
    const auth = `Bearer ${jwt.sign({ sub: users.employee.id, role: 'EMPLOYEE' })}`;
    await db.ticket.update({
      where: { id: ticketId },
      data: { status: 'WAITING_FOR_EMPLOYEE' },
    });
    const body = {
      expectedCycleId: cycles[60].id,
      content: 'New reply',
      clientRequestId: randomUUID(),
    };
    const posted = await request(app.getHttpServer())
      .post(path)
      .set('Authorization', auth)
      .send(body)
      .expect(201);
    const id = (posted.body as RecordView).id;
    expect(
      (await db.ticket.findUniqueOrThrow({ where: { id: ticketId } })).status,
    ).toBe('IN_PROGRESS');
    await db.ticket.update({
      where: { id: ticketId },
      data: { status: 'WAITING_FOR_EMPLOYEE' },
    });
    await request(app.getHttpServer())
      .post(path)
      .set('Authorization', auth)
      .send(body)
      .expect(201);
    await request(app.getHttpServer())
      .patch(`${path}/${id}`)
      .set('Authorization', auth)
      .send({ content: 'Edited reply', expectedCycleId: cycles[60].id })
      .expect(200);
    expect(
      (await db.ticket.findUniqueOrThrow({ where: { id: ticketId } })).status,
    ).toBe('WAITING_FOR_EMPLOYEE');
    const older = (
      await get(`${path}?cursor=${first.nextCursor}`, 'employee').expect(200)
    ).body as Stream;
    expect(
      older.records.some(
        (row) =>
          row.id === id || first.records.some((old) => old.id === row.id),
      ),
    ).toBe(false);
    await request(app.getHttpServer())
      .delete(`${path}/${id}`)
      .set('Authorization', auth)
      .send({ expectedCycleId: cycles[60].id })
      .expect(200);
  });
  it('preserves employee, collaborator and operational exclusion boundaries on every page', async () => {
    await get(`/tickets/${ticketId}/messages`, 'other').expect(404);
    await get(`/tickets/${ticketId}/internal-notes`, 'employee').expect(403);
    await get(`/tickets/${ticketId}/messages`, 'admin').expect(403);
    await get(`/tickets/${ticketId}/internal-notes`, 'collaborator').expect(
      200,
    );
    await db.subtask.updateMany({
      where: { ticketId, createdInCycleId: cycles[60].id },
      data: { assignedAgentId: null },
    });
    await get(`/tickets/${ticketId}/history`, 'collaborator').expect(404);
    await get(`/tickets/${ticketId}/internal-notes`, 'collaborator').expect(
      404,
    );
    await get(
      `/tickets/${ticketId}/history/${cycles[0].id}/subtasks`,
      'collaborator',
    ).expect(404);
  });
  it('bounds cycles and shared subtasks, retains original/reopen/auto-close history and independent continuation', async () => {
    let cursor: string | null = null;
    const sequences: number[] = [];
    do {
      const page = (
        await get(
          `/tickets/${ticketId}/history${cursor ? `?cursor=${cursor}` : ''}`,
        ).expect(200)
      ).body as History;
      expect(page.cycles.length).toBeLessThanOrEqual(25);
      expect(page.currentCycleId).toBe(cycles[60].id);
      expect(
        page.cycles.flatMap((cycle) => cycle.subtasks).length,
      ).toBeLessThanOrEqual(25);
      for (const cycle of page.cycles) {
        sequences.push(cycle.sequenceNumber);
        expect(cycle.isCurrent).toBe(cycle.id === cycles[60].id);
        expect(cycle.type).toBe(
          cycle.sequenceNumber === 1 ? 'ORIGINAL' : 'REOPENED',
        );
        if (!cycle.isCurrent) {
          expect(cycle.closeSource).toBe('AUTO_TIMEOUT');
          expect(cycle.resolutionSummary).toBe('Retained resolution');
        }
        if (cycle.sequenceNumber > 1)
          expect(cycle.startReason).toBe(`Reopen ${cycle.sequenceNumber - 1}`);
      }
      const cycle = page.cycles.at(-1)!;
      const tasks = [...cycle.subtasks];
      let taskCursor = cycle.subtasksNextCursor;
      while (taskCursor) {
        const next = (
          await get(
            `/tickets/${ticketId}/history/${cycle.id}/subtasks?cursor=${taskCursor}`,
          ).expect(200)
        ).body as { items: Cycle['subtasks']; nextCursor: string | null };
        tasks.push(...next.items);
        taskCursor = next.nextCursor;
      }
      expect(tasks).toHaveLength(10);
      expect(new Set(tasks.map((task) => task.id)).size).toBe(10);
      expect(
        tasks.every((task) => task.completedBy.id === users.collaborator.id),
      ).toBe(true);
      cursor = page.nextCursor;
    } while (cursor);
    expect(sequences).toEqual(Array.from({ length: 61 }, (_, i) => 61 - i));
    // One cycle is larger than the page size, independently of cycle paging.
    let taskCursor: string | null = null;
    const currentIds = new Set<number>();
    do {
      const next = (
        await get(
          `/tickets/${ticketId}/history/${cycles[60].id}/subtasks${taskCursor ? `?cursor=${taskCursor}` : ''}`,
        ).expect(200)
      ).body as { items: Cycle['subtasks']; nextCursor: string | null };
      expect(next.items.length).toBeLessThanOrEqual(25);
      for (const task of next.items) {
        expect(currentIds.has(task.id)).toBe(false);
        currentIds.add(task.id);
      }
      taskCursor = next.nextCursor;
    } while (taskCursor);
    expect(currentIds.size).toBe(71);
    const employee = (
      await get(`/tickets/${ticketId}/history`, 'employee').expect(200)
    ).body as History;
    expect(employee.cycles.every((cycle) => !('subtasks' in cycle))).toBe(true);
  });
  it.each(['messages', 'internal-notes', 'history'])(
    'rejects malformed %s pagination',
    async (kind) => {
      for (const query of ['cursor=invalid', 'limit=101', 'limit=0'])
        await get(`/tickets/${ticketId}/${kind}?${query}`).expect(400);
    },
  );
  it('records representative bounded query plans without timing thresholds', async () => {
    const client = new Client({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    await client.connect();
    try {
      for (const table of ['TicketMessage', 'TicketInternalNote']) {
        await client.query(`ANALYZE "${table}"`);
        const plan = await client.query<{ 'QUERY PLAN': string }>(
          `EXPLAIN (ANALYZE, BUFFERS) SELECT id FROM "${table}" WHERE "ticketId" = $1 ORDER BY "createdAt" DESC, id DESC LIMIT 26`,
          [ticketId],
        );
        console.log(
          `${table} fixture plan:`,
          plan.rows.map((row) => row['QUERY PLAN']).join('\n'),
        );
      }
      const plan = await client.query<{ 'QUERY PLAN': string }>(
        'EXPLAIN (ANALYZE, BUFFERS) SELECT id FROM "TicketWorkCycle" WHERE "ticketId" = $1 AND "sequenceNumber" < 36 ORDER BY "sequenceNumber" DESC LIMIT 26',
        [ticketId],
      );
      console.log(
        'Cycle fixture plan:',
        plan.rows.map((row) => row['QUERY PLAN']).join('\n'),
      );
      await client.query('ANALYZE "Subtask"');
      const taskPlan = await client.query<{ 'QUERY PLAN': string }>(
        'EXPLAIN (ANALYZE, BUFFERS) SELECT id FROM "Subtask" WHERE "ticketId" = $1 AND "createdInCycleId" = $2 ORDER BY "createdAt" DESC, id DESC LIMIT 26',
        [ticketId, cycles[60].id],
      );
      console.log(
        'Subtask fixture plan:',
        taskPlan.rows.map((row) => row['QUERY PLAN']).join('\n'),
      );
    } finally {
      await client.end();
    }
  });
});
