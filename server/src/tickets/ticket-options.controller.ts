import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/user-role.enum';
import { PrismaService } from '../prisma/prisma.service';

@Controller('ticket-options')
@UseGuards(AuthGuard, RolesGuard)
@Roles(
  UserRole.EMPLOYEE,
  UserRole.AGENT,
  UserRole.MANAGER,
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
)
export class TicketOptionsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Req() request: { user: { sub: number } }) {
    // Active reference data plus only the authenticated caller's home IDs.
    const select = { id: true, name: true } as const;
    const orderBy = { name: 'asc' } as const;
    const [categories, tags, regions, departments, requesterDefaults] =
      await Promise.all([
        this.prisma.ticketCategory.findMany({
          where: { archivedAt: null },
          select,
          orderBy,
        }),
        this.prisma.ticketTag.findMany({
          where: { archivedAt: null },
          select,
          orderBy,
        }),
        this.prisma.region.findMany({
          where: { archivedAt: null },
          select,
          orderBy,
        }),
        this.prisma.department.findMany({
          where: { archivedAt: null },
          select,
          orderBy,
        }),
        this.prisma.user.findUniqueOrThrow({
          where: { id: request.user.sub },
          select: { regionId: true, departmentId: true },
        }),
      ]);
    return { categories, tags, regions, departments, requesterDefaults };
  }
}
