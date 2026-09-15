import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, UserRole as PrismaUserRole } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from './user-role.enum';

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
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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
          select: { id: true, username: true, email: true, role: true },
        });

        return { ...user, role: user.role as UserRole };
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new ConflictException('User with this email or username already exists');
        }

        throw error;
      }
    });
  }

  async findAll() {
    const users = await this.prisma.user.findMany({
      select: { id: true, username: true, email: true, role: true },
    });

    return users;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const normalized = email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email: normalized },
      select: { id: true, username: true, email: true, password: true, role: true },
    });

    return user ? { ...user, role: user.role as UserRole } : null;
  }

  async findByUsername(username: string): Promise<UserRecord | null> {
    const normalized = username.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { username: normalized },
      select: { id: true, username: true, email: true, password: true, role: true },
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
      throw new ConflictException('User with this email or username already exists');
    }

    try {
      return await this.prisma.user.create({
        data: {
          username: normalizedUsername,
          email: normalizedEmail,
          password: data.password,
          role: data.role as PrismaUserRole,
        },
        select: { id: true, username: true, email: true, role: true },
      }).then((user) => ({ ...user, role: user.role as UserRole }));
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('User with this email or username already exists');
      }

      throw error;
    }
  }

  async createRefreshToken(data: {
    userId: number;
    tokenHash: string;
    expiresAt: Date;
  }) {
    return this.prisma.refreshToken.create({ data });
  }

  async findRefreshToken(tokenHash: string): Promise<RefreshTokenRecord | null> {
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
