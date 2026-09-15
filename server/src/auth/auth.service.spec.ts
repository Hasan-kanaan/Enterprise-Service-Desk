import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/user-role.enum';
import { ForbiddenException } from '@nestjs/common';

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            findByEmail: jest.fn(),
            hasSuperAdmin: jest.fn(),
            createInitialSuperAdmin: jest.fn(),
            create: jest.fn(),
            createRefreshToken: jest.fn(),
            findRefreshToken: jest.fn(),
            revokeRefreshToken: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn((payload) => `signed-${payload.email}-${payload.role}-${payload.sub}`),
          },
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  it('logs in an existing user and returns a signed token', async () => {
    const passwordHash = await bcrypt.hash('StrongPass123!', 10);
    const usersService = {
      findByEmail: jest.fn().mockResolvedValue({
        id: 1,
        username: 'adminuser',
        email: 'admin@company.com',
        password: passwordHash,
        role: UserRole.ADMIN,
      }),
      createRefreshToken: jest.fn().mockResolvedValue({}),
    };
    const jwtService = {
      sign: jest.fn(() => 'signed-test-token'),
    };
    const auth = new AuthService(usersService as any, jwtService as any);

    const result = await auth.login({
      email: 'admin@company.com',
      password: 'StrongPass123!',
    });

    expect(result.accessToken).toBe('signed-test-token');
    expect(result.user.role).toBe(UserRole.ADMIN);
    expect(result.user.username).toBe('adminuser');
  });

  it('rejects login when the password is wrong', async () => {
    const passwordHash = await bcrypt.hash('CorrectPass123!', 10);
    const usersService = {
      findByEmail: jest.fn().mockResolvedValue({
        id: 1,
        username: 'employee',
        email: 'employee@company.com',
        password: passwordHash,
        role: UserRole.EMPLOYEE,
      }),
      createRefreshToken: jest.fn().mockResolvedValue({}),
    };

    const auth = new AuthService(usersService as any, { sign: jest.fn() } as any);

    await expect(
      auth.login({ email: 'employee@company.com', password: 'WrongPass123!' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('defines all five account roles', () => {
    expect(Object.values(UserRole)).toEqual([
      'SUPER_ADMIN',
      'ADMIN',
      'MANAGER',
      'AGENT',
      'EMPLOYEE',
    ]);
  });

  it('reports setup as available when no SUPER_ADMIN exists', async () => {
    const usersService = {
      hasSuperAdmin: jest.fn().mockResolvedValue(false),
    };
    const auth = new AuthService(usersService as any, {} as any);

    await expect(auth.getSetupStatus()).resolves.toEqual({ available: true });
  });

  it('creates the initial SUPER_ADMIN through the provisioning service', async () => {
    const usersService = {
      createInitialSuperAdmin: jest.fn().mockResolvedValue({
        id: 1,
        username: 'rootadmin',
        email: 'root@company.com',
        role: UserRole.SUPER_ADMIN,
      }),
    };
    const auth = new AuthService(usersService as any, {} as any);

    await expect(
      auth.setup({
        username: 'RootAdmin',
        email: 'root@company.com',
        password: 'StrongPass123!',
      }),
    ).resolves.toMatchObject({
      user: { username: 'rootadmin', role: UserRole.SUPER_ADMIN },
    });

    expect(usersService.createInitialSuperAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'rootadmin', email: 'root@company.com' }),
    );
  });

  it('rejects setup after a SUPER_ADMIN already exists', async () => {
    const usersService = {
      createInitialSuperAdmin: jest.fn().mockResolvedValue(null),
    };
    const auth = new AuthService(usersService as any, {} as any);

    await expect(
      auth.setup({
        username: 'anotheradmin',
        email: 'another@company.com',
        password: 'StrongPass123!',
      }),
    ).rejects.toThrow('Initial setup has already been completed');
  });

  it('allows SUPER_ADMIN to create only ADMIN accounts', async () => {
    const usersService = {
      create: jest.fn().mockResolvedValue({
        id: 2,
        username: 'newadmin',
        email: 'admin2@company.com',
        role: UserRole.ADMIN,
      }),
    };
    const auth = new AuthService(usersService as any, {} as any);

    const result = await auth.createAccount(UserRole.SUPER_ADMIN, {
      username: 'NewAdmin',
      email: 'admin2@company.com',
      password: 'StrongPass123!',
      role: UserRole.ADMIN,
    });

    expect(result.user.role).toBe(UserRole.ADMIN);
    expect(usersService.create).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'newadmin', role: UserRole.ADMIN }),
    );
  });

  it('allows ADMIN to create employee, agent, and manager accounts', async () => {
    const usersService = {
      create: jest.fn().mockImplementation(async (data) => ({
        id: 2,
        username: data.username,
        email: data.email,
        role: data.role,
      })),
    };
    const auth = new AuthService(usersService as any, {} as any);

    for (const role of [UserRole.EMPLOYEE, UserRole.AGENT, UserRole.MANAGER]) {
      await expect(
        auth.createAccount(UserRole.ADMIN, {
          username: `new${role.toLowerCase()}`,
          email: `${role.toLowerCase()}@company.com`,
          password: 'StrongPass123!',
          role,
        }),
      ).resolves.toMatchObject({ user: { role } });
    }
  });

  it('rejects unauthorized account role creation', async () => {
    const auth = new AuthService({ create: jest.fn() } as any, {} as any);

    await expect(
      auth.createAccount(UserRole.ADMIN, {
        username: 'root2',
        email: 'root2@company.com',
        password: 'StrongPass123!',
        role: UserRole.SUPER_ADMIN,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rotates a valid refresh token', async () => {
    const usersService = {
      findRefreshToken: jest.fn().mockResolvedValue({
        id: 1,
        tokenHash: 'stored-hash',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        user: {
          id: 1,
          username: 'adminuser',
          email: 'admin@company.com',
          password: 'hash',
          role: UserRole.ADMIN,
        },
      }),
      revokeRefreshToken: jest.fn().mockResolvedValue(true),
      createRefreshToken: jest.fn().mockResolvedValue({}),
    };
    const jwtService = {
      verifyAsync: jest.fn().mockResolvedValue({ sub: 1 }),
      sign: jest.fn(() => 'new-access-token'),
    };
    const auth = new AuthService(usersService as any, jwtService as any);

    const result = await auth.refresh('valid-refresh-token');

    expect(result.accessToken).toBe('new-access-token');
    expect(result.refreshToken).toBeDefined();
    expect(usersService.revokeRefreshToken).toHaveBeenCalledWith(expect.any(String));
    expect(usersService.createRefreshToken).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1, tokenHash: expect.any(String) }),
    );
  });

  it('rejects a refresh token that was already revoked', async () => {
    const usersService = {
      findRefreshToken: jest.fn().mockResolvedValue({
        id: 1,
        tokenHash: 'stored-hash',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: new Date(),
        user: {},
      }),
    };
    const auth = new AuthService(
      usersService as any,
      { verifyAsync: jest.fn().mockResolvedValue({ sub: 1 }) } as any,
    );

    await expect(auth.refresh('revoked-refresh-token')).rejects.toThrow(
      'Invalid or expired refresh token',
    );
  });

  it('revokes a refresh token on logout', async () => {
    const usersService = {
      revokeRefreshToken: jest.fn().mockResolvedValue(true),
    };
    const auth = new AuthService(usersService as any, {} as any);

    await expect(auth.logout('refresh-token')).resolves.toEqual({
      message: 'Logged out successfully',
    });
    expect(usersService.revokeRefreshToken).toHaveBeenCalledWith(expect.any(String));
  });
});
