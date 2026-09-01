import {
  Controller,
  Get,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';
import { UserRole } from '../users/user-role.enum';

@Controller('users')
export class ProfileController {
  @Get('profile')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.EMPLOYEE, UserRole.ADMIN, UserRole.MANAGER, UserRole.AGENT)
  getProfile(@Request() req: any) {
    return {
      message: 'Profile access granted',
      user: req.user,
    };
  }
}
