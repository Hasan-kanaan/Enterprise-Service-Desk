import {
  BadRequestException,
  ConflictException,
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TeamScope, UserRole } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  lockUser,
  operationalStatuses,
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
    await this.requireActiveTeam(this.prisma, teamId);
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
            activatedAt: { not: null },
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

    try {
      return await serializable(this.prisma, async (db) => {
        if (data.regionId !== undefined)
          await this.requireRegion(data.regionId, db);
        return db.team.create({
          data: {
            name: data.name.trim(),
            scope: data.scope,
            regionId: data.regionId,
          },
        });
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
      await this.requireActiveTeam(db, teamId);
      try {
        return await db.teamMember.create({ data: { teamId, userId } });
      } catch (error) {
        this.throwConflict(error, 'Agent is already a team member');
        throw error;
      }
    });
  }

  async removeMember(
    teamId: number,
    userId: number,
    actor: { id: number; role: UserRole; sessionVersion?: number },
  ) {
    return serializable(this.prisma, async (db) => {
      await requireActiveActor(db, actor);
      await lockUser(db, userId);
      await db.$queryRaw`SELECT id FROM "Team" WHERE id = ${teamId} FOR UPDATE`;
      await db.$queryRaw`SELECT "teamId" FROM "TeamMember" WHERE "teamId" = ${teamId} AND "userId" = ${userId} FOR UPDATE`;
      const team = await db.team.findUnique({ where: { id: teamId } });
      if (!team) throw new NotFoundException('Team not found');
      if (team.teamLeadId === userId)
        throw new BadRequestException(
          'Remove the Team Lead assignment before removing this member',
        );
      const member = await db.teamMember.findUnique({
        where: { teamId_userId: { teamId, userId } },
      });
      if (!member) throw new NotFoundException('Team member not found');
      await this.reconcileMember(db, teamId, userId);
      await db.teamMember.delete({
        where: { teamId_userId: { teamId, userId } },
      });
      return { message: 'Team member removed' };
    });
  }

  private async reconcileMember(
    db: Prisma.TransactionClient,
    teamId: number,
    userId: number,
  ) {
    const tickets = await db.ticket.findMany({
      where: {
        status: { in: [...operationalStatuses] },
        OR: [
          { assignedTeamId: teamId, assignedAgentId: userId },
          {
            subtasks: {
              some: {
                assignedTeamId: teamId,
                assignedAgentId: userId,
                status: { in: ['TODO', 'IN_PROGRESS'] },
                createdInCycle: { outcome: null },
              },
            },
          },
        ],
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    for (const { id } of tickets) {
      await db.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${id} FOR UPDATE`;
      const ticket = await db.ticket.findUniqueOrThrow({
        where: { id },
        include: {
          workCycles: { orderBy: { sequenceNumber: 'desc' }, take: 1 },
        },
      });
      if (!(operationalStatuses as readonly string[]).includes(ticket.status))
        continue;
      if (ticket.assignedTeamId === teamId && ticket.assignedAgentId === userId)
        await db.ticket.update({
          where: { id },
          data: { assignedAgentId: null },
        });
      const cycle = ticket.workCycles[0];
      if (cycle && cycle.outcome === null)
        await db.subtask.updateMany({
          where: {
            ticketId: id,
            createdInCycleId: cycle.id,
            assignedTeamId: teamId,
            assignedAgentId: userId,
            status: { in: ['TODO', 'IN_PROGRESS'] },
          },
          data: { assignedAgentId: null },
        });
    }
  }

  async agentSpecialties(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== 'AGENT')
      throw new BadRequestException('User must be an AGENT');
    const links = await this.prisma.userSpecialty.findMany({
      where: { userId },
      select: {
        specialty: { select: { id: true, name: true, archivedAt: true } },
      },
      orderBy: { specialtyId: 'asc' },
    });
    return links.map((link) => link.specialty);
  }

  async specialtyLink(
    kind: 'agents' | 'teams',
    id: number,
    specialtyId: number,
    add: boolean,
    actor: { id: number; role: UserRole; sessionVersion?: number },
  ) {
    try {
      return await serializable(this.prisma, async (db) => {
        await requireActiveActor(db, actor);
        if (kind === 'agents') {
          const user = await lockUser(db, id);
          if (!user) throw new NotFoundException('User not found');
          if (user.role !== 'AGENT')
            throw new BadRequestException('User must be an AGENT');
          if (add && (user.status !== 'ACTIVE' || !user.activatedAt))
            throw new ConflictException('Agent must be active and activated');
        } else {
          await db.$queryRaw`SELECT id FROM "Team" WHERE id = ${id} FOR UPDATE`;
          const team = await db.team.findUnique({ where: { id } });
          if (!team) throw new NotFoundException('Team not found');
          if (add && team.archivedAt)
            throw new ConflictException('Team is archived');
        }
        await db.$queryRaw`SELECT id FROM "Specialty" WHERE id = ${specialtyId} FOR SHARE`;
        const specialty = await db.specialty.findUnique({
          where: { id: specialtyId },
        });
        if (!specialty) throw new NotFoundException('Specialty not found');
        if (add && specialty.archivedAt)
          throw new ConflictException('Specialty is archived');
        if (add) {
          if (kind === 'agents')
            await db.userSpecialty.create({
              data: { userId: id, specialtyId },
            });
          else
            await db.teamSpecialty.create({
              data: { teamId: id, specialtyId },
            });
        } else {
          const result =
            kind === 'agents'
              ? await db.userSpecialty.deleteMany({
                  where: { userId: id, specialtyId },
                })
              : await db.teamSpecialty.deleteMany({
                  where: { teamId: id, specialtyId },
                });
          if (!result.count)
            throw new NotFoundException('Specialty relationship not found');
        }
        return { message: add ? 'Specialty linked' : 'Specialty link removed' };
      });
    } catch (error) {
      this.throwConflict(error, 'Specialty is already linked');
      throw error;
    }
  }

  async assignManager(
    teamId: number,
    managerId: number,
    actor: { id: number; role: UserRole; sessionVersion?: number },
  ) {
    return serializable(this.prisma, async (db) => {
      await requireActiveActor(db, actor);
      await this.requireActiveUser(db, managerId, UserRole.MANAGER);
      await this.requireActiveTeam(db, teamId);
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
      await this.requireActiveTeam(db, teamId);
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
    if (user.status !== 'ACTIVE' || !user.activatedAt || user.role !== role)
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

  private async requireRegion(id: number, db: Prisma.TransactionClient) {
    await db.$queryRaw`SELECT id FROM "Region" WHERE id = ${id} FOR UPDATE`;
    const region = await db.region.findUnique({ where: { id } });
    if (!region) throw new NotFoundException('Region not found');
    if (region.archivedAt) throw new ConflictException('Region is archived');
    return region;
  }

  private async requireTeam(id: number) {
    const team = await this.prisma.team.findUnique({ where: { id } });
    if (!team) throw new NotFoundException('Team not found');
    return team;
  }

  private async requireActiveTeam(db: Prisma.TransactionClient, id: number) {
    await db.$queryRaw`SELECT id FROM "Team" WHERE id = ${id} FOR SHARE`;
    const team = await db.team.findUnique({ where: { id } });
    if (!team) throw new NotFoundException('Team not found');
    if (team.archivedAt) throw new ConflictException('Team is archived');
    return team;
  }

  async maintain(
    model: 'region' | 'department' | 'specialty' | 'team',
    id: number,
    change: { name: string } | { archived: boolean },
    actor: { id: number; role: UserRole; sessionVersion?: number },
  ) {
    if (actor.role !== 'ADMIN' && actor.role !== 'SUPER_ADMIN')
      throw new ForbiddenException('Organization administration required');
    try {
      return await serializable(this.prisma, async (db) => {
        await requireActiveActor(db, actor);
        // Table names come exclusively from this closed server-side mapping.
        const table = {
          region: 'Region',
          department: 'Department',
          specialty: 'Specialty',
          team: 'Team',
        }[model];
        await db.$queryRaw(
          Prisma.sql`SELECT id FROM ${Prisma.raw('"' + table + '"')} WHERE id = ${id} FOR UPDATE`,
        );
        const record = await (model === 'team'
          ? db.team.findUnique({ where: { id } })
          : model === 'region'
            ? db.region.findUnique({ where: { id } })
            : model === 'department'
              ? db.department.findUnique({ where: { id } })
              : db.specialty.findUnique({ where: { id } }));
        if (!record) throw new NotFoundException(`${table} not found`);
        const data: { name?: string; archivedAt?: Date | null } = {};
        if ('name' in change) {
          const name = change.name.trim();
          if (!name || name.length > (model === 'team' ? 150 : 100))
            throw new BadRequestException('Invalid organization name');
          data.name = name;
        } else {
          if (Boolean(record.archivedAt) === change.archived)
            return {
              id: record.id,
              name: record.name,
              archivedAt: record.archivedAt,
            };
          if (
            model === 'region' &&
            change.archived &&
            (await db.team.findFirst({
              where: { regionId: id, scope: 'REGION', archivedAt: null },
              select: { id: true },
            }))
          )
            throw new ConflictException(
              "Archive the region's active teams first.",
            );
          if (model === 'team') {
            if (change.archived) await this.offboardTeam(db, id);
            else {
              const team = await db.team.findUniqueOrThrow({ where: { id } });
              if (team.regionId !== null)
                await this.requireRegion(team.regionId, db);
            }
          }
          data.archivedAt = change.archived ? new Date() : null;
        }
        const select = { id: true, name: true, archivedAt: true } as const;
        switch (model) {
          case 'team':
            return db.team.update({ where: { id }, data, select });
          case 'region':
            return db.region.update({ where: { id }, data, select });
          case 'department':
            return db.department.update({ where: { id }, data, select });
          case 'specialty':
            return db.specialty.update({ where: { id }, data, select });
        }
      });
    } catch (error) {
      this.throwConflict(error, `A ${model} with this name already exists`);
      throw error;
    }
  }

  private async offboardTeam(db: Prisma.TransactionClient, teamId: number) {
    const tickets = await db.ticket.findMany({
      where: {
        status: { in: [...operationalStatuses] },
        OR: [
          { assignedTeamId: teamId },
          {
            subtasks: {
              some: {
                assignedTeamId: teamId,
                status: { in: ['TODO', 'IN_PROGRESS'] },
                createdInCycle: { outcome: null },
              },
            },
          },
        ],
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    for (const { id } of tickets) {
      await db.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${id} FOR UPDATE`;
      const ticket = await db.ticket.findUniqueOrThrow({
        where: { id },
        include: {
          assignedManager: {
            select: { role: true, status: true, activatedAt: true },
          },
          workCycles: { orderBy: { sequenceNumber: 'desc' }, take: 1 },
        },
      });
      if (!(operationalStatuses as readonly string[]).includes(ticket.status))
        continue;
      if (ticket.assignedTeamId === teamId) {
        const manager = ticket.assignedManager;
        const validManager =
          manager?.role === 'MANAGER' &&
          manager.status === 'ACTIVE' &&
          manager.activatedAt;
        await db.ticket.update({
          where: { id },
          data: {
            assignedTeamId: null,
            assignedAgentId: null,
            ...(!validManager
              ? { assignedManagerId: null, status: 'NEW' as const }
              : {}),
          },
        });
      }
      const cycle = ticket.workCycles[0];
      if (cycle && cycle.outcome === null)
        await db.subtask.updateMany({
          where: {
            ticketId: id,
            createdInCycleId: cycle.id,
            assignedTeamId: teamId,
            status: { in: ['TODO', 'IN_PROGRESS'] },
          },
          data: { assignedTeamId: null, assignedAgentId: null },
        });
    }
    await db.team.update({ where: { id: teamId }, data: { teamLeadId: null } });
    await db.teamManager.deleteMany({ where: { teamId } });
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
