import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { jwtConstants } from '../auth/auth.constants';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';

@Module({
  imports: [JwtModule.register({ secret: jwtConstants.secret })],
  controllers: [OrganizationController],
  providers: [OrganizationService, AuthGuard, RolesGuard],
})
export class OrganizationModule {}
