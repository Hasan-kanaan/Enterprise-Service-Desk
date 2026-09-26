import {
  AutoCloseService,
  AUTO_CLOSE_MAX_BATCHES,
  AUTO_CLOSE_BATCH_SIZE,
} from './auto-close.service';
import {
  AutoCloseScheduler,
  AUTO_CLOSE_SWEEP_INTERVAL_MS,
} from './auto-close.scheduler';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { autoCloseAt } from './auto-close.config';

describe('Auto-close bounds and stale candidates', () => {
  const now = new Date('2030-01-10T12:00:00Z');
  function setup(ticket: object | null, full = false) {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue(
        Array.from({ length: full ? AUTO_CLOSE_BATCH_SIZE : 1 }, (_, id) => ({
          id,
        })),
      ),
      ticket: {
        findUnique: jest.fn().mockResolvedValue(ticket),
        update: jest.fn(),
      },
      ticketWorkCycle: { update: jest.fn() },
    };
    const db = {
      $transaction: jest.fn((fn: (db: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };
    return {
      tx,
      db,
      service: new AutoCloseService(db as unknown as PrismaService),
    };
  }
  it.each([
    null,
    { status: 'IN_PROGRESS', resolvedAt: new Date('2000-01-01') },
    { status: 'RESOLVED', resolvedAt: now },
    { status: 'RESOLVED', resolvedAt: null },
  ])(
    'skips a candidate whose current persisted state is no longer eligible',
    async (ticket) => {
      const { service, tx } = setup(ticket);
      expect(await service.runSweep(now)).toEqual({ closed: 0 });
      expect(tx.ticket.update).not.toHaveBeenCalled();
      expect(tx.ticketWorkCycle.update).not.toHaveBeenCalled();
    },
  );
  it('caps total work even if every batch is full', async () => {
    const { service, db } = setup(null, true);
    await service.runSweep(now);
    expect(db.$transaction).toHaveBeenCalledTimes(AUTO_CLOSE_MAX_BATCHES);
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });
  it('defers serialization conflicts without changing interactive conflict handling', async () => {
    const { service, db } = setup(null);
    db.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('conflict', {
        code: 'P2034',
        clientVersion: 'test',
      }),
    );
    expect(await service.runSweep(now)).toEqual({ closed: 0 });
  });
  it('derives presentation from current state and elapsed hours', () => {
    expect(autoCloseAt({ status: 'RESOLVED', resolvedAt: now })).toEqual(
      new Date('2030-01-13T12:00:00Z'),
    );
    expect(autoCloseAt({ status: 'IN_PROGRESS', resolvedAt: now })).toBeNull();
    expect(autoCloseAt({ status: 'CLOSED', resolvedAt: now })).toBeNull();
  });
});

describe('Auto-close scheduler', () => {
  afterEach(() => jest.useRealTimers());
  it('triggers every ten minutes, prevents local overlap and stops on shutdown', async () => {
    jest.useFakeTimers();
    let finish!: (value: { closed: number }) => void;
    const sweep = {
      runSweep: jest.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      ),
    };
    const scheduler = new AutoCloseScheduler(
      sweep as unknown as AutoCloseService,
    );
    scheduler.onModuleInit();
    jest.advanceTimersByTime(AUTO_CLOSE_SWEEP_INTERVAL_MS * 2);
    expect(sweep.runSweep).toHaveBeenCalledTimes(1);
    finish({ closed: 0 });
    await scheduler.onModuleDestroy();
    jest.advanceTimersByTime(AUTO_CLOSE_SWEEP_INTERVAL_MS);
    expect(sweep.runSweep).toHaveBeenCalledTimes(1);
  });
});

describe('Auto-close configuration', () => {
  const original = process.env.AUTO_CLOSE_AFTER_HOURS;
  afterEach(() => {
    if (original === undefined) delete process.env.AUTO_CLOSE_AFTER_HOURS;
    else process.env.AUTO_CLOSE_AFTER_HOURS = original;
  });
  it('uses the same configured elapsed duration for the API deadline', () => {
    process.env.AUTO_CLOSE_AFTER_HOURS = '48';
    jest.isolateModules(() => {
      const config = jest.requireActual<typeof import('./auto-close.config')>(
        './auto-close.config',
      );
      expect(config.AUTO_CLOSE_AFTER_MS).toBe(48 * 3600000);
      expect(
        config.autoCloseAt({
          status: 'RESOLVED',
          resolvedAt: new Date('2030-01-01T12:00:00Z'),
        }),
      ).toEqual(new Date('2030-01-03T12:00:00Z'));
    });
  });
  it.each(['0', '-1', 'invalid', 'Infinity', '87601'])(
    'rejects invalid hours %s',
    (hours) => {
      process.env.AUTO_CLOSE_AFTER_HOURS = hours;
      expect(() =>
        jest.isolateModules(() => {
          jest.requireActual('./auto-close.config');
        }),
      ).toThrow('AUTO_CLOSE_AFTER_HOURS');
    },
  );
});
