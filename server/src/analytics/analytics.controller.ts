import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/user-role.enum';
import { AnalyticsQueryDto } from './analytics.dto';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.MANAGER)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get()
  overview(@Query() query: AnalyticsQueryDto) {
    return this.analytics.overview(query);
  }
}
