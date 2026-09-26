import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';
import { UserRole } from '../users/user-role.enum';

@Controller('users')
export class ProfileController {
  @Get('profile')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.AGENT,
    UserRole.EMPLOYEE,
  )
  getProfile(@Request() req: AuthenticatedRequest) {
    return {
      message: 'Profile access granted',
      user: req.user,
    };
  }
}
