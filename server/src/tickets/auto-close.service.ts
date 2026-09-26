import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isSerializationConflict } from '../prisma/transactions';
import { AUTO_CLOSE_AFTER_MS } from './auto-close.config';

export const AUTO_CLOSE_BATCH_SIZE = 100;
export const AUTO_CLOSE_MAX_BATCHES = 10;

@Injectable()
export class AutoCloseService {
  constructor(private readonly prisma: PrismaService) {}

  async runSweep(now: Date) {
    if (!Number.isFinite(now.getTime())) throw new Error('Invalid sweep time');
    const cutoff = new Date(now.getTime() - AUTO_CLOSE_AFTER_MS);
    let closed = 0;
    for (let batch = 0; batch < AUTO_CLOSE_MAX_BATCHES; batch++) {
      try {
        const result = await this.prisma.$transaction(
          async (db) => {
            // Lock parents before reading cycles, as interactive lifecycle writes do.
            // Locked candidates are skipped so multiple workers can share the backlog.
            const candidates = await db.$queryRaw<{ id: number }[]>`
            SELECT id FROM "Ticket"
            WHERE status = 'RESOLVED' AND "resolvedAt" <= ${cutoff}
            ORDER BY "resolvedAt" ASC
            LIMIT ${AUTO_CLOSE_BATCH_SIZE}
            FOR UPDATE SKIP LOCKED`;
            let count = 0;
            for (const { id } of candidates) {
              const ticket = await db.ticket.findUnique({
                where: { id },
                select: {
                  status: true,
                  resolvedAt: true,
                  workCycles: {
                    orderBy: { sequenceNumber: 'desc' },
                    take: 1,
                    select: {
                      id: true,
                      outcome: true,
                      endedAt: true,
                      closedAt: true,
                    },
                  },
                },
              });
              if (
                !ticket ||
                ticket.status !== 'RESOLVED' ||
                !ticket.resolvedAt ||
                ticket.resolvedAt > cutoff
              )
                continue;
              const cycle = ticket.workCycles[0];
              if (
                !cycle ||
                cycle.outcome !== 'RESOLVED' ||
                !cycle.endedAt ||
                cycle.closedAt
              ) {
                throw new Error(
                  `Resolved ticket ${id} has no unclosed resolved cycle`,
                );
              }
              await db.ticketWorkCycle.update({
                where: { id: cycle.id },
                data: {
                  closedAt: now,
                  closedById: null,
                  closeSource: 'AUTO_TIMEOUT',
                },
              });
              await db.ticket.update({
                where: { id },
                data: { status: 'CLOSED', closedAt: now },
              });
              count++;
            }
            return { selected: candidates.length, closed: count };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        closed += result.closed;
        if (result.selected < AUTO_CLOSE_BATCH_SIZE) break;
      } catch (error) {
        // Background conflicts are retried by the next sweep, never interactive 409s.
        if (isSerializationConflict(error)) break;
        throw error;
      }
    }
    return { closed };
  }
}
