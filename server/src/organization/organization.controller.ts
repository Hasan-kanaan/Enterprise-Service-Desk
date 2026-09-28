import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Patch,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import { ListQuery } from '../common/list-query';
import { IsIn } from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole as PrismaUserRole } from '../../generated/prisma/client';
import { UserRole } from '../users/user-role.enum';
import { CreateNameDto, RenameTeamDto } from './dto/create-name.dto';
import { CreateTeamDto } from './dto/create-team.dto';
import { OrganizationService } from './organization.service';

class OrganizationLookupQuery extends ListQuery {
  @IsIn(['member', 'lead', 'manager'])
  purpose!: 'member' | 'lead' | 'manager';
}

type ActorRequest = {
  user: { sub: number; role: PrismaUserRole; sessionVersion: number };
};

@Controller('organization')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Patch('regions/:id')
  renameRegion(
    @Req() req: ActorRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateNameDto,
  ) {
    return this.organizationService.maintain(
      'region',
      id,
      { name: dto.name },
      {
        id: req.user.sub,
        role: req.user.role,
        sessionVersion: req.user.sessionVersion,
      },
    );
  }
  @Post('regions/:id/archive')
  archiveRegion(
    @Req() req: ActorRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.organizationService.maintain(
      'region',
      id,
      { archived: true },
      {
        id: req.user.sub,
        role: req.user.role,
        sessionVersion: req.user.sessionVersion,
      },
    );
  }
  @Post('regions/:id/reactivate')
  reactivateRegion(
    @Req() req: ActorRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.organizationService.maintain(
      'region',
      id,
      { archived: false },
      {
        id: req.user.sub,
        role: req.user.role,
        sessionVersion: req.user.sessionVersion,
      },
    );
  }
  @Patch('departments/:id')
  renameDepartment(
    @Req() req: ActorRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateNameDto,
  ) {
    return this.organizationService.maintain(
      'department',
      id,
      { name: dto.name },
      {
        id: req.user.sub,
        role: req.user.role,
        sessionVersion: req.user.sessionVersion,
      },
    );
  }
  @Post('departments/:id/archive')
  archiveDepartment(
    @Req() req: ActorRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.organizationService.maintain(
      'department',
      id,
      { archived: true },
      {
        id: req.user.sub,
        role: req.user.role,
        sessionVersion: req.user.sessionVersion,
      },
    );
  }
  @Post('departments/:id/reactivate')
  reactivateDepartment(
    @Req() req: ActorRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.organizationService.maintain(
      'department',
      id,
      { archived: false },
      {
        id: req.user.sub,
        role: req.user.role,
        sessionVersion: req.user.sessionVersion,
      },
    );
  }
  @Patch('specialties/:id')
  renameSpecialty(
    @Req() req: ActorRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateNameDto,
  ) {
    return this.organizationService.maintain(
      'specialty',
      id,
      { name: dto.name },
      {
        id: req.user.sub,
        role: req.user.role,
        sessionVersion: req.user.sessionVersion,
      },
    );
  }
  @Post('specialties/:id/archive')
  archiveSpecialty(
    @Req() req: ActorRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.organizationService.maintain(
      'specialty',
      id,
      { archived: true },
      {
        id: req.user.sub,
        role: req.user.role,
        sessionVersion: req.user.sessionVersion,
      },
    );
  }
  @Post('specialties/:id/reactivate')
  reactivateSpecialty(
    @Req() req: ActorRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.organizationService.maintain(
      'specialty',
      id,
      { archived: false },
      {
        id: req.user.sub,
        role: req.user.role,
        sessionVersion: req.user.sessionVersion,
      },
    );
  }
  @Patch('teams/:id')
  renameTeam(
    @Req() req: ActorRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RenameTeamDto,
  ) {
    return this.organizationService.maintain(
      'team',
      id,
      { name: dto.name },
      {
        id: req.user.sub,
        role: req.user.role,
        sessionVersion: req.user.sessionVersion,
      },
    );
  }
  @Post('teams/:id/archive')
  archiveTeam(@Req() req: ActorRequest, @Param('id', ParseIntPipe) id: number) {
    return this.organizationService.maintain(
      'team',
      id,
      { archived: true },
      {
        id: req.user.sub,
        role: req.user.role,
        sessionVersion: req.user.sessionVersion,
      },
    );
  }
  @Post('teams/:id/reactivate')
  reactivateTeam(
    @Req() req: ActorRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.organizationService.maintain(
      'team',
      id,
      { archived: false },
      {
        id: req.user.sub,
        role: req.user.role,
        sessionVersion: req.user.sessionVersion,
      },
    );
  }
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
  @Get('teams/:teamId/members') listMembers(
    @Param('teamId', ParseIntPipe) teamId: number,
    @Query() query: ListQuery,
  ) {
    return this.organizationService.listMembers(teamId, query);
  }

  @Get('teams/:teamId/people') people(
    @Param('teamId', ParseIntPipe) teamId: number,
    @Query() query: OrganizationLookupQuery,
  ) {
    return this.organizationService.people(teamId, query.purpose, query);
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
    @Req() req: ActorRequest,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.organizationService.removeMember(teamId, userId, {
      id: req.user.sub,
      role: req.user.role,
      sessionVersion: req.user.sessionVersion,
    });
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
  @Get('agents/:id/specialties') agentSpecialties(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.organizationService.agentSpecialties(id);
  }
  @Post('agents/:id/specialties/:specialtyId') addagentsSpecialty(
    @Req() req: ActorRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('specialtyId', ParseIntPipe) specialtyId: number,
  ) {
    return this.organizationService.specialtyLink(
      'agents',
      id,
      specialtyId,
      true,
      {
        id: req.user.sub,
        role: req.user.role,
        sessionVersion: req.user.sessionVersion,
      },
    );
  }
  @Delete('agents/:id/specialties/:specialtyId') removeagentsSpecialty(
    @Req() req: ActorRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('specialtyId', ParseIntPipe) specialtyId: number,
  ) {
    return this.organizationService.specialtyLink(
      'agents',
      id,
      specialtyId,
      false,
      {
        id: req.user.sub,
        role: req.user.role,
        sessionVersion: req.user.sessionVersion,
      },
    );
  }
  @Post('teams/:id/specialties/:specialtyId') addteamsSpecialty(
    @Req() req: ActorRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('specialtyId', ParseIntPipe) specialtyId: number,
  ) {
    return this.organizationService.specialtyLink(
      'teams',
      id,
      specialtyId,
      true,
      {
        id: req.user.sub,
        role: req.user.role,
        sessionVersion: req.user.sessionVersion,
      },
    );
  }
  @Delete('teams/:id/specialties/:specialtyId') removeteamsSpecialty(
    @Req() req: ActorRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('specialtyId', ParseIntPipe) specialtyId: number,
  ) {
    return this.organizationService.specialtyLink(
      'teams',
      id,
      specialtyId,
      false,
      {
        id: req.user.sub,
        role: req.user.role,
        sessionVersion: req.user.sessionVersion,
      },
    );
  }
}
