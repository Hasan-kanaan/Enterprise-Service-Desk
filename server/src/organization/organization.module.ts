import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { jwtConstants } from '../auth/auth.constants';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';

import { TicketConfigurationController } from './ticket-configuration.controller';
import { TicketConfigurationService } from './ticket-configuration.service';

@Module({
  imports: [JwtModule.register({ secret: jwtConstants.secret })],
  controllers: [OrganizationController, TicketConfigurationController],
  providers: [
    TicketConfigurationService,
    OrganizationService,
    AuthGuard,
    RolesGuard,
  ],
})
export class OrganizationModule {}
