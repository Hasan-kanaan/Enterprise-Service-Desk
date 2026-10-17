import {
  Controller,
  Header,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/user-role.enum';
import { TicketAuthorizationUser } from '../tickets/ticket-authorization.types';
import { AiRecommendationsService } from './ai-recommendations.service';

@Controller('tickets/:ticketId/ai-suggestions')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.MANAGER)
export class AiRecommendationsController {
  constructor(private readonly recommendations: AiRecommendationsService) {}

  @Post()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  generate(
    @Param('ticketId', ParseIntPipe) id: number,
    @Req()
    request: {
      user: {
        sub: number;
        role: TicketAuthorizationUser['role'];
        sessionVersion: number;
      };
    },
  ) {
    return this.recommendations.generate(id, {
      id: request.user.sub,
      role: request.user.role,
      sessionVersion: request.user.sessionVersion,
    });
  }
}
