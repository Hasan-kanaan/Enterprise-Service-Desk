import { AttachmentsController } from './attachments.controller';
import {
  AttachmentStorage,
  LocalAttachmentStorage,
  AttachmentUploads,
} from './attachment-storage';
import { Module } from '@nestjs/common';
import { TicketCommunicationController } from './ticket-communication.controller';
import { TicketCommunicationService } from './ticket-communication.service';
import { TicketAuthorizationService } from './ticket-authorization.service';
import { TicketVisibilityService } from './ticket-visibility.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { JwtModule } from '@nestjs/jwt';
import { jwtConstants } from '../auth/auth.constants';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { TicketWorkspaceController } from './ticket-workspace.controller';
import { TicketOptionsController } from './ticket-options.controller';

@Module({
  imports: [JwtModule.register({ secret: jwtConstants.secret })],
  controllers: [
    AttachmentsController,
    TicketCommunicationController,
    TicketsController,
    TicketOptionsController,
    TicketWorkspaceController,
  ],
  providers: [
    { provide: AttachmentStorage, useClass: LocalAttachmentStorage },
    AttachmentUploads,
    TicketCommunicationService,
    TicketAuthorizationService,
    TicketVisibilityService,
    TicketsService,
    AuthGuard,
    RolesGuard,
  ],
  exports: [TicketAuthorizationService, TicketVisibilityService],
})
export class TicketsAuthorizationModule {}
