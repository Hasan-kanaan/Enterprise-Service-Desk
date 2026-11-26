import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TicketRoutingStrategy,
  UserRole,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  operationalStatuses,
  requireActiveActor,
  serializable,
} from '../prisma/transactions';

type Actor = { id: number; role: UserRole; sessionVersion?: number };
type Database = Prisma.TransactionClient;

@Injectable()
export class TicketRoutingService {
  constructor(private readonly prisma: PrismaService) {}

  async configuration(actor: Actor) {
    this.assertSuperAdmin(actor);
    return serializable(this.prisma, async (db) => {
      await requireActiveActor(db, actor);
      const configuration = await this.requireConfiguration(db);
      const [categories, specialties] = await Promise.all([
        db.ticketCategory.findMany({
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            archivedAt: true,
            specialties: {
              orderBy: { specialty: { name: 'asc' } },
              select: {
                specialty: {
                  select: { id: true, name: true, archivedAt: true },
                },
              },
            },
          },
        }),
        db.specialty.findMany({
          orderBy: { name: 'asc' },
          select: { id: true, name: true, archivedAt: true },
        }),
      ]);
      return {
        enabled: configuration.enabled,
        strategy: configuration.strategy,
        categories: categories.map(({ specialties: links, ...category }) => ({
          ...category,
          specialties: links.map(({ specialty }) => specialty),
        })),
        specialties,
      };
    });
  }

  async updateConfiguration(
    actor: Actor,
    change: { enabled: boolean; strategy: TicketRoutingStrategy },
  ) {
    this.assertSuperAdmin(actor);
    return serializable(this.prisma, async (db) => {
      await requireActiveActor(db, actor);
      await this.lockConfiguration(db);
      return db.ticketRoutingConfiguration.update({
        where: { id: 1 },
        data: { enabled: change.enabled, strategy: change.strategy },
        select: { enabled: true, strategy: true },
      });
    });
  }

  async updateCategorySpecialties(
    actor: Actor,
    categoryId: number,
    specialtyIds: number[],
  ) {
    this.assertSuperAdmin(actor);
    if (new Set(specialtyIds).size !== specialtyIds.length)
      throw new BadRequestException('Specialty IDs must be unique');

    return serializable(this.prisma, async (db) => {
      await requireActiveActor(db, actor);
      await db.$queryRaw`SELECT id FROM "TicketCategory" WHERE id = ${categoryId} FOR UPDATE`;
      const category = await db.ticketCategory.findUnique({
        where: { id: categoryId },
        select: { id: true, archivedAt: true },
      });
      if (!category) throw new NotFoundException('Ticket category not found');
      if (category.archivedAt)
        throw new ConflictException(
          'Reactivate the category before changing its specialty mappings',
        );

      const ids = [...specialtyIds].sort((a, b) => a - b);
      if (ids.length) {
        await db.$queryRaw(
          Prisma.sql`SELECT id FROM "Specialty" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR SHARE`,
        );
        const records = await db.specialty.findMany({
          where: { id: { in: ids } },
          select: { id: true, archivedAt: true },
        });
        if (records.length !== ids.length)
          throw new NotFoundException('One or more specialties were not found');
        if (records.some(({ archivedAt }) => archivedAt !== null))
          throw new ConflictException(
            'Archived specialties cannot be added to category mappings',
          );
      }

      const existing = await db.ticketCategorySpecialty.findMany({
        where: {
          categoryId,
          specialty: { archivedAt: null },
        },
        select: { specialtyId: true },
      });
      const desired = new Set(ids);
      const removedIds = existing
        .map(({ specialtyId }) => specialtyId)
        .filter((id) => !desired.has(id));
      if (removedIds.length)
        await db.ticketCategorySpecialty.deleteMany({
          where: { categoryId, specialtyId: { in: removedIds } },
        });
      if (ids.length)
        await db.ticketCategorySpecialty.createMany({
          data: ids.map((specialtyId) => ({ categoryId, specialtyId })),
          skipDuplicates: true,
        });
      return { message: 'Category specialty mappings updated' };
    });
  }

  async assignManager(
    db: Database,
    categoryId: number,
  ): Promise<number | null> {
    const initial = await this.requireConfiguration(db);
    if (!initial.enabled) return null;

    await this.lockConfiguration(db);
    const configuration = await this.requireConfiguration(db);
    if (!configuration.enabled) return null;

    const managers = await db.user.findMany({
      where: {
        role: UserRole.MANAGER,
        status: 'ACTIVE',
        activatedAt: { not: null },
        managedTeams: {
          some: {
            team: {
              archivedAt: null,
              specialties: {
                some: {
                  specialty: {
                    archivedAt: null,
                    categories: { some: { categoryId } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    if (!managers.length) return null;

    let candidates = managers;
    if (configuration.strategy === TicketRoutingStrategy.LEAST_ACTIVE_TICKETS) {
      const counts = await db.ticket.groupBy({
        by: ['assignedManagerId'],
        where: {
          assignedManagerId: { in: managers.map(({ id }) => id) },
          status: { in: [...operationalStatuses] },
        },
        _count: { _all: true },
      });
      const workloads = new Map(
        counts.map(({ assignedManagerId, _count }) => [
          assignedManagerId!,
          _count._all,
        ]),
      );
      const lowest = Math.min(
        ...managers.map(({ id }) => workloads.get(id) ?? 0),
      );
      candidates = managers.filter(
        ({ id }) => (workloads.get(id) ?? 0) === lowest,
      );
    }

    const selected =
      candidates.find(
        ({ id }) =>
          configuration.lastAssignedManagerId !== null &&
          id > configuration.lastAssignedManagerId,
      ) ?? candidates[0];
    await db.ticketRoutingConfiguration.update({
      where: { id: 1 },
      data: { lastAssignedManagerId: selected.id },
    });
    return selected.id;
  }

  private assertSuperAdmin(actor: Actor) {
    if (actor.role !== UserRole.SUPER_ADMIN)
      throw new ForbiddenException('SUPER_ADMIN access required');
  }

  private async lockConfiguration(db: Database) {
    await db.$queryRaw`SELECT id FROM "TicketRoutingConfiguration" WHERE id = 1 FOR UPDATE`;
  }

  private async requireConfiguration(db: Database) {
    const configuration = await db.ticketRoutingConfiguration.findUnique({
      where: { id: 1 },
    });
    if (!configuration)
      throw new InternalServerErrorException(
        'Ticket routing configuration is missing',
      );
    return configuration;
  }
}
