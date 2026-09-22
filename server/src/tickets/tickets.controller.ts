import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Param,
  ParseIntPipe,
  Req,
  Query,
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
import { ListTicketsDto, ListSubtasksDto } from './dto/list-tickets.dto';
import { ReopenTicketDto } from './dto/reopen-ticket.dto';
import { UpdateTicketManagerDto } from './dto/update-ticket-manager.dto';

type AuthenticatedRequest = {
  user: {
    sub: number;
    role: UserRole;
    sessionVersion?: number;
  };
};

@Controller('tickets')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.MANAGER, UserRole.AGENT, UserRole.EMPLOYEE)
export class TicketsController {
  constructor(
    private readonly ticketVisibilityService: TicketVisibilityService,
    private readonly ticketsService: TicketsService,
  ) {}

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListTicketsDto = {},
  ) {
    return this.ticketVisibilityService.listVisible(
      {
        id: request.user.sub,
        role: request.user.role as PrismaUserRole,
      },
      query,
    );
  }

  @Get('subtasks')
  listSubtasks(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListSubtasksDto = {},
  ) {
    return this.ticketVisibilityService.listVisibleSubtasks(
      this.authenticatedUser(request),
      undefined,
      query.currentWork === 'true',
    );
  }

  @Get('subtasks/:subtaskId')
  findSubtask(
    @Param('subtaskId', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.ticketVisibilityService.findVisibleSubtaskById(
      id,
      this.authenticatedUser(request),
    );
  }

  @Get(':ticketId/subtasks')
  listTicketSubtasks(
    @Query() query: ListSubtasksDto,
    @Param('ticketId', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.ticketVisibilityService.listVisibleSubtasks(
      this.authenticatedUser(request),
      id,
      query.currentWork === 'true',
    );
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
    return this.ticketsService.update(
      ticketId,
      this.authenticatedUser(request),
      dto,
    );
  }

  @Patch(':ticketId/manager')
  assignManager(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Body() dto: UpdateTicketManagerDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.ticketsService.assignManager(
      ticketId,
      this.authenticatedUser(request),
      dto,
    );
  }

  @Patch(':ticketId/assignment')
  assign(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Body() dto: AssignTicketDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.ticketsService.assign(
      ticketId,
      this.authenticatedUser(request),
      dto,
    );
  }

  @Patch(':ticketId/status')
  updateStatus(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Body() dto: UpdateTicketStatusDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.ticketsService.updateStatus(
      ticketId,
      this.authenticatedUser(request),
      dto.status,
      dto.resolutionSummary,
    );
  }

  @Get(':ticketId/history')
  history(
    @Param('ticketId', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.ticketVisibilityService.history(
      id,
      this.authenticatedUser(request),
    );
  }

  @Post(':ticketId/cancel')
  cancel(
    @Param('ticketId', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.ticketsService.cancel(id, this.authenticatedUser(request));
  }

  @Post(':ticketId/reopen')
  reopen(
    @Param('ticketId', ParseIntPipe) id: number,
    @Body() dto: ReopenTicketDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.ticketsService.reopen(id, this.authenticatedUser(request), dto);
  }

  @Post(':ticketId/subtasks')
  createSubtask(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Body() dto: CreateSubtaskDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.ticketsService.createSubtask(
      ticketId,
      this.authenticatedUser(request),
      dto,
    );
  }

  @Patch('subtasks/:subtaskId')
  updateSubtask(
    @Param('subtaskId', ParseIntPipe) subtaskId: number,
    @Body() dto: UpdateSubtaskDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.ticketsService.updateSubtask(
      subtaskId,
      this.authenticatedUser(request),
      dto,
    );
  }

  private authenticatedUser(request: AuthenticatedRequest) {
    return {
      id: request.user.sub,
      role: request.user.role as PrismaUserRole,
      sessionVersion: request.user.sessionVersion,
    };
  }
}
