import { mailLogger } from './mail.provider';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { RateLimiter } from '../security/rate-limiter';
import { positiveInteger } from '../security/security.config';
import { initialSetupSecret } from '../security/security.config';
import { AccountSecurityService } from './account-security.service';
import { assertPassword } from './password';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { SetupDto } from './dto/setup.dto';
import { CreateAccountDto } from './dto/create-account.dto';
import { UserRole } from '../users/user-role.enum';

// Same cost as stored passwords; missing/inactive accounts still perform a comparison.
const dummyPasswordHash = bcrypt.hashSync(
  'unused-login-timing-placeholder',
  10,
);

@Injectable()
export class AuthService {
  private readonly loginLimiter = new RateLimiter(
    positiveInteger(process.env, 'RATE_LIMIT_MAX_KEYS', 10000),
  );
  private readonly loginPolicy = {
    limit: positiveInteger(process.env, 'RATE_LIMIT_LOGIN_ACCOUNT_MAX', 10),
    windowMs: positiveInteger(
      process.env,
      'RATE_LIMIT_LOGIN_ACCOUNT_WINDOW_MS',
      600000,
    ),
  };

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly accountSecurity: AccountSecurityService,
  ) {}

  async getSetupStatus() {
    const hasSuperAdmin = await this.usersService.hasSuperAdmin();

    return { available: !hasSuperAdmin };
  }

  async setup(dto: SetupDto) {
    const expected = createHash('sha256').update(initialSetupSecret()).digest();
    const supplied = createHash('sha256')
      .update(dto.setupSecret ?? '')
      .digest();
    if (!timingSafeEqual(expected, supplied))
      throw new ForbiddenException('Invalid setup credentials');
    assertPassword(dto.password);
    const username = dto.username?.trim().toLowerCase();
    const email = dto.email?.trim().toLowerCase();
    const password = dto.password;

    if (!username || !email || !password) {
      throw new BadRequestException(
        'Username, email, and password are required',
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.usersService.createInitialSuperAdmin({
      username,
      email,
      password: passwordHash,
    });

    if (!user) {
      throw new ConflictException('Initial setup has already been completed');
    }

    return {
      message: 'Initial SUPER_ADMIN setup completed',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    };
  }

  async createAccount(callerRole: UserRole, dto: CreateAccountDto) {
    const allowedRoles =
      callerRole === UserRole.SUPER_ADMIN
        ? [UserRole.ADMIN, UserRole.MANAGER, UserRole.AGENT, UserRole.EMPLOYEE]
        : callerRole === UserRole.ADMIN
          ? [UserRole.EMPLOYEE, UserRole.AGENT, UserRole.MANAGER]
          : [];

    if (!allowedRoles.includes(dto.role)) {
      throw new ForbiddenException(
        'You do not have permission to create this role',
      );
    }

    const username = dto.username.trim().toLowerCase();
    const email = dto.email.trim().toLowerCase();

    const user = await this.usersService.create({
      username,
      email,
      phoneNumber: dto.phoneNumber,
      role: dto.role,
    });

    let delivery: 'SENT' | 'FAILED' | 'NOT_SENT';
    try {
      delivery = await this.accountSecurity.issue(
        user.id,
        'ACCOUNT_ACTIVATION',
      );
    } catch {
      mailLogger.warn('Provisioned account invitation could not be issued');
      delivery = 'FAILED';
    }
    return {
      message: 'Account created pending activation',
      delivery,
      user,
    };
  }

  async login(dto: LoginDto, userAgent?: string) {
    assertPassword(dto.password, 1);
    const email = dto.email?.trim().toLowerCase();
    const password = dto.password;

    if (!email || !password) {
      throw new BadRequestException('Email and password are required');
    }

    const key = createHash('sha256').update(email).digest('hex');
    const retryAfter = this.loginLimiter.consume(key, this.loginPolicy);
    if (retryAfter)
      throw new HttpException(
        {
          statusCode: 429,
          message: 'Too many login attempts. Try again later.',
          retryAfter,
        },
        429,
      );
    const user = await this.usersService.findByEmail(email);

    const passwordMatches = await bcrypt.compare(
      password,
      user?.password ?? dummyPasswordHash,
    );

    if (
      !user ||
      user.status !== 'ACTIVE' ||
      !user.activatedAt ||
      !user.password ||
      !passwordMatches
    ) {
      throw new UnauthorizedException('Invalid credentials');
    }

    try {
      const result = await this.issueTokens(user, undefined, userAgent);
      this.loginLimiter.reset(key);
      return result;
    } catch (error) {
      if (error instanceof UnauthorizedException)
        throw new UnauthorizedException('Invalid credentials');
      throw error;
    }
  }

  async refresh(refreshToken: string) {
    if (!refreshToken?.trim()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokenHash = this.hashRefreshToken(refreshToken);
    const storedToken = await this.usersService.findRefreshToken(tokenHash);

    if (
      !storedToken ||
      storedToken.revokedAt !== null ||
      storedToken.expiresAt <= new Date()
    ) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (
      storedToken.user.status !== 'ACTIVE' ||
      !storedToken.user.activatedAt ||
      !storedToken.user.password
    )
      throw new UnauthorizedException('Invalid or expired refresh token');
    return this.issueTokens(storedToken.user, tokenHash);
  }

  async logout(refreshToken: string) {
    if (!refreshToken?.trim()) {
      throw new BadRequestException('Refresh token is required');
    }

    await this.usersService.revokeRefreshToken(
      this.hashRefreshToken(refreshToken),
    );

    return { message: 'Logged out successfully' };
  }

  private async issueTokens(
    user: {
      id: number;
      username: string;
      email: string;
      role: UserRole;
      sessionVersion: number;
    },
    consumedHash?: string,
    userAgent?: string,
  ) {
    const refreshToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const current = await this.usersService.issueSession(
      user.id,
      user.sessionVersion,
      this.hashRefreshToken(refreshToken),
      expiresAt,
      consumedHash,
      userAgent ? deviceDescription(userAgent) : undefined,
    );
    const accessToken = this.jwtService.sign({
      sub: current.id,
      sid: current.sid,
      sessionVersion: current.sessionVersion,
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        passwordChangeRequired: current.passwordChangeRequired,
      },
    };
  }

  private hashRefreshToken(refreshToken: string) {
    return createHash('sha256').update(refreshToken).digest('hex');
  }
}

// Coarse, untrusted browser hints only; never persist the raw user-agent.
function deviceDescription(raw: string) {
  const ua = raw.slice(0, 512);
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser';
  const os = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPad/.test(ua)
      ? 'iOS'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Macintosh/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'unknown platform';
  return `${browser} on ${os}`;
}
