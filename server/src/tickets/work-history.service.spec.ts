import { Prisma } from '../../generated/prisma/client';
import { WorkHistoryService } from './work-history.service';
import { PrismaService } from '../prisma/prisma.service';
import { TicketVisibilityService } from './ticket-visibility.service';
import { WorkHistoryDto } from './dto/work-history.dto';

describe('WorkHistoryService bounded projection', () => {
  it('retrieves only one page plus sentinel and scopes the existing visibility check to that page', async () => {
    const rows = Array.from({ length: 26 }, (_, i) => ({
      id: i + 1,
      ticketId: i + 100,
      kind: 'CYCLE',
    }));
    const db = {
      $queryRaw: jest
        .fn<Promise<unknown[]>, [Prisma.Sql]>()
        .mockResolvedValue(rows),
      ticket: { findMany: jest.fn().mockResolvedValue([{ id: 100 }]) },
    };
    const prisma = {
      $transaction: jest.fn((fn: (db: unknown) => unknown) => fn(db)),
    };
    const predicate = { assignedAgentId: 5 };
    const visibility = { buildWhere: jest.fn().mockReturnValue(predicate) };
    const service = new WorkHistoryService(
      prisma as unknown as PrismaService,
      visibility as unknown as TicketVisibilityService,
    );
    const result = await service.list(
      { id: 5, role: 'AGENT' },
      new WorkHistoryDto(),
    );
    expect(result.items).toHaveLength(25);
    expect(result.hasMore).toBe(true);
    expect(result.items[0].canOpenTicket).toBe(true);
    expect(result.items[1].canOpenTicket).toBe(false);
    const query = db.$queryRaw.mock.calls[0][0];
    expect(query.sql).toMatch(
      /ORDER BY "activityAt" DESC, kind DESC, id DESC\s+LIMIT \? OFFSET \?/,
    );
    expect(query.values.slice(-2)).toEqual([26, 0]);
    expect(db.ticket.findMany).toHaveBeenCalledWith({
      where: {
        AND: [
          { id: { in: rows.slice(0, 25).map((row) => row.ticketId) } },
          predicate,
        ],
      },
      select: { id: true },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
  });
});
