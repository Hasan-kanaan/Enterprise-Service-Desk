import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { jwtConstants } from '../auth/auth.constants';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [JwtModule.register({ secret: jwtConstants.secret }), PrismaModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AuthGuard, RolesGuard],
})
export class AnalyticsModule {}
