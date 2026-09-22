import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole as PrismaUserRole } from '../../generated/prisma/client';
import { UserRole } from '../users/user-role.enum';
import { CreateNameDto } from './dto/create-name.dto';
import { CreateTeamDto } from './dto/create-team.dto';
import { OrganizationService } from './organization.service';

type ActorRequest = {
  user: { sub: number; role: PrismaUserRole; sessionVersion: number };
};

@Controller('organization')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Get('regions') listRegions() {
    return this.organizationService.listRegions();
  }
  @Post('regions') createRegion(@Body() dto: CreateNameDto) {
    return this.organizationService.createRegion(dto.name);
  }
  @Get('departments') listDepartments() {
    return this.organizationService.listDepartments();
  }
  @Post('departments') createDepartment(@Body() dto: CreateNameDto) {
    return this.organizationService.createDepartment(dto.name);
  }
  @Get('specialties') listSpecialties() {
    return this.organizationService.listSpecialties();
  }
  @Post('specialties') createSpecialty(@Body() dto: CreateNameDto) {
    return this.organizationService.createSpecialty(dto.name);
  }
  @Get('teams') listTeams() {
    return this.organizationService.listTeams();
  }
  @Post('teams') createTeam(@Body() dto: CreateTeamDto) {
    return this.organizationService.createTeam(dto);
  }

  @Post('teams/:teamId/members/:userId') addMember(
    @Req() req: ActorRequest,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.organizationService.addMember(teamId, userId, {
      id: req.user.sub,
      role: req.user.role,
      sessionVersion: req.user.sessionVersion,
    });
  }
  @Delete('teams/:teamId/members/:userId') removeMember(
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.organizationService.removeMember(teamId, userId);
  }
  @Post('teams/:teamId/manager/:userId') assignManager(
    @Req() req: ActorRequest,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.organizationService.assignManager(teamId, userId, {
      id: req.user.sub,
      role: req.user.role,
      sessionVersion: req.user.sessionVersion,
    });
  }
  @Delete('teams/:teamId/manager') removeManager(
    @Param('teamId', ParseIntPipe) teamId: number,
  ) {
    return this.organizationService.removeManager(teamId);
  }
  @Post('teams/:teamId/lead/:userId') assignTeamLead(
    @Req() req: ActorRequest,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.organizationService.assignTeamLead(teamId, userId, {
      id: req.user.sub,
      role: req.user.role,
      sessionVersion: req.user.sessionVersion,
    });
  }
  @Delete('teams/:teamId/lead') removeTeamLead(
    @Param('teamId', ParseIntPipe) teamId: number,
  ) {
    return this.organizationService.removeTeamLead(teamId);
  }
}
