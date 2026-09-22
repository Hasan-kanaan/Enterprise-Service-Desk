import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Prisma, UserRole } from '../../generated/prisma/client';
import { PrismaService } from './prisma.service';

export const operationalStatuses = [
  'NEW',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING_FOR_EMPLOYEE',
  'BLOCKED',
] as const;

export function isSerializationConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  const adapter = error.meta?.driverAdapterError as
    { cause?: { originalCode?: string } } | undefined;
  const state = adapter?.cause?.originalCode ?? error.meta?.code;
  return (
    error.code === 'P2034' ||
    (error.code === 'P2010' && (state === '40001' || state === '40P01'))
  );
}

export async function serializable<T>(
  prisma: PrismaService,
  action: (db: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  try {
    return await prisma.$transaction(action, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  } catch (error) {
    if (isSerializationConflict(error))
      throw new ConflictException(
        'Data changed concurrently; reload before retrying',
      );
    throw error;
  }
}

export async function lockUser(db: Prisma.TransactionClient, id: number) {
  await db.$queryRaw`SELECT id FROM "User" WHERE id = ${id} FOR UPDATE`;
  return db.user.findUnique({ where: { id } });
}

export async function requireActiveActor(
  db: Prisma.TransactionClient,
  actor: { id: number; role: UserRole; sessionVersion?: number },
) {
  const user = await lockUser(db, actor.id);
  if (
    !user ||
    user.status !== 'ACTIVE' ||
    user.role !== actor.role ||
    (actor.sessionVersion !== undefined &&
      user.sessionVersion !== actor.sessionVersion)
  ) {
    throw new UnauthorizedException('Account or session is no longer active');
  }
  return user;
}
