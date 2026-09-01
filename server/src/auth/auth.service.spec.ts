import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';

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
            create: jest.fn(),
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

  it('should register a user and return a signed token', async () => {
    const usersService = new (jest.requireActual('../users/users.service').UsersService)();
    const jwtService = {
      sign: jest.fn(() => 'signed-test-token'),
    };
    const auth = new AuthService(usersService as any, jwtService as any);

    const result = await auth.register({
      email: 'new.employee@company.com',
      password: 'StrongPass123!',
      role: 'EMPLOYEE',
    });

    expect(result.accessToken).toBeDefined();
    expect(result.user.email).toBe('new.employee@company.com');
    expect(result.user.password).toBeUndefined();
  });

  it('should reject duplicate email registration', async () => {
    const usersService = {
      findByEmail: jest.fn().mockReturnValue({ email: 'existing@company.com' }),
      create: jest.fn(),
    };

    const auth = new AuthService(usersService as any, { sign: jest.fn() } as any);

    await expect(
      auth.register({
        email: 'existing@company.com',
        password: 'StrongPass123!',
        role: 'EMPLOYEE',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('should reject login when password is wrong', async () => {
    const usersService = {
      findByEmail: jest.fn().mockReturnValue({
        id: 1,
        email: 'employee@company.com',
        password: '$2a$10$dummyHashValueForTest',
        role: 'EMPLOYEE',
      }),
    };

    const auth = new AuthService(usersService as any, { sign: jest.fn() } as any);

    await expect(
      auth.login({ email: 'employee@company.com', password: 'WrongPass123!' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
