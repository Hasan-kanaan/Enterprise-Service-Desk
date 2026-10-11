import { AccountSecurityService } from './account-security.service';
const accountSecurity = {
  issue: jest.fn().mockResolvedValue('SENT'),
} as unknown as AccountSecurityService;
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/user-role.enum';
import { ForbiddenException } from '@nestjs/common';

describe('AuthService', () => {
  beforeAll(() => {
    process.env.INITIAL_SETUP_SECRET =
      'test-bootstrap-9xQ4rT7vB2nM6pL8-fixture';
  });
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: AccountSecurityService, useValue: accountSecurity },
        {
          provide: UsersService,
          useValue: {
            findByEmail: jest.fn(),
            hasActivatedSuperAdmin: jest.fn(),
            create: jest.fn(),
            createRefreshToken: jest.fn(),
            findRefreshToken: jest.fn(),
            revokeRefreshToken: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(
              (payload: { email: string; role: UserRole; sub: number }) =>
                `signed-${payload.email}-${payload.role}-${payload.sub}`,
            ),
          },
        },
      ],
    }).compile();

    module.get<AuthService>(AuthService);
  });

  it('logs in an existing user and returns a signed token', async () => {
    const passwordHash = await bcrypt.hash('StrongPass123!', 10);
    const usersService = {
      findByEmail: jest.fn().mockResolvedValue({
        id: 1,
        displayName: 'Test Person',
        jobTitle: 'Test Job',

        email: 'admin@company.com',
        password: passwordHash,
        status: 'ACTIVE',
        activatedAt: new Date(),
        sessionVersion: 0,
        role: UserRole.ADMIN,
      }),
      issueSession: jest.fn().mockResolvedValue({
        sid: '11111111-1111-4111-8111-111111111111',
        id: 1,
        displayName: 'Test Person',
        jobTitle: 'Test Job',

        email: 'admin@company.com',
        role: UserRole.ADMIN,
        status: 'ACTIVE',
        activatedAt: new Date(),
        sessionVersion: 0,
      }),
    };
    const jwtService = {
      sign: jest.fn(() => 'signed-test-token'),
    };
    const auth = new AuthService(
      usersService as unknown as UsersService,
      jwtService as unknown as JwtService,
      accountSecurity,
    );

    const result = await auth.login({
      email: 'admin@company.com',
      password: 'StrongPass123!',
    });

    expect(result.accessToken).toBe('signed-test-token');
    expect(jwtService.sign).toHaveBeenCalledWith({
      sub: 1,
      sid: '11111111-1111-4111-8111-111111111111',
      sessionVersion: 0,
    });
    expect(result.user.role).toBe(UserRole.ADMIN);
    expect(result.user.displayName).toBe('Test Person');
  });

  it('rejects login when the password is wrong', async () => {
    const passwordHash = await bcrypt.hash('CorrectPass123!', 10);
    const usersService = {
      findByEmail: jest.fn().mockResolvedValue({
        id: 1,
        displayName: 'Test Person',
        jobTitle: 'Test Job',

        email: 'employee@company.com',
        password: passwordHash,
        status: 'ACTIVE',
        activatedAt: new Date(),
        sessionVersion: 0,
        role: UserRole.EMPLOYEE,
      }),
      issueSession: jest.fn().mockResolvedValue({
        sid: '11111111-1111-4111-8111-111111111111',
        id: 1,
        displayName: 'Test Person',
        jobTitle: 'Test Job',

        email: 'admin@company.com',
        role: UserRole.ADMIN,
        status: 'ACTIVE',
        activatedAt: new Date(),
        sessionVersion: 0,
      }),
    };

    const auth = new AuthService(
      usersService as unknown as UsersService,
      { sign: jest.fn() } as unknown as JwtService,
      accountSecurity,
    );

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

  it.each([false, true])(
    'reports setup availability from activated root existence: %s',
    async (exists) => {
      const usersService = {
        hasActivatedSuperAdmin: jest.fn().mockResolvedValue(exists),
      };
      const auth = new AuthService(
        usersService as unknown as UsersService,
        {} as unknown as JwtService,
        accountSecurity,
      );

      await expect(auth.getSetupStatus()).resolves.toEqual({
        available: !exists,
      });
    },
  );

  it('requires the secret before delegating pending setup to account security', async () => {
    const bootstrap = jest.fn().mockResolvedValue({ delivery: 'SENT' });
    const auth = new AuthService(
      {} as UsersService,
      {} as JwtService,
      { bootstrap } as unknown as AccountSecurityService,
    );
    const input = {
      setupSecret: 'wrong',
      displayName: 'Root',
      jobTitle: 'Operator',

      email: 'root@example.test',
    };
    await expect(auth.setup(input)).rejects.toBeInstanceOf(ForbiddenException);
    expect(bootstrap).not.toHaveBeenCalled();
    await expect(
      auth.setup({ ...input, setupSecret: process.env.INITIAL_SETUP_SECRET! }),
    ).resolves.toEqual({ delivery: 'SENT' });
    expect(bootstrap).toHaveBeenCalledTimes(1);
  });

  it.each([
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.AGENT,
    UserRole.EMPLOYEE,
  ])('allows SUPER_ADMIN to create %s', async (role) => {
    const users = {
      create: jest
        .fn<Promise<unknown>, [Parameters<UsersService['create']>[0]]>()
        .mockImplementation((data: Parameters<UsersService['create']>[0]) =>
          Promise.resolve({
            ...data,
            password: undefined,
            id: 2,
          }),
        ),
    };
    const auth = new AuthService(
      users as unknown as UsersService,
      {} as unknown as JwtService,
      accountSecurity,
    );
    const result = await auth.createAccount(UserRole.SUPER_ADMIN, {
      displayName: 'Test Person',
      jobTitle: 'Test Job',

      email: 'new@company.test',
      role,
    });
    expect(result.user.role).toBe(role);
    expect(users.create).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: 'Test Person', role }),
    );
    expect(users.create.mock.calls[0][0]).not.toHaveProperty('password');
    expect(result.delivery).toBe('SENT');
  });

  it('never provisions SUPER_ADMIN or lets operational users provision accounts', async () => {
    const create = jest.fn();
    const auth = new AuthService(
      { create } as unknown as UsersService,
      {} as unknown as JwtService,
      accountSecurity,
    );
    for (const [caller, role] of [
      [UserRole.SUPER_ADMIN, UserRole.SUPER_ADMIN],
      [UserRole.ADMIN, UserRole.ADMIN],
      [UserRole.MANAGER, UserRole.EMPLOYEE],
      [UserRole.AGENT, UserRole.EMPLOYEE],
      [UserRole.EMPLOYEE, UserRole.EMPLOYEE],
    ]) {
      await expect(
        auth.createAccount(caller, {
          displayName: 'Test Person',
          jobTitle: 'Test Job',

          email: 'someone@test.invalid',
          role,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    }
    expect(create).not.toHaveBeenCalled();
  });

  it('allows ADMIN to create employee, agent, and manager accounts', async () => {
    const usersService = {
      create: jest
        .fn()
        .mockImplementation((data: Parameters<UsersService['create']>[0]) =>
          Promise.resolve({
            id: 2,
            displayName: 'Test Person',
            jobTitle: 'Test Job',

            email: data.email,
            role: data.role,
          }),
        ),
    };
    const auth = new AuthService(
      usersService as unknown as UsersService,
      {} as unknown as JwtService,
      accountSecurity,
    );

    for (const role of [UserRole.EMPLOYEE, UserRole.AGENT, UserRole.MANAGER]) {
      await expect(
        auth.createAccount(UserRole.ADMIN, {
          displayName: 'Test Person',
          jobTitle: 'Test Job',

          email: `${role.toLowerCase()}@company.com`,
          role,
        }),
      ).resolves.toMatchObject({ user: { role } });
    }
  });

  it('rejects unauthorized account role creation', async () => {
    const auth = new AuthService(
      { create: jest.fn() } as unknown as UsersService,
      {} as unknown as JwtService,
      accountSecurity,
    );

    await expect(
      auth.createAccount(UserRole.ADMIN, {
        displayName: 'Test Person',
        jobTitle: 'Test Job',

        email: 'root2@company.com',
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
          displayName: 'Test Person',
          jobTitle: 'Test Job',

          email: 'admin@company.com',
          password: 'hash',
          status: 'ACTIVE',
          activatedAt: new Date(),
          sessionVersion: 0,
          role: UserRole.ADMIN,
        },
      }),
      revokeRefreshToken: jest.fn().mockResolvedValue(true),
      issueSession: jest.fn().mockResolvedValue({
        sid: '11111111-1111-4111-8111-111111111111',
        id: 1,
        displayName: 'Test Person',
        jobTitle: 'Test Job',

        email: 'admin@company.com',
        role: UserRole.ADMIN,
        status: 'ACTIVE',
        activatedAt: new Date(),
        sessionVersion: 0,
      }),
    };
    const jwtService = {
      verifyAsync: jest.fn().mockResolvedValue({ sub: 1 }),
      sign: jest.fn(() => 'new-access-token'),
    };
    const auth = new AuthService(
      usersService as unknown as UsersService,
      jwtService as unknown as JwtService,
      accountSecurity,
    );

    const result = await auth.refresh('valid-refresh-token');

    expect(result.accessToken).toBe('new-access-token');
    expect(result.refreshToken).toBeDefined();
    expect(usersService.issueSession).toHaveBeenCalledWith(
      1,
      0,
      expect.any(String),
      expect.any(Date),
      expect.any(String),
      undefined,
    );
    expect(usersService.revokeRefreshToken).not.toHaveBeenCalled();
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
      usersService as unknown as UsersService,
      {
        verifyAsync: jest.fn().mockResolvedValue({ sub: 1 }),
      } as unknown as JwtService,
      accountSecurity,
    );

    await expect(auth.refresh('revoked-refresh-token')).rejects.toThrow(
      'Invalid or expired refresh token',
    );
  });

  it('revokes a refresh token on logout', async () => {
    const usersService = {
      revokeRefreshToken: jest.fn().mockResolvedValue(true),
    };
    const auth = new AuthService(
      usersService as unknown as UsersService,
      {} as unknown as JwtService,
      accountSecurity,
    );

    await expect(auth.logout('refresh-token')).resolves.toEqual({
      message: 'Logged out successfully',
    });
    expect(usersService.revokeRefreshToken).toHaveBeenCalledWith(
      expect.any(String),
    );
  });
});
