import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '../users/user-role.enum';
import { TicketsController } from './tickets.controller';

describe('TicketsController', () => {
  const listVisible = jest.fn();
  const findVisibleById = jest.fn();
  const assignManager = jest.fn();
  const controller = new TicketsController(
    { listVisible, findVisibleById } as any,
    { assignManager } as any,
  );

  beforeEach(() => jest.clearAllMocks());

  it('delegates manager assignment with the authenticated identity', async () => {
    await controller.assignManager(
      12,
      { assignedManagerId: 32 },
      { user: { sub: 31, role: UserRole.MANAGER } },
    );
    expect(assignManager).toHaveBeenCalledWith(
      12,
      { id: 31, role: UserRole.MANAGER },
      { assignedManagerId: 32 },
    );
  });

  it('lists tickets through the visibility policy', async () => {
    listVisible.mockResolvedValue([]);

    await controller.list({ user: { sub: 10, role: UserRole.EMPLOYEE } });

    expect(listVisible).toHaveBeenCalledWith(
      {
        id: 10,
        role: UserRole.EMPLOYEE,
      },
      {},
    );
  });

  it('looks up ticket details through the visibility policy', async () => {
    findVisibleById.mockResolvedValue({ id: 12 });

    await controller.findById(12, {
      user: { sub: 31, role: UserRole.MANAGER },
    });

    expect(findVisibleById).toHaveBeenCalledWith(12, {
      id: 31,
      role: UserRole.MANAGER,
    });
  });

  it('preserves generic not-found behavior from the visibility policy', async () => {
    findVisibleById.mockRejectedValue(
      new NotFoundException('Ticket not found'),
    );

    await expect(
      controller.findById(99, { user: { sub: 20, role: UserRole.AGENT } }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('preserves ADMIN denial from the visibility policy', async () => {
    listVisible.mockRejectedValue(
      new ForbiddenException('ADMIN users do not have ticket visibility'),
    );

    await expect(
      controller.list({ user: { sub: 40, role: UserRole.ADMIN } }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
