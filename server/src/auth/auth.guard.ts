import {
  CanActivate,
  ForbiddenException,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { jwtConstants } from './auth.constants';

export type AuthenticatedRequest = Request & {
  user?: {
    sub: number;
    sid: string;
    username: string;
    displayName?: string | null;
    jobTitle?: string | null;
    email: string;
    role: import('../../generated/prisma/client').UserRole;
    status: string;
    sessionVersion: number;
    passwordChangeRequired: boolean;
  };
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = request.headers.authorization;

    if (!authHeader || typeof authHeader !== 'string') {
      throw new UnauthorizedException('Missing authorization header');
    }

    const [type, token] = authHeader.split(' ');

    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Invalid authorization header format');
    }

    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: number;
        sid?: string;
        sessionVersion?: number;
      }>(token, {
        secret: jwtConstants.secret,
      });

      if (
        !Number.isInteger(payload.sub) ||
        payload.sub < 1 ||
        typeof payload.sid !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          payload.sid,
        ) ||
        !Number.isInteger(payload.sessionVersion)
      )
        throw new UnauthorizedException();
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          username: true,
          displayName: true,
          jobTitle: true,
          email: true,
          role: true,
          status: true,
          activatedAt: true,
          sessionVersion: true,
          passwordChangeRequired: true,
        },
      });
      if (
        !user ||
        user.status !== 'ACTIVE' ||
        !user.activatedAt ||
        user.sessionVersion !== (payload.sessionVersion ?? 0)
      )
        throw new UnauthorizedException();
      const session = await this.prisma.userSession.findFirst({
        where: { id: payload.sid, userId: user.id, revokedAt: null },
      });
      if (!session) throw new UnauthorizedException();
      request.user = {
        sid: session.id,
        sub: user.id,
        username: user.username,
        displayName: user.displayName,
        jobTitle: user.jobTitle,
        email: user.email,
        role: user.role,
        status: user.status,
        sessionVersion: user.sessionVersion,
        passwordChangeRequired: user.passwordChangeRequired,
      };
      const path = request.path?.toLowerCase().replace(/\/+$/, '');
      if (
        user.passwordChangeRequired &&
        !(
          (request.method === 'POST' && path === '/auth/password') ||
          (request.method === 'GET' && path === '/users/profile')
        )
      )
        throw new ForbiddenException('Change your password before continuing');
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
