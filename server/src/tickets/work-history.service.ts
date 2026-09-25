import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  TicketVisibilityService,
  TicketVisibilityUser,
} from './ticket-visibility.service';
import { WorkHistoryDto } from './dto/work-history.dto';

type HistoryRow = {
  kind: 'CYCLE' | 'SUBTASK';
  id: number;
  ticketId: number;
  cycleId: number;
  sequenceNumber: number;
  cycleType: 'ORIGINAL' | 'REOPENED';
  outcome: string | null;
  activityAt: Date;
  contributions: string[];
  subtaskTitle: string | null;
  subtaskStatus: string | null;
};

@Injectable()
export class WorkHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visibility: TicketVisibilityService,
  ) {}

  async list(user: TicketVisibilityUser, query: WorkHistoryDto) {
    if (!['MANAGER', 'AGENT'].includes(user.role))
      throw new ForbiddenException();
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;
    if (
      (from && !Number.isFinite(from.getTime())) ||
      (to && !Number.isFinite(to.getTime()))
    )
      throw new BadRequestException('Use calendar dates or ISO timestamps');
    if (from && to && from > to)
      throw new BadRequestException('from must not be after to');
    const { page = 1, pageSize = 25 } = query;
    // Query only retained evidence, never current assignments or team membership.
    // Migration-time snapshots are not proof of responsibility at the end of work.
    const manager = Prisma.sql`c."endingManagerId" = ${user.id} AND c."ownershipSnapshotBasis" = 'END_OF_WORK'`;
    const agent = Prisma.sql`c."endingAgentId" = ${user.id} AND c."ownershipSnapshotBasis" = 'END_OF_WORK'`;
    const ended = Prisma.sql`c."endedById" = ${user.id}`;
    const closed = Prisma.sql`c."closedById" = ${user.id} AND c."closedAt" IS NOT NULL`;
    const reopened = Prisma.sql`c."startedById" = ${user.id} AND c."type" = 'REOPENED'`;
    return this.prisma.$transaction(
      async (db) => {
        // UNION ALL preserves separate completed tasks; cycle relations are combined
        // in one row. PostgreSQL filters/sorts/pages; Node receives at most 101 rows.
        const rows = await db.$queryRaw<HistoryRow[]>(Prisma.sql`
        SELECT * FROM (
          SELECT 'CYCLE'::text AS kind, c.id, c."ticketId", c.id AS "cycleId",
            c."sequenceNumber", c.type::text AS "cycleType", c.outcome::text,
            GREATEST(c."endedAt", CASE WHEN ${closed} THEN c."closedAt" END) AS "activityAt",
            array_remove(ARRAY[
              CASE WHEN ${manager} THEN 'RESPONSIBLE_MANAGER' END,
              CASE WHEN ${agent} THEN 'PRIMARY_AGENT' END,
              CASE WHEN ${ended} THEN 'ENDED_WORK' END,
              CASE WHEN ${closed} THEN 'CLOSED_WORK' END,
              CASE WHEN ${reopened} THEN 'REOPENED_WORK' END
            ], NULL) AS contributions,
            NULL::text AS "subtaskTitle", NULL::text AS "subtaskStatus"
          FROM "TicketWorkCycle" c
          WHERE c."endedAt" IS NOT NULL AND c.outcome IS NOT NULL
            AND (${manager} OR ${agent} OR ${ended} OR ${closed} OR ${reopened})
          UNION ALL
          SELECT 'SUBTASK', s.id, s."ticketId", c.id, c."sequenceNumber", c.type::text,
            c.outcome::text, s."completedAt", ARRAY['COMPLETED_SUBTASK']::text[], s.title, s.status::text
          FROM "Subtask" s JOIN "TicketWorkCycle" c ON c.id = s."createdInCycleId"
          WHERE s."completedById" = ${user.id} AND s.status = 'COMPLETED' AND s."completedAt" IS NOT NULL
        ) history
        WHERE ${query.contribution ? Prisma.sql`${query.contribution} = ANY(contributions)` : Prisma.sql`TRUE`}
          AND ${from ? Prisma.sql`"activityAt" >= ${from}` : Prisma.sql`TRUE`}
          AND ${to ? Prisma.sql`"activityAt" <= ${to}` : Prisma.sql`TRUE`}
        ORDER BY "activityAt" DESC, kind DESC, id DESC
        LIMIT ${pageSize + 1} OFFSET ${(page - 1) * pageSize}
      `);
        const items = rows.slice(0, pageSize);
        const visible = items.length
          ? await db.ticket.findMany({
              where: {
                AND: [
                  {
                    id: { in: [...new Set(items.map((row) => row.ticketId))] },
                  },
                  this.visibility.buildWhere(user),
                ],
              },
              select: { id: true },
            })
          : [];
        const ids = new Set(visible.map((ticket) => ticket.id));
        return {
          items: items.map((row) => ({
            ...row,
            canOpenTicket: ids.has(row.ticketId),
          })),
          page,
          pageSize,
          hasMore: rows.length > pageSize,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
