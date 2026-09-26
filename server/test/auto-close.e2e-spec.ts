import { Test } from '@nestjs/testing';
import { HttpException, INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  AutoCloseService,
  AUTO_CLOSE_BATCH_SIZE,
} from '../src/tickets/auto-close.service';
import { TicketsService } from '../src/tickets/tickets.service';
import { TicketStatus, User } from '../generated/prisma/client';

describe('Automatic closure (PostgreSQL)', () => {
  let app: INestApplication,
    db: PrismaService,
    sweep: AutoCloseService,
    lifecycle: TicketsService;
  let employee: User, manager: User, categoryId: number, teamId: number;
  const now = new Date('2030-01-10T12:00:00Z');
  const cutoff = new Date('2030-01-07T12:00:00Z');
  const ids: number[] = [];
  beforeAll(async () => {
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    await app.init();
    db = app.get(PrismaService);
    sweep = app.get(AutoCloseService);
    lifecycle = app.get(TicketsService);
    const prefix = randomUUID();
    employee = await db.user.create({
      data: {
        username: prefix,
        email: `${prefix}@test.invalid`,
        password: 'unused',
        role: 'EMPLOYEE',
      },
    });
    manager = await db.user.create({
      data: {
        username: `m${prefix}`,
        email: `m${prefix}@test.invalid`,
        password: 'unused',
        role: 'MANAGER',
      },
    });
    categoryId = (await db.ticketCategory.create({ data: { name: prefix } }))
      .id;
    teamId = (await db.team.create({ data: { name: prefix, scope: 'GLOBAL' } }))
      .id;
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await db.notification.deleteMany({ where: { ticketId: { in: ids } } });
    await db.ticket.deleteMany({ where: { id: { in: ids } } });
    ids.length = 0;
  });
  afterAll(async () => {
    await db.team.delete({ where: { id: teamId } });
    await db.ticketCategory.delete({ where: { id: categoryId } });
    await db.user.deleteMany({
      where: { id: { in: [employee.id, manager.id] } },
    });
    await app.close();
  });
  async function fixture(
    status: TicketStatus = 'RESOLVED',
    resolvedAt: Date | null = cutoff,
  ) {
    const ticket = await db.ticket.create({
      data: {
        title: 'Auto-close fixture',
        description: 'Retained description',
        requesterId: employee.id,
        categoryId,
        assignedManagerId: manager.id,
        assignedTeamId: teamId,
        status,
        resolvedAt,
        workCycles: {
          create: {
            sequenceNumber: 1,
            type: 'ORIGINAL',
            startedAt: new Date('2029-01-01'),
            outcome: 'RESOLVED',
            endedAt: resolvedAt,
            endedById: manager.id,
            resolutionSummary: 'Retain this summary',
            endingManagerId: manager.id,
            endingTeamId: teamId,
            ownershipSnapshotBasis: 'END_OF_WORK',
            ownershipCapturedAt: resolvedAt,
          },
        },
      },
    });
    ids.push(ticket.id);
    return ticket;
  }
  const read = (id: number) =>
    db.ticket.findUniqueOrThrow({
      where: { id },
      include: { workCycles: { orderBy: { sequenceNumber: 'desc' } } },
    });

  it.each([
    'NEW',
    'ASSIGNED',
    'IN_PROGRESS',
    'WAITING_FOR_EMPLOYEE',
    'BLOCKED',
    'CANCELLED',
    'CLOSED',
  ] as TicketStatus[])(
    'ignores %s even with an old resolution timestamp',
    async (status) => {
      const ticket = await fixture(status);
      await sweep.runSweep(now);
      expect((await read(ticket.id)).status).toBe(status);
    },
  );
  it.each([null, new Date(cutoff.getTime() + 1)])(
    'ignores missing or younger resolution %s',
    async (date) => {
      const ticket = await fixture('RESOLVED', date);
      await sweep.runSweep(now);
      expect((await read(ticket.id)).status).toBe('RESOLVED');
    },
  );
  it.each([cutoff, new Date(cutoff.getTime() - 1)])(
    'closes at/after 72 elapsed hours: %s',
    async (date) => {
      const ticket = await fixture('RESOLVED', date);
      const before = await read(ticket.id);
      await sweep.runSweep(now);
      const after = await read(ticket.id);
      expect(after.status).toBe('CLOSED');
      expect(after.closedAt).toEqual(now);
      expect(after.workCycles).toEqual([
        {
          ...before.workCycles[0],
          closedAt: now,
          closedById: null,
          closeSource: 'AUTO_TIMEOUT',
        },
      ]);
      expect(
        await db.notification.count({ where: { ticketId: ticket.id } }),
      ).toBe(0);
      await sweep.runSweep(new Date(now.getTime() + 60000));
      expect(await read(ticket.id)).toEqual(after);
    },
  );
  it('reopening invalidates the old deadline; resolving again starts a fresh period', async () => {
    const ticket = await fixture();
    await lifecycle.reopen(ticket.id, employee, { reason: 'Still broken' });
    expect((await read(ticket.id)).resolvedAt).toBeNull();
    await sweep.runSweep(now);
    expect((await read(ticket.id)).status).toBe('IN_PROGRESS');
    const resolved = await lifecycle.updateStatus(
      ticket.id,
      manager,
      'RESOLVED',
      'Fixed again',
    );
    const deadline = new Date(resolved.resolvedAt!.getTime() + 72 * 3600000);
    await sweep.runSweep(new Date(deadline.getTime() - 1));
    expect((await read(ticket.id)).status).toBe('RESOLVED');
    await sweep.runSweep(deadline);
    const after = await read(ticket.id);
    expect(after.status).toBe('CLOSED');
    expect(after.workCycles).toHaveLength(2);
    expect(after.workCycles[0].closeSource).toBe('AUTO_TIMEOUT');
    expect(after.workCycles[1].closedAt).toBeNull();
  });
  it('manual close retains its real actor and is ignored by subsequent sweeps', async () => {
    const ticket = await fixture();
    await lifecycle.updateStatus(ticket.id, employee, 'CLOSED');
    const before = await read(ticket.id);
    expect(before.workCycles[0]).toMatchObject({
      closeSource: 'MANUAL',
      closedById: employee.id,
    });
    await sweep.runSweep(now);
    expect(await read(ticket.id)).toEqual(before);
  });
  it('overlapping workers close each ticket once', async () => {
    const ticket = await fixture();
    await Promise.all([
      sweep.runSweep(now),
      sweep.runSweep(new Date(now.getTime() + 1)),
    ]);
    const after = await read(ticket.id);
    expect(after.status).toBe('CLOSED');
    expect(after.workCycles).toHaveLength(1);
    expect(after.closedAt).toEqual(after.workCycles[0].closedAt);
    expect(after.workCycles[0].closeSource).toBe('AUTO_TIMEOUT');
  });
  it.each(['close', 'reopen'])(
    '%s racing the sweep preserves atomic lifecycle state',
    async (action) => {
      const ticket = await fixture();
      const results = await Promise.allSettled([
        sweep.runSweep(now),
        action === 'close'
          ? lifecycle.updateStatus(ticket.id, employee, 'CLOSED')
          : lifecycle.reopen(ticket.id, employee, { reason: 'Racing reopen' }),
      ]);
      expect(results[0].status).toBe('fulfilled');
      if (results[1].status === 'rejected') {
        expect(results[1].reason).toBeInstanceOf(HttpException);
        expect((results[1].reason as HttpException).getStatus()).toBe(409);
      }
      const after = await read(ticket.id);
      if (action === 'reopen' && results[1].status === 'fulfilled') {
        expect(after.status).toBe('IN_PROGRESS');
      }
      if (after.status === 'IN_PROGRESS') {
        expect(after.resolvedAt).toBeNull();
        expect(after.closedAt).toBeNull();
        expect(after.workCycles[0].closedAt).toBeNull();
      } else {
        expect(after.status).toBe('CLOSED');
        expect(after.closedAt).toEqual(after.workCycles[0].closedAt);
        expect(['MANUAL', 'AUTO_TIMEOUT']).toContain(
          after.workCycles[0].closeSource,
        );
      }
    },
  );
  it('locked parents are skipped and handled by a later sweep', async () => {
    const ticket = await fixture();
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${ticket.id} FOR UPDATE`;
      await sweep.runSweep(now);
      expect(
        (await tx.ticket.findUniqueOrThrow({ where: { id: ticket.id } }))
          .status,
      ).toBe('RESOLVED');
    });
    await sweep.runSweep(now);
    expect((await read(ticket.id)).status).toBe('CLOSED');
  });
  it('rolls back cycle and ticket together on a database failure', async () => {
    const ticket = await fixture();
    const before = await read(ticket.id);
    const name = `auto_close_failure_${ticket.id}`;
    await db.$executeRawUnsafe(
      `CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = ${ticket.id} THEN RAISE EXCEPTION 'Injected rollback'; END IF; RETURN NEW; END $$`,
    );
    try {
      await db.$executeRawUnsafe(
        `CREATE TRIGGER ${name} BEFORE UPDATE ON "Ticket" FOR EACH ROW EXECUTE FUNCTION ${name}()`,
      );
      await expect(sweep.runSweep(now)).rejects.toThrow('Injected rollback');
      expect(await read(ticket.id)).toEqual(before);
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${name} ON "Ticket"`);
      await db.$executeRawUnsafe(`DROP FUNCTION ${name}()`);
    }
  });
  it('processes more than one bounded batch using the eligibility index', async () => {
    for (let i = 0; i < AUTO_CLOSE_BATCH_SIZE + 1; i++) await fixture();
    await sweep.runSweep(now);
    expect(
      await db.ticket.count({ where: { id: { in: ids }, status: 'CLOSED' } }),
    ).toBe(ids.length);
    const plan = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL enable_seqscan = off`;
      return tx.$queryRaw`EXPLAIN SELECT id FROM "Ticket" WHERE status = 'RESOLVED' AND "resolvedAt" <= ${cutoff} ORDER BY "resolvedAt" LIMIT 100 FOR UPDATE SKIP LOCKED`;
    });
    expect(JSON.stringify(plan)).toContain('Ticket_status_resolvedAt_idx');
  });
});
