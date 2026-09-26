import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
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
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async getSetupStatus() {
    const hasSuperAdmin = await this.usersService.hasSuperAdmin();

    return { available: !hasSuperAdmin };
  }

  async setup(dto: SetupDto) {
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
    const password = await bcrypt.hash(dto.password, 10);

    const user = await this.usersService.create({
      username,
      email,
      password,
      role: dto.role,
    });

    return {
      message: 'Account created successfully',
      user,
    };
  }

  async login(dto: LoginDto) {
    const email = dto.email?.trim().toLowerCase();
    const password = dto.password;

    if (!email || !password) {
      throw new BadRequestException('Email and password are required');
    }

    const user = await this.usersService.findByEmail(email);

    const passwordMatches = await bcrypt.compare(
      password,
      user?.password ?? dummyPasswordHash,
    );

    if (!user || user.status !== 'ACTIVE' || !passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    try {
      return await this.issueTokens(user);
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

    if (storedToken.user.status !== 'ACTIVE')
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
  ) {
    const refreshToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const current = await this.usersService.issueSession(
      user.id,
      user.sessionVersion,
      this.hashRefreshToken(refreshToken),
      expiresAt,
      consumedHash,
    );
    const accessToken = this.jwtService.sign({
      sub: current.id,
      username: current.username,
      email: current.email,
      role: current.role,
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
      },
    };
  }

  private hashRefreshToken(refreshToken: string) {
    return createHash('sha256').update(refreshToken).digest('hex');
  }
}
