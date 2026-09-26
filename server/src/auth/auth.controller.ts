import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
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

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(dto);
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
