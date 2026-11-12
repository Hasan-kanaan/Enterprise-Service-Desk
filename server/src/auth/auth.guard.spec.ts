import { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedRequest } from './auth.guard';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from './auth.guard';

describe('Database-backed authentication', () => {
  const request: Pick<AuthenticatedRequest, 'headers' | 'user'> = {
    headers: { authorization: 'Bearer token' },
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  const verifyAsync = jest.fn();
  const findUnique = jest.fn();
  const findSession = jest.fn();
  const sid = '11111111-1111-4111-8111-111111111111';
  const guard = new AuthGuard(
    { verifyAsync } as unknown as JwtService,
    {
      user: { findUnique },
      userSession: { findFirst: findSession },
    } as unknown as PrismaService,
  );
  beforeEach(() => {
    request.headers.authorization = 'Bearer token';
    findSession.mockResolvedValue({ id: sid });
    verifyAsync.mockResolvedValue({
      sid,
      sub: 1,
      role: 'SUPER_ADMIN',
      sessionVersion: 0,
    });
    findUnique.mockResolvedValue({
      id: 1,
      role: 'EMPLOYEE',
      status: 'ACTIVE',
      activatedAt: new Date(),
      sessionVersion: 0,
    });
  });
  it('uses the current database role, never the JWT role', async () => {
    await guard.canActivate(context);
    expect(request.user?.role).toBe('EMPLOYEE');
  });
  it.each([
    null,
    { status: 'INACTIVE', sessionVersion: 0 },
    {
      status: 'ACTIVE',
      role: 'SUPER_ADMIN',
      activatedAt: null,
      sessionVersion: 0,
    },
    { status: 'ACTIVE', sessionVersion: 1 },
  ])('rejects missing, inactive, and invalidated sessions', async (user) => {
    findUnique.mockResolvedValue(user);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
  it('rejects a missing, revoked, or foreign session', async () => {
    findSession.mockResolvedValue(null);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(findSession).toHaveBeenCalledWith({
      where: { id: sid, userId: 1, revokedAt: null },
    });
  });
  it('rejects legacy tokens and malformed identity claims', async () => {
    for (const payload of [
      { sub: 1, sessionVersion: 0 },
      { sub: 1, sid },
      { sub: -1, sid, sessionVersion: 0 },
    ]) {
      verifyAsync.mockResolvedValue(payload);
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    }
  });
  it('returns 401 for missing credentials and invalid or expired JWTs', async () => {
    request.headers.authorization = undefined;
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    request.headers.authorization = 'Bearer token';
    for (const name of ['JsonWebTokenError', 'TokenExpiredError']) {
      const error = new Error('credential rejected');
      error.name = name;
      verifyAsync.mockRejectedValueOnce(error);
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    }
  });
  it('preserves password-change authorization as 403', async () => {
    findUnique.mockResolvedValue({
      id: 1,
      role: 'EMPLOYEE',
      status: 'ACTIVE',
      activatedAt: new Date(),
      sessionVersion: 0,
      passwordChangeRequired: true,
    });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
  it('propagates database and unexpected failures instead of labeling them 401', async () => {
    const databaseError = new Error('database unavailable');
    findUnique.mockRejectedValueOnce(databaseError);
    await expect(guard.canActivate(context)).rejects.toBe(databaseError);

    const jwtInfrastructureError = new Error('signing configuration failure');
    verifyAsync.mockRejectedValueOnce(jwtInfrastructureError);
    await expect(guard.canActivate(context)).rejects.toBe(
      jwtInfrastructureError,
    );
  });
});
