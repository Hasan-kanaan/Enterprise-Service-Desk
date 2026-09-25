import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { requireActiveActor, serializable } from '../prisma/transactions';
import { UserRole } from '../../generated/prisma/client';

type Request = {
  user: { sub: number; role: UserRole; sessionVersion: number };
};
const projection = {
  id: true,
  type: true,
  ticketId: true,
  subtaskId: true,
  createdAt: true,
  readAt: true,
} as const;

@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@Req() request: Request) {
    return this.prisma.notification.findMany({
      where: { recipientUserId: request.user.sub },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
      select: projection,
    });
  }

  @Get('unread-count')
  async unread(@Req() request: Request) {
    return {
      count: await this.prisma.notification.count({
        where: { recipientUserId: request.user.sub, readAt: null },
      }),
    };
  }

  @Patch('read-all')
  readAll(@Req() request: Request) {
    return this.mark(request);
  }

  @Patch(':notificationId/read')
  read(
    @Param('notificationId', ParseIntPipe) id: number,
    @Req() request: Request,
  ) {
    return this.mark(request, id);
  }

  private mark(request: Request, id?: number) {
    return serializable(this.prisma, async (db) => {
      await requireActiveActor(db, { id: request.user.sub, ...request.user });
      const where = {
        recipientUserId: request.user.sub,
        ...(id === undefined ? {} : { id }),
      };
      if (
        id !== undefined &&
        !(await db.notification.findFirst({ where, select: { id: true } }))
      )
        throw new NotFoundException('Notification not found');
      await db.notification.updateMany({
        where: { ...where, readAt: null },
        data: { readAt: new Date() },
      });
      return { success: true };
    });
  }
}
