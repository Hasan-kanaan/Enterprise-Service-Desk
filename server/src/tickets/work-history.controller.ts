import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/user-role.enum';
import { UserRole as PrismaRole } from '../../generated/prisma/client';
import { WorkHistoryDto } from './dto/work-history.dto';
import { WorkHistoryService } from './work-history.service';

@Controller('my-work-history')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.MANAGER, UserRole.AGENT)
export class WorkHistoryController {
  constructor(private readonly history: WorkHistoryService) {}

  @Get()
  list(
    @Req() request: { user: { sub: number; role: PrismaRole } },
    @Query() query: WorkHistoryDto,
  ) {
    return this.history.list(
      { id: request.user.sub, role: request.user.role },
      query,
    );
  }
}
