import { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedRequest } from './auth.guard';
import { UnauthorizedException } from '@nestjs/common';
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
  const guard = new AuthGuard(
    { verifyAsync } as unknown as JwtService,
    { user: { findUnique } } as unknown as PrismaService,
  );
  beforeEach(() => {
    verifyAsync.mockResolvedValue({
      sub: 1,
      role: 'SUPER_ADMIN',
      sessionVersion: 0,
    });
    findUnique.mockResolvedValue({
      id: 1,
      role: 'EMPLOYEE',
      status: 'ACTIVE',
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
    { status: 'ACTIVE', sessionVersion: 1 },
  ])('rejects missing, inactive, and invalidated sessions', async (user) => {
    findUnique.mockResolvedValue(user);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
