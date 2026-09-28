import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { requireActiveActor, serializable } from '../prisma/transactions';
export type ConfigurationKind = 'categories' | 'tags';
type Actor = { id: number; role: UserRole; sessionVersion?: number };
const select = { id: true, name: true, archivedAt: true } as const;
@Injectable()
export class TicketConfigurationService {
  constructor(private readonly prisma: PrismaService) {}
  list(kind: ConfigurationKind) {
    const args = { select, orderBy: { name: 'asc' as const } };
    return kind === 'categories'
      ? this.prisma.ticketCategory.findMany(args)
      : this.prisma.ticketTag.findMany(args);
  }
  async write(
    kind: ConfigurationKind,
    id: number | null,
    change: { name: string } | { archived: boolean },
    actor: Actor,
  ) {
    if (actor.role !== 'ADMIN' && actor.role !== 'SUPER_ADMIN')
      throw new ForbiddenException('Configuration administration required');
    try {
      return await serializable(this.prisma, async (db) => {
        await requireActiveActor(db, actor);
        const data: { name?: string; archivedAt?: Date | null } = {};
        if ('name' in change) {
          data.name = change.name.trim();
          if (!data.name || data.name.length > 100)
            throw new BadRequestException('Invalid configuration name');
        }
        if (id === null) {
          if (!data.name) throw new BadRequestException('Name required');
          const args = { data: { name: data.name }, select };
          return kind === 'categories'
            ? db.ticketCategory.create(args)
            : db.ticketTag.create(args);
        }
        const table = kind === 'categories' ? 'TicketCategory' : 'TicketTag';
        await db.$queryRaw(
          Prisma.sql`SELECT id FROM ${Prisma.raw('"' + table + '"')} WHERE id = ${id} FOR UPDATE`,
        );
        const record =
          kind === 'categories'
            ? await db.ticketCategory.findUnique({ where: { id }, select })
            : await db.ticketTag.findUnique({ where: { id }, select });
        if (!record)
          throw new NotFoundException('Configuration record not found');
        if ('archived' in change)
          data.archivedAt = change.archived
            ? (record.archivedAt ?? new Date())
            : null;
        const args = { where: { id }, data, select };
        return kind === 'categories'
          ? db.ticketCategory.update(args)
          : db.ticketTag.update(args);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          'This name is already reserved, including archived records',
        );
      throw error;
    }
  }
}
