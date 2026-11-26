import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TicketRoutingStrategy,
  UserRole,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TicketRoutingService } from './ticket-routing.service';

describe('TicketRoutingService', () => {
  const db = {
    $queryRaw: jest.fn(),
    ticketRoutingConfiguration: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    ticketCategory: { findMany: jest.fn(), findUnique: jest.fn() },
    specialty: { findMany: jest.fn() },
    ticketCategorySpecialty: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    user: { findMany: jest.fn(), findUnique: jest.fn() },
    ticket: { groupBy: jest.fn() },
  };
  const transaction = jest.fn();
  const service = new TicketRoutingService({
    ...db,
    $transaction: transaction,
  } as unknown as PrismaService);
  const superAdmin = { id: 1, role: UserRole.SUPER_ADMIN };
  let configuration: {
    enabled: boolean;
    strategy: TicketRoutingStrategy;
    lastAssignedManagerId: number | null;
  };

  beforeEach(() => {
    jest.resetAllMocks();
    configuration = {
      enabled: true,
      strategy: TicketRoutingStrategy.EQUAL_ROUND_ROBIN,
      lastAssignedManagerId: null,
    };
    transaction.mockImplementation(
      (callback: (tx: typeof db) => Promise<unknown>) => callback(db),
    );
    db.$queryRaw.mockResolvedValue([]);
    db.ticketRoutingConfiguration.findUnique.mockImplementation(() =>
      Promise.resolve({ id: 1, ...configuration }),
    );
    db.ticketRoutingConfiguration.update.mockImplementation(
      ({ data }: { data: Partial<typeof configuration> }) => {
        configuration = { ...configuration, ...data };
        return Promise.resolve({
          enabled: configuration.enabled,
          strategy: configuration.strategy,
        });
      },
    );
    db.user.findUnique.mockResolvedValue({
      id: superAdmin.id,
      role: UserRole.SUPER_ADMIN,
      status: 'ACTIVE',
      activatedAt: new Date(),
      sessionVersion: 0,
    });
    db.user.findMany.mockResolvedValue([]);
    db.ticket.groupBy.mockResolvedValue([]);
    db.ticketCategory.findMany.mockResolvedValue([]);
    db.specialty.findMany.mockResolvedValue([]);
    db.ticketCategory.findUnique.mockResolvedValue({ id: 7, archivedAt: null });
    db.ticketCategorySpecialty.findMany.mockResolvedValue([]);
    db.ticketCategorySpecialty.deleteMany.mockResolvedValue({ count: 0 });
    db.ticketCategorySpecialty.createMany.mockResolvedValue({ count: 0 });
  });

  it('only lets SUPER_ADMIN read or change routing configuration', async () => {
    for (const role of [
      UserRole.ADMIN,
      UserRole.MANAGER,
      UserRole.AGENT,
      UserRole.EMPLOYEE,
    ]) {
      await expect(
        service.configuration({ id: 2, role }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.updateConfiguration(
          { id: 2, role },
          { enabled: true, strategy: TicketRoutingStrategy.EQUAL_ROUND_ROBIN },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    }
    expect(transaction).not.toHaveBeenCalled();
    await expect(service.configuration(superAdmin)).resolves.toMatchObject({
      enabled: true,
      strategy: TicketRoutingStrategy.EQUAL_ROUND_ROBIN,
    });
  });

  it('persists routing settings through the database row', async () => {
    await expect(
      service.updateConfiguration(superAdmin, {
        enabled: true,
        strategy: TicketRoutingStrategy.LEAST_ACTIVE_TICKETS,
      }),
    ).resolves.toEqual({
      enabled: true,
      strategy: TicketRoutingStrategy.LEAST_ACTIVE_TICKETS,
    });
    expect(db.$queryRaw).toHaveBeenCalled();
    expect(db.ticketRoutingConfiguration.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        enabled: true,
        strategy: TicketRoutingStrategy.LEAST_ACTIVE_TICKETS,
      },
      select: { enabled: true, strategy: true },
    });
    await expect(service.configuration(superAdmin)).resolves.toMatchObject({
      enabled: true,
      strategy: TicketRoutingStrategy.LEAST_ACTIVE_TICKETS,
    });
  });

  it('replaces active mappings and keeps archived mappings retained', async () => {
    db.specialty.findMany.mockResolvedValue([
      { id: 12, archivedAt: null },
      { id: 14, archivedAt: null },
    ]);
    db.ticketCategorySpecialty.findMany.mockResolvedValue([
      { specialtyId: 11 },
      { specialtyId: 13 },
    ]);

    await service.updateCategorySpecialties(superAdmin, 7, [12, 14]);

    expect(db.ticketCategorySpecialty.deleteMany).toHaveBeenCalledWith({
      where: { categoryId: 7, specialtyId: { in: [11, 13] } },
    });
    expect(db.ticketCategorySpecialty.createMany).toHaveBeenCalledWith({
      data: [
        { categoryId: 7, specialtyId: 12 },
        { categoryId: 7, specialtyId: 14 },
      ],
      skipDuplicates: true,
    });
    expect(db.ticketCategorySpecialty.findMany).toHaveBeenCalledWith({
      where: { categoryId: 7, specialty: { archivedAt: null } },
      select: { specialtyId: true },
    });
  });

  it('allows one specialty to map to multiple categories', async () => {
    db.specialty.findMany.mockResolvedValue([{ id: 12, archivedAt: null }]);
    await service.updateCategorySpecialties(superAdmin, 7, [12]);
    await service.updateCategorySpecialties(superAdmin, 8, [12]);
    expect(db.ticketCategorySpecialty.createMany).toHaveBeenNthCalledWith(1, {
      data: [{ categoryId: 7, specialtyId: 12 }],
      skipDuplicates: true,
    });
    expect(db.ticketCategorySpecialty.createMany).toHaveBeenNthCalledWith(2, {
      data: [{ categoryId: 8, specialtyId: 12 }],
      skipDuplicates: true,
    });
  });

  it('rejects duplicate, invalid, and archived mapping references', async () => {
    await expect(
      service.updateCategorySpecialties(superAdmin, 7, [12, 12]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();

    db.specialty.findMany.mockResolvedValue([]);
    await expect(
      service.updateCategorySpecialties(superAdmin, 7, [12]),
    ).rejects.toBeInstanceOf(NotFoundException);

    db.specialty.findMany.mockResolvedValue([
      { id: 12, archivedAt: new Date() },
    ]);
    await expect(
      service.updateCategorySpecialties(superAdmin, 7, [12]),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not edit mappings for archived categories', async () => {
    db.ticketCategory.findUnique.mockResolvedValue({
      id: 7,
      archivedAt: new Date(),
    });
    await expect(
      service.updateCategorySpecialties(superAdmin, 7, []),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.ticketCategorySpecialty.deleteMany).not.toHaveBeenCalled();
  });

  it('rotates equally among eligible Managers and stores the cursor', async () => {
    db.user.findMany.mockResolvedValue([{ id: 3 }, { id: 5 }, { id: 8 }]);
    configuration.lastAssignedManagerId = 3;

    const assignments: (number | null)[] = [];
    for (let index = 0; index < 6; index++)
      assignments.push(
        await service.assignManager(
          db as unknown as Prisma.TransactionClient,
          4,
        ),
      );
    expect(assignments).toEqual([5, 8, 3, 5, 8, 3]);

    expect(db.user.findMany).toHaveBeenCalledWith({
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
                    categories: { some: { categoryId: 4 } },
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
    expect(db.ticketRoutingConfiguration.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { lastAssignedManagerId: 5 },
    });
    expect(db.$queryRaw).toHaveBeenCalled();
  });

  it('uses the persisted cursor to break least-workload ties fairly', async () => {
    configuration.strategy = TicketRoutingStrategy.LEAST_ACTIVE_TICKETS;
    configuration.lastAssignedManagerId = 5;
    db.user.findMany.mockResolvedValue([{ id: 3 }, { id: 5 }, { id: 8 }]);
    db.ticket.groupBy.mockResolvedValue([
      { assignedManagerId: 3, _count: { _all: 4 } },
      { assignedManagerId: 5, _count: { _all: 1 } },
      { assignedManagerId: 8, _count: { _all: 1 } },
    ]);

    await expect(
      service.assignManager(db as unknown as Prisma.TransactionClient, 4),
    ).resolves.toBe(8);

    expect(db.ticket.groupBy).toHaveBeenCalledWith({
      by: ['assignedManagerId'],
      where: {
        assignedManagerId: { in: [3, 5, 8] },
        status: {
          in: [
            'NEW',
            'ASSIGNED',
            'IN_PROGRESS',
            'WAITING_FOR_EMPLOYEE',
            'BLOCKED',
          ],
        },
      },
      _count: { _all: true },
    });
  });

  it('leaves tickets unassigned without advancing the cursor if no candidate exists', async () => {
    db.user.findMany.mockResolvedValue([]);
    await expect(
      service.assignManager(db as unknown as Prisma.TransactionClient, 4),
    ).resolves.toBeNull();
    expect(db.ticketRoutingConfiguration.update).not.toHaveBeenCalled();
  });

  it('does not query candidates or advance the cursor while routing is disabled', async () => {
    configuration.enabled = false;
    await expect(
      service.assignManager(db as unknown as Prisma.TransactionClient, 4),
    ).resolves.toBeNull();
    expect(db.user.findMany).not.toHaveBeenCalled();
    expect(db.ticketRoutingConfiguration.update).not.toHaveBeenCalled();
  });
});
