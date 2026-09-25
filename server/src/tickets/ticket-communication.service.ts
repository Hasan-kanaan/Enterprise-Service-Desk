import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma, UserRole } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  requireActiveActor,
  serializable,
  operationalStatuses,
} from '../prisma/transactions';
import { TicketVisibilityService } from './ticket-visibility.service';
import { TicketAuthorizationUser } from './ticket-authorization.types';
import { notify, supportRecipients } from '../notifications/notification-events';
import {
  CreateCommunicationDto,
  EditCommunicationDto,
} from './dto/ticket-communication.dto';

const projection = {
  id: true,
  ticketId: true,
  createdInCycleId: true,
  authorId: true,
  content: true,
  createdAt: true,
  editedAt: true,
  author: { select: { id: true, username: true } },
} as const;
export type CommunicationKind = 'messages' | 'internal-notes';

@Injectable()
export class TicketCommunicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visibility: TicketVisibilityService,
  ) {}

  private async context(
    db: Prisma.TransactionClient,
    ticketId: number,
    user: TicketAuthorizationUser,
    kind: CommunicationKind,
  ) {
    const where =
      kind === 'internal-notes'
        ? this.visibility.supportWhere(user)
        : this.visibility.buildWhere(user);
    const ticket = await db.ticket.findFirst({
      where: { AND: [{ id: ticketId }, where] },
      include: { workCycles: { orderBy: { sequenceNumber: 'desc' }, take: 1 } },
    });
    if (!ticket) throw new NotFoundException('Ticket communication not found');
    const cycle = ticket.workCycles[0];
    const canPost =
      !!cycle &&
      cycle.outcome === null &&
      operationalStatuses.includes(
        ticket.status as (typeof operationalStatuses)[number],
      ) &&
      (user.role !== UserRole.MANAGER || ticket.assignedManagerId === user.id);
    const canReadNotes =
      user.role !== UserRole.EMPLOYEE &&
      (user.role !== UserRole.MANAGER || ticket.assignedManagerId === user.id);
    return { ticket, cycle, canPost, canReadNotes };
  }

  read(
    ticketId: number,
    user: TicketAuthorizationUser,
    kind: CommunicationKind,
  ) {
    return this.prisma.$transaction(
      async (db) => {
        const context = await this.context(db, ticketId, user, kind);
        const args = {
          where: { ticketId },
          orderBy: { id: 'asc' as const },
          select: projection,
        };
        const records =
          kind === 'messages'
            ? await db.ticketMessage.findMany(args)
            : await db.ticketInternalNote.findMany(args);
        return {
          ticketId,
          cycles: (
            await db.ticketWorkCycle.findMany({
              where: { ticketId },
              orderBy: { sequenceNumber: 'desc' },
              select: {
                id: true,
                sequenceNumber: true,
                type: true,
                outcome: true,
              },
            })
          ).map((cycle) => ({ ...cycle, isEnded: cycle.outcome !== null })),
          currentCycleId: context.cycle?.id ?? null,
          canPost: context.canPost,
          canReadNotes: context.canReadNotes,
          records: records.map((record) => ({
            ...record,
            canEdit:
              context.canPost &&
              record.authorId === user.id &&
              record.createdInCycleId === context.cycle?.id,
          })),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  write(
    ticketId: number,
    user: TicketAuthorizationUser,
    kind: CommunicationKind,
    dto: EditCommunicationDto | CreateCommunicationDto,
    recordId?: number,
  ) {
    return serializable(this.prisma, async (db) => {
      const rows = await db.$queryRaw<
        Array<{ id: number }>
      >`SELECT id FROM "Ticket" WHERE id = ${ticketId} FOR UPDATE`;
      if (!rows.length) throw new NotFoundException('Ticket not found');
      await requireActiveActor(db, user);
      if (user.role === UserRole.AGENT) {
        // The serializable snapshot starts before a blocked parent lock is acquired.
        // Lock relationship rows too: reassignment/lead removal since that snapshot
        // must conflict rather than authorize a write using an obsolete relationship.
        await db.$queryRaw`SELECT id FROM "Subtask" WHERE "ticketId" = ${ticketId} AND "assignedAgentId" = ${user.id} ORDER BY id FOR UPDATE`;
        await db.$queryRaw`SELECT id FROM "Team" WHERE id = (SELECT "assignedTeamId" FROM "Ticket" WHERE id = ${ticketId}) FOR UPDATE`;
      }
      const context = await this.context(db, ticketId, user, kind);
      // A replay still requires a current posting relationship, even when the
      // original cycle subsequently ended. It never inserts or changes status.
      if (
        user.role === UserRole.MANAGER &&
        context.ticket.assignedManagerId !== user.id
      )
        throw new ForbiddenException(
          'Claim responsibility before participating',
        );
      const creation = 'clientRequestId' in dto ? dto : null;
      const creationHash = createHash('sha256')
        .update(JSON.stringify([ticketId, dto.expectedCycleId, dto.content]))
        .digest('hex');
      if (creation) {
        const args = {
          where: {
            authorId_clientRequestId: {
              authorId: user.id,
              clientRequestId: creation.clientRequestId,
            },
          },
        };
        const existing =
          kind === 'messages'
            ? await db.ticketMessage.findUnique(args)
            : await db.ticketInternalNote.findUnique(args);
        if (existing) {
          if (existing.creationHash !== creationHash)
            throw new ConflictException(
              'Request key was already used for different content',
            );
          const select = { where: { id: existing.id }, select: projection };
          return kind === 'messages'
            ? db.ticketMessage.findUniqueOrThrow(select)
            : db.ticketInternalNote.findUniqueOrThrow(select);
        }
      }
      if (!context.canPost || context.cycle?.id !== dto.expectedCycleId)
        throw new ConflictException(
          'Work cycle changed or ended; reload and review before retrying',
        );
      if (recordId !== undefined) {
        const args = { where: { id: recordId, ticketId }, select: projection };
        const record =
          kind === 'messages'
            ? await db.ticketMessage.findFirst(args)
            : await db.ticketInternalNote.findFirst(args);
        if (!record) throw new NotFoundException('Communication not found');
        if (record.authorId !== user.id)
          throw new ForbiddenException('Only the author may edit this record');
        if (record.createdInCycleId !== context.cycle.id)
          throw new ConflictException(
            'Previous-cycle communication is permanently read-only',
          );
        const update = {
          where: { id: recordId },
          data: { content: dto.content, editedAt: new Date() },
          select: projection,
        };
        return kind === 'messages'
          ? db.ticketMessage.update(update)
          : db.ticketInternalNote.update(update);
      }
      if (!creation)
        throw new ConflictException('Creation request key is required');
      const args = {
        data: {
          ticketId,
          createdInCycleId: context.cycle.id,
          authorId: user.id,
          content: dto.content,
          createdAt: new Date(),
          clientRequestId: creation.clientRequestId,
          creationHash,
        },
        select: projection,
      };
      const record =
        kind === 'messages'
          ? await db.ticketMessage.create(args)
          : await db.ticketInternalNote.create(args);
      if (
        kind === 'messages' &&
        user.role === UserRole.EMPLOYEE &&
        context.ticket.requesterId === user.id &&
        context.ticket.status === 'WAITING_FOR_EMPLOYEE'
      )
        await db.ticket.update({
          where: { id: ticketId },
          data: { status: 'IN_PROGRESS' },
        });
      if (kind === 'messages') {
        const requester =
          user.role === UserRole.EMPLOYEE && context.ticket.requesterId === user.id;
        await notify(
          db,
          requester
            ? await supportRecipients(db, ticketId, true)
            : [context.ticket.requesterId],
          {
            type: requester ? 'REQUESTER_MESSAGE' : 'SUPPORT_MESSAGE',
            actorUserId: user.id,
            ticketId,
          },
        );
      }
      return record;
    }).catch((error) => {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          'Request key was used concurrently; reload before retrying',
        );
      throw error;
    });
  }
}
