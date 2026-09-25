import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Prisma, UserRole } from '../../generated/prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { TicketVisibilityService } from './ticket-visibility.service';
import { AttachmentStorage, attachmentSelect } from './attachment-storage';

type Request = { user: { sub: number; role: UserRole } };
@Controller('tickets')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.EMPLOYEE, UserRole.AGENT, UserRole.MANAGER)
export class AttachmentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visibility: TicketVisibilityService,
    private readonly storage: AttachmentStorage,
  ) {}

  @Get(':ticketId/attachments')
  list(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Req() request: Request,
  ) {
    return this.prisma.$transaction(
      async (db) => {
        const ticket = await db.ticket.findFirst({
          where: {
            AND: [
              { id: ticketId },
              this.visibility.buildWhere({
                id: request.user.sub,
                role: request.user.role,
              }),
            ],
          },
          select: { id: true },
        });
        if (!ticket) throw new NotFoundException('Ticket not found');
        return db.attachment.findMany({
          where: { ticketId },
          select: attachmentSelect,
          orderBy: { id: 'asc' },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  @Get('attachments/:attachmentId/download')
  async download(
    @Param('attachmentId', ParseIntPipe) id: number,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.prisma.$transaction(
      async (db) => {
        const file = await db.attachment.findUnique({
          where: { id },
          include: {
            message: { select: { ticketId: true, deletedAt: true } },
            internalNote: { select: { ticketId: true, deletedAt: true } },
          },
        });
        if (
          !file ||
          file.deletedAt ||
          file.message?.deletedAt ||
          file.internalNote?.deletedAt ||
          (file.internalNoteId !== null && request.user.role === UserRole.EMPLOYEE)
        )
          throw new NotFoundException('Attachment not found');
        const actor = { id: request.user.sub, role: request.user.role };
        const ticketId =
          file.ticketId ??
          file.message?.ticketId ??
          file.internalNote?.ticketId;
        const access = file.internalNoteId
          ? this.visibility.supportWhere(actor)
          : this.visibility.buildWhere(actor);
        const ticket = await db.ticket.findFirst({
          where: { AND: [{ id: ticketId }, access] },
          select: { id: true },
        });
        if (!ticket) throw new NotFoundException('Attachment not found');
        let bytes: Buffer;
        try {
          bytes = await this.storage.read(file.storageKey);
        } catch {
          throw new NotFoundException('Attachment unavailable');
        }
        return {
          bytes,
          filename: file.filename,
          contentType: file.contentType,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    response.setHeader('Content-Type', result.contentType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(result.filename).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16))}`,
    );
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader(
      'Content-Security-Policy',
      "sandbox; default-src 'none'",
    );
    return new StreamableFile(result.bytes);
  }
}
