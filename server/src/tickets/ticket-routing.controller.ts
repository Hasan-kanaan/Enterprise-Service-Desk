import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../users/user-role.enum';
import { UserRole as PrismaUserRole } from '../../generated/prisma/client';
import {
  UpdateCategorySpecialtiesDto,
  UpdateTicketRoutingDto,
} from './dto/update-ticket-routing.dto';
import { TicketRoutingService } from './ticket-routing.service';

type AuthenticatedRequest = {
  user: { sub: number; role: PrismaUserRole; sessionVersion?: number };
};
const actor = (request: AuthenticatedRequest) => ({
  id: request.user.sub,
  role: request.user.role,
  sessionVersion: request.user.sessionVersion,
});

@Controller('ticket-configuration/routing')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class TicketRoutingController {
  constructor(private readonly routing: TicketRoutingService) {}

  @Get()
  getConfiguration(@Req() request: AuthenticatedRequest) {
    return this.routing.configuration(actor(request));
  }

  @Patch()
  updateConfiguration(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateTicketRoutingDto,
  ) {
    return this.routing.updateConfiguration(actor(request), dto);
  }

  @Patch('categories/:categoryId/specialties')
  updateCategorySpecialties(
    @Req() request: AuthenticatedRequest,
    @Param('categoryId', ParseIntPipe) categoryId: number,
    @Body() dto: UpdateCategorySpecialtiesDto,
  ) {
    return this.routing.updateCategorySpecialties(
      actor(request),
      categoryId,
      dto.specialtyIds,
    );
  }
}
