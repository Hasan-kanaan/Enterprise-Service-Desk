import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  Injectable,
} from '@nestjs/common';
import {
  Prisma,
  UserRole as PrismaUserRole,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from './user-role.enum';
import { UserStatus } from '../../generated/prisma/client';
import { after, listPage, listWindow } from '../common/list-query';
import { ListUsersDto } from './dto/list-users.dto';
import {
  lockUser,
  operationalStatuses,
  requireActiveActor,
  serializable,
} from '../prisma/transactions';

export type RefreshTokenRecord = {
  id: number;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  user: UserRecord;
};

export type UserRecord = {
  id: number;
  username: string;
  email: string;
  password: string;
  role: UserRole;
  status: UserStatus;
  sessionVersion: number;
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async updateStatus(
    actor: { id: number; role: PrismaUserRole; sessionVersion?: number },
    targetId: number,
    status: UserStatus,
  ) {
    return serializable(this.prisma, async (db) => {
      // Lock user identities in a stable order. Ticket writers may conflict with
      // offboarding; Serializable aborts the entire stale operation, never a part.
      for (const id of [...new Set([actor.id, targetId])].sort((a, b) => a - b))
        await lockUser(db, id);
      await requireActiveActor(db, actor);
      const target = await db.user.findUnique({ where: { id: targetId } });
      if (!target) throw new NotFoundException('User not found');
      const allowed =
        actor.role === 'SUPER_ADMIN'
          ? ['ADMIN', 'MANAGER', 'AGENT', 'EMPLOYEE']
          : actor.role === 'ADMIN'
            ? ['MANAGER', 'AGENT', 'EMPLOYEE']
            : [];
      if (!allowed.includes(target.role))
        throw new ForbiddenException('No lifecycle authority for this account');
      if (target.status === status)
        return { id: target.id, status: target.status };
      if (status === 'INACTIVE') {
        const tickets = await db.ticket.findMany({
          where: {
            status: { in: [...operationalStatuses] },
            OR: [
              { assignedManagerId: targetId },
              { assignedAgentId: targetId },
              {
                subtasks: {
                  some: {
                    assignedAgentId: targetId,
                    status: { in: ['TODO', 'IN_PROGRESS'] },
                    createdInCycle: { outcome: null },
                  },
                },
              },
            ],
          },
          select: { id: true },
          orderBy: { id: 'asc' },
        });
        for (const ticket of tickets) {
          await db.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${ticket.id} FOR UPDATE`;
          const current = await db.ticket.findUniqueOrThrow({
            where: { id: ticket.id },
            include: {
              workCycles: { orderBy: { sequenceNumber: 'desc' }, take: 1 },
            },
          });
          if (
            !(operationalStatuses as readonly string[]).includes(current.status)
          )
            continue;
          if (current.assignedManagerId === targetId) {
            await db.ticket.update({
              where: { id: current.id },
              data: {
                status: 'NEW',
                assignedManagerId: null,
                assignedTeamId: null,
                assignedAgentId: null,
              },
            });
          } else if (current.assignedAgentId === targetId) {
            await db.ticket.update({
              where: { id: current.id },
              data: { assignedAgentId: null },
            });
          }
          const cycle = current.workCycles[0];
          if (cycle && cycle.outcome === null)
            await db.subtask.updateMany({
              where: {
                ticketId: current.id,
                createdInCycleId: cycle.id,
                assignedAgentId: targetId,
                status: { in: ['TODO', 'IN_PROGRESS'] },
              },
              data: { assignedAgentId: null },
            });
        }
        await db.team.updateMany({
          where: { teamLeadId: targetId },
          data: { teamLeadId: null },
        });
        await db.teamManager.deleteMany({ where: { managerId: targetId } });
        await db.refreshToken.updateMany({
          where: { userId: targetId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      // No operational records or counts are returned to administrators.
      return db.user.update({
        where: { id: targetId },
        data: {
          status,
          ...(status === 'INACTIVE'
            ? { sessionVersion: { increment: 1 } }
            : {}),
        },
        select: { id: true, status: true },
      });
    });
  }

  async issueSession(
    userId: number,
    expectedVersion: number,
    tokenHash: string,
    expiresAt: Date,
    consumedHash?: string,
  ) {
    return serializable(this.prisma, async (db) => {
      const user = await lockUser(db, userId);
      if (
        !user ||
        user.status !== 'ACTIVE' ||
        user.sessionVersion !== expectedVersion
      )
        throw new UnauthorizedException(
          'Account or session is no longer active',
        );
      if (consumedHash) {
        const consumed = await db.refreshToken.updateMany({
          where: {
            tokenHash: consumedHash,
            userId,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: { revokedAt: new Date() },
        });
        if (consumed.count !== 1)
          throw new UnauthorizedException('Invalid or expired refresh token');
      }
      await db.refreshToken.create({ data: { userId, tokenHash, expiresAt } });
      return user;
    });
  }

  async hasSuperAdmin(): Promise<boolean> {
    const user = await this.prisma.user.findFirst({
      where: { role: PrismaUserRole.SUPER_ADMIN },
      select: { id: true },
    });

    return user !== null;
  }

  async createInitialSuperAdmin(data: {
    username: string;
    email: string;
    password: string;
  }): Promise<Omit<UserRecord, 'password'> | null> {
    const normalizedUsername = data.username.trim().toLowerCase();
    const normalizedEmail = data.email.trim().toLowerCase();

    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(783421)`.then(
        () => undefined,
      );

      const existingSuperAdmin = await transaction.user.findFirst({
        where: { role: PrismaUserRole.SUPER_ADMIN },
        select: { id: true },
      });

      if (existingSuperAdmin) {
        return null;
      }

      try {
        const user = await transaction.user.create({
          data: {
            username: normalizedUsername,
            email: normalizedEmail,
            password: data.password,
            role: PrismaUserRole.SUPER_ADMIN,
          },
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
            status: true,
            sessionVersion: true,
          },
        });

        return { ...user, role: user.role as UserRole };
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new ConflictException(
            'User with this email or username already exists',
          );
        }

        throw error;
      }
    });
  }

  async findAll(query: ListUsersDto = {}) {
    const { limit, position, search } = listWindow(query, false);
    const users = await this.prisma.user.findMany({
      where: {
        AND: [
          after(position),
          query.role ? { role: query.role } : {},
          query.status ? { status: query.status } : {},
          search
            ? {
                OR: [
                  { username: { contains: search, mode: 'insensitive' } },
                  { email: { contains: search, mode: 'insensitive' } },
                ],
              }
            : {},
        ],
      },
      orderBy: { id: 'desc' },
      take: limit + 1,
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        status: true,
        sessionVersion: true,
        region: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      },
    });

    return listPage(users, limit, false);
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const normalized = email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email: normalized },
      select: {
        id: true,
        username: true,
        email: true,
        password: true,
        role: true,
        status: true,
        sessionVersion: true,
      },
    });

    return user ? { ...user, role: user.role as UserRole } : null;
  }

  async findByUsername(username: string): Promise<UserRecord | null> {
    const normalized = username.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { username: normalized },
      select: {
        id: true,
        username: true,
        email: true,
        password: true,
        role: true,
        status: true,
        sessionVersion: true,
      },
    });

    return user ? { ...user, role: user.role as UserRole } : null;
  }

  async create(data: {
    username: string;
    email: string;
    password: string;
    role: UserRole;
  }): Promise<Omit<UserRecord, 'password'>> {
    const normalizedUsername = data.username.trim().toLowerCase();
    const normalizedEmail = data.email.trim().toLowerCase();

    if (
      (await this.findByEmail(normalizedEmail)) ||
      (await this.findByUsername(normalizedUsername))
    ) {
      throw new ConflictException(
        'User with this email or username already exists',
      );
    }

    try {
      return await this.prisma.user
        .create({
          data: {
            username: normalizedUsername,
            email: normalizedEmail,
            password: data.password,
            role: data.role,
          },
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
            status: true,
            sessionVersion: true,
          },
        })
        .then((user) => ({ ...user, role: user.role as UserRole }));
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'User with this email or username already exists',
        );
      }

      throw error;
    }
  }

  async findRefreshToken(
    tokenHash: string,
  ): Promise<RefreshTokenRecord | null> {
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    return token
      ? {
          id: token.id,
          tokenHash: token.tokenHash,
          expiresAt: token.expiresAt,
          revokedAt: token.revokedAt,
          user: { ...token.user, role: token.user.role as UserRole },
        }
      : null;
  }

  async revokeRefreshToken(tokenHash: string): Promise<boolean> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return result.count > 0;
  }
}
