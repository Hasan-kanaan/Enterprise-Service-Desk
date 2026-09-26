import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TeamScope, UserRole } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  lockUser,
  requireActiveActor,
  serializable,
} from '../prisma/transactions';
import { after, ListQuery, listPage, listWindow } from '../common/list-query';
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
        managers: {
          include: {
            manager: { select: { id: true, username: true, role: true } },
          },
        },
        specialties: { include: { specialty: true } },
      },
    });
  }

  async listMembers(teamId: number, query: ListQuery) {
    await this.requireTeam(teamId);
    const { limit, position, search } = listWindow(query, false);
    const rows = await this.prisma.user.findMany({
      where: {
        AND: [
          after(position),
          { teamMemberships: { some: { teamId } } },
          search ? { username: { contains: search, mode: 'insensitive' } } : {},
        ],
      },
      select: { id: true, username: true, role: true, status: true },
      orderBy: { id: 'desc' },
      take: limit + 1,
    });
    return listPage(rows, limit, false);
  }

  async people(
    teamId: number,
    purpose: 'member' | 'lead' | 'manager',
    query: ListQuery,
  ) {
    await this.requireTeam(teamId);
    const { search } = listWindow(query, false);
    if (!search) return [];
    const eligibility: Prisma.UserWhereInput =
      purpose === 'manager'
        ? { role: UserRole.MANAGER }
        : {
            role: UserRole.AGENT,
            teamMemberships:
              purpose === 'member'
                ? { none: { teamId } }
                : { some: { teamId } },
            ...(purpose === 'lead'
              ? { OR: [{ ledTeam: null }, { ledTeam: { id: teamId } }] }
              : {}),
          };
    return this.prisma.user.findMany({
      where: {
        AND: [
          eligibility,
          {
            status: 'ACTIVE',
            username: { contains: search, mode: 'insensitive' },
          },
        ],
      },
      select: { id: true, username: true },
      orderBy: [{ username: 'asc' }, { id: 'asc' }],
      take: 20,
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
      this.throwConflict(
        error,
        'A team with this name and region already exists',
      );
      throw error;
    }
  }

  async addMember(
    teamId: number,
    userId: number,
    actor: { id: number; role: UserRole; sessionVersion?: number },
  ) {
    return serializable(this.prisma, async (db) => {
      await requireActiveActor(db, actor);
      await this.requireActiveUser(db, userId, UserRole.AGENT);
      if (!(await db.team.findUnique({ where: { id: teamId } })))
        throw new NotFoundException('Team not found');
      return db.teamMember.create({ data: { teamId, userId } });
    });
  }

  async removeMember(teamId: number, userId: number) {
    const team = await this.requireTeam(teamId);

    if (team.teamLeadId === userId) {
      throw new BadRequestException(
        'Remove the Team Lead assignment before removing this member',
      );
    }

    await this.prisma.teamMember.delete({
      where: { teamId_userId: { teamId, userId } },
    });

    return { message: 'Team member removed' };
  }

  async assignManager(
    teamId: number,
    managerId: number,
    actor: { id: number; role: UserRole; sessionVersion?: number },
  ) {
    return serializable(this.prisma, async (db) => {
      await requireActiveActor(db, actor);
      await this.requireActiveUser(db, managerId, UserRole.MANAGER);
      if (!(await db.team.findUnique({ where: { id: teamId } })))
        throw new NotFoundException('Team not found');
      try {
        return await db.teamManager.create({ data: { teamId, managerId } });
      } catch (error) {
        this.throwConflict(error, 'This team already has a manager');
        throw error;
      }
    });
  }

  async removeManager(teamId: number) {
    await this.requireTeam(teamId);
    const manager = await this.prisma.teamManager.findUnique({
      where: { teamId },
    });

    if (!manager) {
      throw new NotFoundException('Team manager not found');
    }

    await this.prisma.teamManager.delete({ where: { teamId } });
    return { message: 'Team manager removed' };
  }

  async assignTeamLead(
    teamId: number,
    userId: number,
    actor: { id: number; role: UserRole; sessionVersion?: number },
  ) {
    return serializable(this.prisma, async (db) => {
      await requireActiveActor(db, actor);
      await this.requireActiveUser(db, userId, UserRole.AGENT);
      const membership = await db.teamMember.findUnique({
        where: { teamId_userId: { teamId, userId } },
      });
      if (!membership)
        throw new BadRequestException('Team Lead must be a member of the team');
      try {
        return await db.team.update({
          where: { id: teamId },
          data: { teamLeadId: userId },
        });
      } catch (error) {
        this.throwConflict(
          error,
          'This agent is already Team Lead of another team',
        );
        throw error;
      }
    });
  }

  private async requireActiveUser(
    db: Prisma.TransactionClient,
    id: number,
    role: UserRole,
  ) {
    const user = await lockUser(db, id);
    if (!user) throw new NotFoundException('User not found');
    if (user.status !== 'ACTIVE' || user.role !== role)
      throw new BadRequestException(`User must be an active ${role}`);
    return user;
  }

  async removeTeamLead(teamId: number) {
    await this.requireTeam(teamId);
    return this.prisma.team.update({
      where: { id: teamId },
      data: { teamLeadId: null },
    });
  }

  private async createNamedEntity(
    model: 'region' | 'department' | 'specialty',
    name: string,
  ) {
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

  private throwConflict(error: unknown, message: string): void {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(message);
    }
  }
}
