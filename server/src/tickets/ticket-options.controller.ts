import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/user-role.enum';
import { PrismaService } from '../prisma/prisma.service';

@Controller('ticket-options')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.EMPLOYEE, UserRole.AGENT, UserRole.MANAGER)
export class TicketOptionsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list() {
    // Reference data only; no account directory or administrative team data.
    const select = { id: true, name: true } as const;
    const orderBy = { name: 'asc' } as const;
    const [categories, tags, regions, departments] = await Promise.all([
      this.prisma.ticketCategory.findMany({ select, orderBy }),
      this.prisma.ticketTag.findMany({ select, orderBy }),
      this.prisma.region.findMany({ select, orderBy }),
      this.prisma.department.findMany({ select, orderBy }),
    ]);
    return { categories, tags, regions, departments };
  }
}
