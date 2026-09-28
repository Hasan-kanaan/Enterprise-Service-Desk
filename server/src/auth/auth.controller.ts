import { AccountSecurityService } from './account-security.service';
import {
  Body,
  Delete,
  ParseUUIDPipe,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import type { Request as ExpressRequest, Response } from 'express';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { LoginDto } from './dto/login.dto';
import { SetupDto } from './dto/setup.dto';
import { CreateAccountDto } from './dto/create-account.dto';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';
import { UserRole } from '../users/user-role.enum';
import { refreshCookieOptions } from '../security/security.config';
import { UsersService } from '../users/users.service';
import {
  ChangePasswordDto,
  AccountEmailDto,
  ConsumeActionDto,
  EmptyAccountActionDto,
} from './dto/password.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly accountSecurity: AccountSecurityService,
  ) {}

  @Get('sessions')
  @UseGuards(AuthGuard)
  sessions(@Req() request: { user: { sub: number; sid: string } }) {
    return this.usersService.listSessions(request.user.sub, request.user.sid);
  }

  @Delete('sessions/:sessionId')
  @UseGuards(AuthGuard)
  async revokeSession(
    @Req() request: { user: { sub: number; sid: string } },
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.usersService.revokeSessions(
      request.user.sub,
      sessionId,
      false,
      request.user.sid,
    );
  }

  @Post('sessions/logout-others')
  @UseGuards(AuthGuard)
  logoutOthers(@Req() request: { user: { sub: number; sid: string } }) {
    return this.usersService.revokeSessions(
      request.user.sub,
      request.user.sid,
      true,
      request.user.sid,
    );
  }

  @Post('password')
  @UseGuards(AuthGuard)
  async changePassword(
    @Req()
    request: {
      user: {
        sub: number;
        role: UserRole;
        sessionVersion: number;
        email: string;
      };
    },
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.usersService.changePassword(
      { id: request.user.sub, ...request.user },
      request.user.sub,
      dto.newPassword,
      dto.currentPassword,
    );
    response.clearCookie('refresh_token', refreshCookieOptions());
    await this.accountSecurity.passwordChanged(request.user.email);
    return result;
  }

  @Post('accounts/:id/reset-password')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  resetPassword(
    @Req()
    request: { user: { sub: number; role: UserRole; sessionVersion: number } },
    @Param('id', ParseIntPipe) id: number,
    @Body() _dto: EmptyAccountActionDto,
  ) {
    void _dto;
    return this.accountSecurity
      .issue(id, 'PASSWORD_RESET', { id: request.user.sub, ...request.user })
      .then((delivery) => ({ delivery }));
  }

  @Post('accounts/:id/resend-activation')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  resend(
    @Req()
    request: { user: { sub: number; role: UserRole; sessionVersion: number } },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.accountSecurity
      .issue(id, 'ACCOUNT_ACTIVATION', {
        id: request.user.sub,
        ...request.user,
      })
      .then((delivery) => ({ delivery }));
  }
  @Post('forgot-password')
  forgot(@Body() dto: AccountEmailDto) {
    return this.accountSecurity.request(dto.email, 'PASSWORD_RESET');
  }
  @Post('resend-activation')
  publicResend(@Body() dto: AccountEmailDto) {
    return this.accountSecurity.request(dto.email, 'ACCOUNT_ACTIVATION');
  }
  @Post('activate')
  activate(@Body() dto: ConsumeActionDto) {
    return this.accountSecurity.consume(
      dto.token,
      dto.newPassword,
      'ACCOUNT_ACTIVATION',
    );
  }
  @Post('reset-password')
  reset(@Body() dto: ConsumeActionDto) {
    return this.accountSecurity.consume(
      dto.token,
      dto.newPassword,
      'PASSWORD_RESET',
    );
  }

  @Get('setup/status')
  setupStatus() {
    return this.authService.getSetupStatus();
  }

  @Post('setup')
  setup(@Body() dto: SetupDto) {
    return this.authService.setup(dto);
  }

  @Post('accounts')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  createAccount(
    @Req() request: { user: { role: UserRole } },
    @Body() dto: CreateAccountDto,
  ) {
    return this.authService.createAccount(request.user.role, dto);
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() request: ExpressRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(
      dto,
      request.headers['user-agent'],
    );
    this.setRefreshCookie(response, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('refresh')
  async refresh(
    @Req() request: ExpressRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.refresh(
      (request.cookies as Record<string, string | undefined> | undefined)
        ?.refresh_token ?? '',
    );
    this.setRefreshCookie(response, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('logout')
  logout(
    @Req() request: ExpressRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.clearCookie('refresh_token', refreshCookieOptions());
    return this.authService.logout(
      (request.cookies as Record<string, string | undefined> | undefined)
        ?.refresh_token ?? '',
    );
  }

  private setRefreshCookie(response: Response, refreshToken: string) {
    response.cookie('refresh_token', refreshToken, {
      ...refreshCookieOptions(),
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }
}
