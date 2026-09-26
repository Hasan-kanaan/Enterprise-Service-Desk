import {
  Controller,
  Get,
  UseGuards,
  Patch,
  Param,
  ParseIntPipe,
  Req,
  Body,
  Query,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from './user-role.enum';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UserRole as PrismaUserRole } from '../../generated/prisma/client';
import { UsersService } from './users.service';
import { ListUsersDto } from './dto/list-users.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Patch(':userId/status')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  updateStatus(
    @Param('userId', ParseIntPipe) id: number,
    @Body() dto: UpdateUserStatusDto,
    @Req()
    request: {
      user: { sub: number; role: PrismaUserRole; sessionVersion: number };
    },
  ) {
    return this.usersService.updateStatus(
      {
        id: request.user.sub,
        role: request.user.role,
        sessionVersion: request.user.sessionVersion,
      },
      id,
      dto.status,
    );
  }

  @Get()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  findAll(@Query() query: ListUsersDto) {
    return this.usersService.findAll(query);
  }
}
