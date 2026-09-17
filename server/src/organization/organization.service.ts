import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TeamScope, UserRole } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTeamDto } from './dto/create-team.dto';

@Injectable()
export class OrganizationService {
  constructor(private readonly prisma: PrismaService) {}

  listRegions() {
    return this.prisma.region.findMany({ orderBy: { name: 'asc' } });
  }

  createRegion(name: string) {
    return this.createNamedEntity('region', name);
  }

  listDepartments() {
    return this.prisma.department.findMany({ orderBy: { name: 'asc' } });
  }

  createDepartment(name: string) {
    return this.createNamedEntity('department', name);
  }

  listSpecialties() {
    return this.prisma.specialty.findMany({ orderBy: { name: 'asc' } });
  }

  createSpecialty(name: string) {
    return this.createNamedEntity('specialty', name);
  }

  listTeams() {
    return this.prisma.team.findMany({
      orderBy: { name: 'asc' },
      include: {
        region: true,
        teamLead: { select: { id: true, username: true, role: true } },
        managers: { include: { manager: { select: { id: true, username: true, role: true } } } },
        specialties: { include: { specialty: true } },
      },
    });
  }

  async createTeam(data: CreateTeamDto) {
    if (data.scope === TeamScope.REGION && data.regionId === undefined) {
      throw new BadRequestException('Regional teams require a region');
    }

    if (data.scope === TeamScope.GLOBAL && data.regionId !== undefined) {
      throw new BadRequestException('Global teams cannot have a region');
    }

    if (data.regionId !== undefined) {
      await this.requireRegion(data.regionId);
    }

    try {
      return await this.prisma.team.create({
        data: {
          name: data.name.trim(),
          scope: data.scope,
          regionId: data.regionId,
        },
      });
    } catch (error) {
      this.throwConflict(error, 'A team with this name and region already exists');
      throw error;
    }
  }

  async addMember(teamId: number, userId: number) {
    await this.requireTeam(teamId);
    await this.requireUser(userId, UserRole.AGENT);

    return this.prisma.teamMember.create({
      data: { teamId, userId },
    });
  }

  async removeMember(teamId: number, userId: number) {
    const team = await this.requireTeam(teamId);

    if (team.teamLeadId === userId) {
      throw new BadRequestException('Remove the Team Lead assignment before removing this member');
    }

    await this.prisma.teamMember.delete({
      where: { teamId_userId: { teamId, userId } },
    });

    return { message: 'Team member removed' };
  }

  async assignManager(teamId: number, managerId: number) {
    await this.requireTeam(teamId);
    await this.requireUser(managerId, UserRole.MANAGER);

    try {
      return await this.prisma.teamManager.create({
        data: { teamId, managerId },
      });
    } catch (error) {
      this.throwConflict(error, 'This team already has a manager');
      throw error;
    }
  }

  async removeManager(teamId: number) {
    await this.requireTeam(teamId);
    const manager = await this.prisma.teamManager.findUnique({ where: { teamId } });

    if (!manager) {
      throw new NotFoundException('Team manager not found');
    }

    await this.prisma.teamManager.delete({ where: { teamId } });
    return { message: 'Team manager removed' };
  }

  async assignTeamLead(teamId: number, userId: number) {
    await this.requireTeam(teamId);
    await this.requireUser(userId, UserRole.AGENT);

    const membership = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
    });

    if (!membership) {
      throw new BadRequestException('Team Lead must be a member of the team');
    }

    try {
      return await this.prisma.team.update({
        where: { id: teamId },
        data: { teamLeadId: userId },
      });
    } catch (error) {
      this.throwConflict(error, 'This agent is already Team Lead of another team');
      throw error;
    }
  }

  async removeTeamLead(teamId: number) {
    await this.requireTeam(teamId);
    return this.prisma.team.update({
      where: { id: teamId },
      data: { teamLeadId: null },
    });
  }

  private async createNamedEntity(model: 'region' | 'department' | 'specialty', name: string) {
    try {
      const data = { name: name.trim() };

      switch (model) {
        case 'region':
          return await this.prisma.region.create({ data });
        case 'department':
          return await this.prisma.department.create({ data });
        case 'specialty':
          return await this.prisma.specialty.create({ data });
      }
    } catch (error) {
      this.throwConflict(error, `A ${model} with this name already exists`);
      throw error;
    }
  }

  private async requireRegion(id: number) {
    const region = await this.prisma.region.findUnique({ where: { id } });
    if (!region) throw new NotFoundException('Region not found');
    return region;
  }

  private async requireTeam(id: number) {
    const team = await this.prisma.team.findUnique({ where: { id } });
    if (!team) throw new NotFoundException('Team not found');
    return team;
  }

  private async requireUser(id: number, role: UserRole) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== role) {
      throw new BadRequestException(`User must have the ${role} role`);
    }
    return user;
  }

  private throwConflict(error: unknown, message: string): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException(message);
    }
  }
}