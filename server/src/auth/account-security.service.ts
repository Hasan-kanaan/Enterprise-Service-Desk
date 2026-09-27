import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { AccountActionType, UserRole } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  lockUser,
  requireActiveActor,
  serializable,
} from '../prisma/transactions';
import { assertPassword } from './password';
import { MailProvider, mailConfig, mailLogger } from './mail.provider';

export const actionHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');
const generic = 'If an eligible account exists, instructions have been sent.';
@Injectable()
export class AccountSecurityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailProvider,
  ) {}

  async issue(
    userId: number,
    type: AccountActionType,
    actor?: { id: number; role: UserRole; sessionVersion: number },
  ) {
    const raw = randomBytes(32).toString('base64url');
    const issued = await serializable(this.prisma, async (db) => {
      if (actor) {
        for (const id of [...new Set([actor.id, userId])].sort((a, b) => a - b))
          await lockUser(db, id);
        await requireActiveActor(db, actor);
      }
      const user = await lockUser(db, userId);
      if (actor) {
        const allowed =
          actor.role === 'SUPER_ADMIN'
            ? ['ADMIN', 'MANAGER', 'AGENT', 'EMPLOYEE']
            : actor.role === 'ADMIN'
              ? ['MANAGER', 'AGENT', 'EMPLOYEE']
              : [];
        if (!user || !allowed.includes(user.role))
          throw new ForbiddenException('No account management authority');
      }
      if (
        !user ||
        user.status !== 'ACTIVE' ||
        (type === 'ACCOUNT_ACTIVATION'
          ? !!user.activatedAt || !!user.password
          : !user.activatedAt || !user.password)
      )
        return null;
      const now = new Date();
      const recent = await db.accountActionToken.findFirst({
        where: {
          userId,
          type,
          createdAt: { gt: new Date(now.getTime() - 60000) },
        },
      });
      if (recent) return null;
      await db.accountActionToken.updateMany({
        where: { userId, type, usedAt: null, revokedAt: null },
        data: { revokedAt: now },
      });
      await db.accountActionToken.create({
        data: {
          userId,
          type,
          tokenHash: actionHash(raw),
          expiresAt: new Date(
            now.getTime() +
              (type === 'ACCOUNT_ACTIVATION' ? 86400000 : 1800000),
          ),
        },
      });
      return { email: user.email };
    });
    if (!issued) return 'NOT_SENT' as const;
    try {
      const link = `${mailConfig().url}/${type === 'ACCOUNT_ACTIVATION' ? 'activate' : 'reset-password'}#token=${raw}`;
      if (type === 'ACCOUNT_ACTIVATION')
        await this.mail.sendAccountActivation(issued.email, link);
      else await this.mail.sendPasswordReset(issued.email, link);
      return 'SENT' as const;
    } catch {
      mailLogger.warn(`Account mail delivery failed (${type})`);
      return 'FAILED' as const;
    }
  }

  async request(email: string, type: AccountActionType) {
    const started = Date.now();
    try {
      const user = await this.prisma.user.findUnique({
        where: { email: email.trim().toLowerCase() },
        select: { id: true },
      });
      if (user) await this.issue(user.id, type);
    } catch {
      mailLogger.warn('Account instructions request could not be completed');
    }
    // Equal minimum latency for missing, ineligible and cooldown cases.
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, 750 - (Date.now() - started))),
    );
    return {
      message:
        type === 'PASSWORD_RESET'
          ? 'If an eligible account exists, password reset instructions have been sent.'
          : generic,
    };
  }

  async consume(raw: string, newPassword: string, type: AccountActionType) {
    assertPassword(newPassword);
    if (!/^[A-Za-z0-9_-]{43}$/.test(raw))
      throw new BadRequestException('Invalid, expired or used link');
    const password = await bcrypt.hash(newPassword, 10);
    const email = await serializable(this.prisma, async (db) => {
      const token = await db.accountActionToken.findUnique({
        where: { tokenHash: actionHash(raw) },
      });
      const invalid = () =>
        new BadRequestException('Invalid, expired or used link');
      if (!token || token.type !== type) throw invalid();
      const user = await lockUser(db, token.userId);
      if (
        !user ||
        user.status !== 'ACTIVE' ||
        (type === 'ACCOUNT_ACTIVATION'
          ? !!user.activatedAt || !!user.password
          : !user.activatedAt || !user.password)
      )
        throw invalid();
      const now = new Date();
      const consumed = await db.accountActionToken.updateMany({
        where: {
          id: token.id,
          type,
          usedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) throw invalid();
      await db.user.update({
        where: { id: user.id },
        data: {
          password,
          passwordChangeRequired: false,
          sessionVersion: { increment: 1 },
          ...(type === 'ACCOUNT_ACTIVATION'
            ? { activatedAt: now, emailVerifiedAt: now }
            : {}),
        },
      });
      await db.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: now },
      });
      await db.accountActionToken.updateMany({
        where: { userId: user.id, usedAt: null, revokedAt: null },
        data: { revokedAt: now },
      });
      return user.email;
    });
    if (type === 'PASSWORD_RESET') await this.passwordChanged(email);
    return { message: 'Password saved. Sign in to continue.' };
  }

  async passwordChanged(email: string) {
    try {
      await this.mail.sendPasswordChanged(email);
    } catch {
      mailLogger.warn('Password changed notice delivery failed');
    }
  }
}
