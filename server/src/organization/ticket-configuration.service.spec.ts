import { ConflictException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TicketConfigurationService } from './ticket-configuration.service';

describe('Ticket configuration conflict contract', () => {
  const actor = { id: 1, role: 'ADMIN' as const };
  function service(code: string) {
    const error = new Prisma.PrismaClientKnownRequestError(
      'Internal index detail',
      {
        code,
        clientVersion: 'test',
      },
    );
    const db = { $transaction: jest.fn().mockRejectedValue(error) };
    return new TicketConfigurationService(db as unknown as PrismaService);
  }
  it.each(['categories', 'tags'] as const)(
    'maps %s database uniqueness to a safe correctable 409',
    async (kind) => {
      await expect(
        service('P2002').write(kind, null, { name: 'Mixed Name' }, actor),
      ).rejects.toThrow(
        new ConflictException(
          'This name is already reserved, including archived records',
        ),
      );
    },
  );
  it('preserves the explicit concurrency/reload contract', async () => {
    await expect(
      service('P2034').write('categories', 1, { name: 'Mixed Name' }, actor),
    ).rejects.toThrow(
      new ConflictException(
        'Data changed concurrently; reload before retrying',
      ),
    );
  });
});
