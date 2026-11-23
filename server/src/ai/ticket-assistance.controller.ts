import {
  Body,
  Controller,
  Header,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/user-role.enum';
import { TicketAuthorizationUser } from '../tickets/ticket-authorization.types';
import { TicketAssistanceService } from './ticket-assistance.service';
import { TicketAssistanceDto } from './ticket-assistance.dto';

@Controller('ticket-assistance')
@UseGuards(AuthGuard, RolesGuard)
@Roles(
  UserRole.EMPLOYEE,
  UserRole.AGENT,
  UserRole.MANAGER,
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
)
export class TicketAssistanceController {
  constructor(private readonly assistance: TicketAssistanceService) {}
  @Post()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  assist(
    @Body() dto: TicketAssistanceDto,
    @Req()
    request: {
      user: {
        sub: number;
        role: TicketAuthorizationUser['role'];
        sessionVersion: number;
      };
    },
  ) {
    return this.assistance.assist(
      {
        id: request.user.sub,
        role: request.user.role,
        sessionVersion: request.user.sessionVersion,
      },
      dto,
    );
  }
}
