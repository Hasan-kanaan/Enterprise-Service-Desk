import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Param,
  ParseIntPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../users/user-role.enum';
import { UserRole as PrismaUserRole } from '../../generated/prisma/client';
import { TicketVisibilityService } from './ticket-visibility.service';
import { TicketsService } from './tickets.service';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import { CreateSubtaskDto } from './dto/create-subtask.dto';
import { UpdateSubtaskDto } from './dto/update-subtask.dto';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';

type AuthenticatedRequest = {
  user: {
    sub: number;
    role: UserRole;
  };
};

@Controller('tickets')
@UseGuards(AuthGuard, RolesGuard)
@Roles(
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.AGENT,
  UserRole.EMPLOYEE,
)
export class TicketsController {
  constructor(
    private readonly ticketVisibilityService: TicketVisibilityService,
    private readonly ticketsService: TicketsService,
  ) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.ticketVisibilityService.listVisible({
      id: request.user.sub,
      role: request.user.role as PrismaUserRole,
    });
  }

  @Get(':ticketId')
  findById(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.ticketVisibilityService.findVisibleById(ticketId, {
      id: request.user.sub,
      role: request.user.role as PrismaUserRole,
    });
  }

  @Post()
  create(@Body() dto: CreateTicketDto, @Req() request: AuthenticatedRequest) {
    return this.ticketsService.create(this.authenticatedUser(request), dto);
  }

  @Patch(':ticketId')
  update(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Body() dto: UpdateTicketDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.ticketsService.update(ticketId, this.authenticatedUser(request), dto);
  }

  @Patch(':ticketId/assignment')
  assign(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Body() dto: AssignTicketDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.ticketsService.assign(ticketId, this.authenticatedUser(request), dto);
  }

  @Patch(':ticketId/status')
  updateStatus(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Body() dto: UpdateTicketStatusDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.ticketsService.updateStatus(ticketId, this.authenticatedUser(request), dto.status);
  }

  @Post(':ticketId/subtasks')
  createSubtask(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Body() dto: CreateSubtaskDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.ticketsService.createSubtask(ticketId, this.authenticatedUser(request), dto);
  }

  @Patch('subtasks/:subtaskId')
  updateSubtask(
    @Param('subtaskId', ParseIntPipe) subtaskId: number,
    @Body() dto: UpdateSubtaskDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.ticketsService.updateSubtask(subtaskId, this.authenticatedUser(request), dto);
  }

  private authenticatedUser(request: AuthenticatedRequest) {
    return { id: request.user.sub, role: request.user.role as PrismaUserRole };
  }
}