import {
  BadRequestException,
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
import { UpdateUserMetadataDto } from './dto/update-user-metadata.dto';
import * as bcrypt from 'bcryptjs';
import { assertPassword } from '../auth/password';
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
  password: string | null;
  activatedAt: Date | null;
  role: UserRole;
  status: UserStatus;
  sessionVersion: number;
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async updateMetadata(
    actor: {
      id: number;
      role: PrismaUserRole;
      sessionVersion: number;
      sid: string;
    },
    targetId: number,
    change: UpdateUserMetadataDto,
  ) {
    if (
      !['username', 'phoneNumber', 'regionId', 'departmentId'].some(
        (key) => change[key as keyof UpdateUserMetadataDto] !== undefined,
      )
    )
      throw new BadRequestException(
        'Provide at least one account metadata field',
      );
    try {
      return await serializable(this.prisma, async (db) => {
        for (const id of [...new Set([actor.id, targetId])].sort(
          (a, b) => a - b,
        ))
          await lockUser(db, id);
        await requireActiveActor(db, actor);
        await db.$queryRaw`SELECT id FROM "UserSession" WHERE id = ${actor.sid} FOR SHARE`;
        if (
          !(await db.userSession.findFirst({
            where: { id: actor.sid, userId: actor.id, revokedAt: null },
            select: { id: true },
          }))
        )
          throw new UnauthorizedException(
            'Account or session is no longer active',
          );
        const target = await db.user.findUnique({ where: { id: targetId } });
        if (!target) throw new NotFoundException('User not found');
        const allowed =
          actor.role === 'SUPER_ADMIN'
            ? ['ADMIN', 'MANAGER', 'AGENT', 'EMPLOYEE']
            : actor.role === 'ADMIN'
              ? ['MANAGER', 'AGENT', 'EMPLOYEE']
              : [];
        if (!allowed.includes(target.role))
          throw new ForbiddenException(
            'No metadata authority for this account',
          );
        // Only changed destinations require active eligibility. Retained archived
        // home references remain descriptive metadata, with no work reconciliation.
        if (change.regionId != null && change.regionId !== target.regionId) {
          await db.$queryRaw`SELECT id FROM "Region" WHERE id = ${change.regionId} FOR UPDATE`;
          const region = await db.region.findUnique({
            where: { id: change.regionId },
          });
          if (!region) throw new NotFoundException('Region not found');
          if (region.archivedAt)
            throw new ConflictException('Region is archived');
        }
        if (
          change.departmentId != null &&
          change.departmentId !== target.departmentId
        ) {
          await db.$queryRaw`SELECT id FROM "Department" WHERE id = ${change.departmentId} FOR UPDATE`;
          const department = await db.department.findUnique({
            where: { id: change.departmentId },
          });
          if (!department) throw new NotFoundException('Department not found');
          if (department.archivedAt)
            throw new ConflictException('Department is archived');
        }
        const data: Prisma.UserUncheckedUpdateInput = {};
        if (
          change.username !== undefined &&
          change.username !== target.username
        )
          data.username = change.username;
        if (
          change.phoneNumber !== undefined &&
          change.phoneNumber !== target.phoneNumber
        ) {
          data.phoneNumber = change.phoneNumber;
          data.phoneVerifiedAt = null;
        } else if (
          change.phoneNumber === null &&
          target.phoneVerifiedAt !== null
        )
          data.phoneVerifiedAt = null;
        if (
          change.regionId !== undefined &&
          change.regionId !== target.regionId
        )
          data.regionId = change.regionId;
        if (
          change.departmentId !== undefined &&
          change.departmentId !== target.departmentId
        )
          data.departmentId = change.departmentId;
        const select = {
          id: true,
          username: true,
          email: true,
          role: true,
          status: true,
          activatedAt: true,
          phoneNumber: true,
          region: { select: { id: true, name: true, archivedAt: true } },
          department: { select: { id: true, name: true, archivedAt: true } },
        } satisfies Prisma.UserSelect;
        return Object.keys(data).length
          ? db.user.update({ where: { id: targetId }, data, select })
          : db.user.findUniqueOrThrow({ where: { id: targetId }, select });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('Username already exists');
      throw error;
    }
  }

  async changePassword(
    actor: { id: number; role: PrismaUserRole; sessionVersion: number },
    targetId: number,
    newPassword: string,
    currentPassword?: string,
  ) {
    assertPassword(newPassword);
    if (currentPassword !== undefined) assertPassword(currentPassword, 1);
    const password = await bcrypt.hash(newPassword, 10);
    return serializable(this.prisma, async (db) => {
      for (const id of [...new Set([actor.id, targetId])].sort((a, b) => a - b))
        await lockUser(db, id);
      await requireActiveActor(db, actor);
      const target = await db.user.findUnique({ where: { id: targetId } });
      if (!target) throw new NotFoundException('User not found');
      if (currentPassword !== undefined) {
        if (
          actor.id !== targetId ||
          !target.password ||
          !(await bcrypt.compare(currentPassword, target.password))
        )
          throw new BadRequestException('Current password is incorrect');
        if (await bcrypt.compare(newPassword, target.password))
          throw new BadRequestException('Choose a different new password');
      } else {
        throw new ForbiddenException('Use a password reset email');
      }
      await db.user.update({
        where: { id: targetId },
        data: {
          password,
          passwordChangeRequired: false,
          sessionVersion: { increment: 1 },
        },
      });
      await db.userSession.updateMany({
        where: { userId: targetId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await db.refreshToken.updateMany({
        where: { userId: targetId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await db.accountActionToken.updateMany({
        where: { userId: targetId, usedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return { message: 'Password updated. Sign in again.' };
    });
  }

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
        await db.userSession.updateMany({
          where: { userId: targetId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
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
    deviceLabel?: string,
  ) {
    return serializable(this.prisma, async (db) => {
      const user = await lockUser(db, userId);
      if (
        !user ||
        user.status !== 'ACTIVE' ||
        !user.activatedAt ||
        !user.password ||
        user.sessionVersion !== expectedVersion
      )
        throw new UnauthorizedException(
          'Account or session is no longer active',
        );
      let sid: string;
      if (consumedHash) {
        const previous = await db.refreshToken.findUnique({
          where: { tokenHash: consumedHash },
          include: { session: true },
        });
        if (
          !previous?.session ||
          previous.session.userId !== userId ||
          previous.session.revokedAt
        )
          throw new UnauthorizedException('Invalid or expired refresh token');
        sid = previous.session.id;
        await db.userSession.updateMany({
          where: { id: sid, lastUsedAt: { lt: new Date(Date.now() - 60000) } },
          data: { lastUsedAt: new Date() },
        });
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
      } else {
        sid = (await db.userSession.create({ data: { userId, deviceLabel } }))
          .id;
      }
      await db.refreshToken.create({
        data: { userId, tokenHash, expiresAt, sessionId: sid },
      });
      return { ...user, sid };
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
            activatedAt: new Date(),
            role: PrismaUserRole.SUPER_ADMIN,
          },
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
            status: true,
            sessionVersion: true,
            activatedAt: true,
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
        activatedAt: true,
        phoneNumber: true,
        region: { select: { id: true, name: true, archivedAt: true } },
        department: { select: { id: true, name: true, archivedAt: true } },
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
        activatedAt: true,
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
        activatedAt: true,
      },
    });

    return user ? { ...user, role: user.role as UserRole } : null;
  }

  async create(data: {
    username: string;
    email: string;
    phoneNumber?: string;
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
            phoneNumber: data.phoneNumber,
            role: data.role,
          },
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
            status: true,
            sessionVersion: true,
            activatedAt: true,
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
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });
    if (!token?.sessionId) return false;
    await this.revokeSessions(token.userId, token.sessionId);
    return true;
  }

  async listSessions(userId: number, sid: string) {
    const sessions = await this.prisma.userSession.findMany({
      where: {
        userId,
        revokedAt: null,
        refreshTokens: {
          some: { revokedAt: null, expiresAt: { gt: new Date() } },
        },
      },
      select: {
        id: true,
        createdAt: true,
        lastUsedAt: true,
        deviceLabel: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return sessions.map((session) => ({
      ...session,
      current: session.id === sid,
    }));
  }

  async revokeSessions(
    userId: number,
    sid: string,
    others = false,
    currentSid?: string,
  ) {
    return serializable(this.prisma, async (db) => {
      await lockUser(db, userId);
      if (
        currentSid &&
        !(await db.userSession.findFirst({
          where: { id: currentSid, userId, revokedAt: null },
        }))
      )
        throw new UnauthorizedException();
      const where = { userId, id: others ? { not: sid } : sid };
      if (!others && !(await db.userSession.findFirst({ where })))
        throw new NotFoundException('Session not found');
      await db.userSession.updateMany({
        where: { ...where, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await db.refreshToken.updateMany({
        where: { userId, session: where, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return { message: 'Sessions revoked' };
    });
  }
}
