import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/user-role.enum';
import { TicketAuthorizationUser } from './ticket-authorization.types';
import { TicketCommunicationService } from './ticket-communication.service';
import {
  CreateCommunicationDto,
  EditCommunicationDto,
} from './dto/ticket-communication.dto';
type Request = {
  user: {
    sub: number;
    role: TicketAuthorizationUser['role'];
    sessionVersion?: number;
  };
};

@Controller('tickets')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.EMPLOYEE, UserRole.AGENT, UserRole.MANAGER)
export class TicketCommunicationController {
  constructor(private readonly communication: TicketCommunicationService) {}
  private actor(request: Request): TicketAuthorizationUser {
    return {
      id: request.user.sub,
      role: request.user.role,
      sessionVersion: request.user.sessionVersion,
    };
  }

  @Get(':ticketId/messages')
  readMessages(
    @Param('ticketId', ParseIntPipe) id: number,
    @Req() request: Request,
  ) {
    return this.communication.read(id, this.actor(request), 'messages');
  }
  @Post(':ticketId/messages')
  createMessages(
    @Param('ticketId', ParseIntPipe) id: number,
    @Req() request: Request,
    @Body() dto: CreateCommunicationDto,
  ) {
    return this.communication.write(id, this.actor(request), 'messages', dto);
  }
  @Patch(':ticketId/messages/:recordId')
  editMessages(
    @Param('ticketId', ParseIntPipe) id: number,
    @Param('recordId', ParseIntPipe) recordId: number,
    @Req() request: Request,
    @Body() dto: EditCommunicationDto,
  ) {
    return this.communication.write(
      id,
      this.actor(request),
      'messages',
      dto,
      recordId,
    );
  }

  @Get(':ticketId/internal-notes')
  readNotes(
    @Param('ticketId', ParseIntPipe) id: number,
    @Req() request: Request,
  ) {
    return this.communication.read(id, this.actor(request), 'internal-notes');
  }
  @Post(':ticketId/internal-notes')
  createNotes(
    @Param('ticketId', ParseIntPipe) id: number,
    @Req() request: Request,
    @Body() dto: CreateCommunicationDto,
  ) {
    return this.communication.write(
      id,
      this.actor(request),
      'internal-notes',
      dto,
    );
  }
  @Patch(':ticketId/internal-notes/:recordId')
  editNotes(
    @Param('ticketId', ParseIntPipe) id: number,
    @Param('recordId', ParseIntPipe) recordId: number,
    @Req() request: Request,
    @Body() dto: EditCommunicationDto,
  ) {
    return this.communication.write(
      id,
      this.actor(request),
      'internal-notes',
      dto,
      recordId,
    );
  }
}
