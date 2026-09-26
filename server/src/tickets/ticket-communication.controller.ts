import { ListQuery } from '../common/list-query';
import { Delete, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { AttachmentUploads, Upload } from './attachment-storage';
import {
  AttachmentFilesInterceptor,
  AttachmentPayloadInterceptor,
} from './attachment-upload.interceptor';
import { DeleteCommunicationDto } from './dto/ticket-communication.dto';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/user-role.enum';
import { TicketAuthorizationUser } from './ticket-authorization.types';
import { TicketCommunicationService } from './ticket-communication.service';
import {
  CreateCommunicationDto,
  EditCommunicationDto,
} from './dto/ticket-communication.dto';
type Request = {
  user: {
    sub: number;
    role: TicketAuthorizationUser['role'];
    sessionVersion?: number;
  };
};

@Controller('tickets')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.EMPLOYEE, UserRole.AGENT, UserRole.MANAGER)
export class TicketCommunicationController {
  constructor(
    private readonly communication: TicketCommunicationService,
    private readonly uploads: AttachmentUploads,
  ) {}
  private actor(request: Request): TicketAuthorizationUser {
    return {
      id: request.user.sub,
      role: request.user.role,
      sessionVersion: request.user.sessionVersion,
    };
  }

  @Get(':ticketId/messages')
  readMessages(
    @Param('ticketId', ParseIntPipe) id: number,
    @Req() request: Request,
    @Query() query: ListQuery = {},
  ) {
    return this.communication.read(id, this.actor(request), 'messages', query);
  }
  @Post(':ticketId/messages')
  @UseInterceptors(AttachmentFilesInterceptor, AttachmentPayloadInterceptor)
  createMessages(
    @Param('ticketId', ParseIntPipe) id: number,
    @Req() request: Request,
    @Body() dto: CreateCommunicationDto,
    @UploadedFiles() files: Upload[] = [],
  ) {
    return this.uploads.run(files, (batch) =>
      this.communication.write(
        id,
        this.actor(request),
        'messages',
        dto,
        undefined,
        batch,
      ),
    );
  }

  @Patch(':ticketId/messages/:recordId')
  editMessages(
    @Param('ticketId', ParseIntPipe) id: number,
    @Param('recordId', ParseIntPipe) recordId: number,
    @Req() request: Request,
    @Body() dto: EditCommunicationDto,
  ) {
    return this.communication.write(
      id,
      this.actor(request),
      'messages',
      dto,
      recordId,
    );
  }

  @Get(':ticketId/internal-notes')
  readNotes(
    @Param('ticketId', ParseIntPipe) id: number,
    @Req() request: Request,
    @Query() query: ListQuery = {},
  ) {
    return this.communication.read(
      id,
      this.actor(request),
      'internal-notes',
      query,
    );
  }
  @Post(':ticketId/internal-notes')
  @UseInterceptors(AttachmentFilesInterceptor, AttachmentPayloadInterceptor)
  createNotes(
    @Param('ticketId', ParseIntPipe) id: number,
    @Req() request: Request,
    @Body() dto: CreateCommunicationDto,
    @UploadedFiles() files: Upload[] = [],
  ) {
    return this.uploads.run(files, (batch) =>
      this.communication.write(
        id,
        this.actor(request),
        'internal-notes',
        dto,
        undefined,
        batch,
      ),
    );
  }

  @Patch(':ticketId/internal-notes/:recordId')
  editNotes(
    @Param('ticketId', ParseIntPipe) id: number,
    @Param('recordId', ParseIntPipe) recordId: number,
    @Req() request: Request,
    @Body() dto: EditCommunicationDto,
  ) {
    return this.communication.write(
      id,
      this.actor(request),
      'internal-notes',
      dto,
      recordId,
    );
  }

  @Delete(':ticketId/messages/:recordId')
  deleteMessage(
    @Param('ticketId', ParseIntPipe) id: number,
    @Param('recordId', ParseIntPipe) recordId: number,
    @Req() request: Request,
    @Body() dto: DeleteCommunicationDto,
  ) {
    return this.communication.write(
      id,
      this.actor(request),
      'messages',
      { ...dto, content: '' },
      recordId,
      undefined,
      true,
      undefined,
    );
  }

  @Delete(':ticketId/messages/:recordId/attachments/:attachmentId')
  deleteMessageAttachment(
    @Param('ticketId', ParseIntPipe) id: number,
    @Param('recordId', ParseIntPipe) recordId: number,
    @Req() request: Request,
    @Body() dto: DeleteCommunicationDto,
    @Param('attachmentId', ParseIntPipe) attachmentId: number,
  ) {
    return this.communication.write(
      id,
      this.actor(request),
      'messages',
      { ...dto, content: '' },
      recordId,
      undefined,
      true,
      attachmentId,
    );
  }

  @Delete(':ticketId/internal-notes/:recordId')
  deleteNote(
    @Param('ticketId', ParseIntPipe) id: number,
    @Param('recordId', ParseIntPipe) recordId: number,
    @Req() request: Request,
    @Body() dto: DeleteCommunicationDto,
  ) {
    return this.communication.write(
      id,
      this.actor(request),
      'internal-notes',
      { ...dto, content: '' },
      recordId,
      undefined,
      true,
      undefined,
    );
  }

  @Delete(':ticketId/internal-notes/:recordId/attachments/:attachmentId')
  deleteNoteAttachment(
    @Param('ticketId', ParseIntPipe) id: number,
    @Param('recordId', ParseIntPipe) recordId: number,
    @Req() request: Request,
    @Body() dto: DeleteCommunicationDto,
    @Param('attachmentId', ParseIntPipe) attachmentId: number,
  ) {
    return this.communication.write(
      id,
      this.actor(request),
      'internal-notes',
      { ...dto, content: '' },
      recordId,
      undefined,
      true,
      attachmentId,
    );
  }
}
