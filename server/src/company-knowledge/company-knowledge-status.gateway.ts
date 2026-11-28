import { Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { DefaultEventsMap, Server, Socket } from 'socket.io';
import {
  UserRole,
  type CompanyKnowledgeVersionStatus,
} from '../../generated/prisma/client';
import { jwtConstants } from '../auth/auth.constants';
import { PrismaService } from '../prisma/prisma.service';
import { securityConfig } from '../security/security.config';

export const COMPANY_KNOWLEDGE_STATUS_EVENT = 'company-knowledge:status';
export const COMPANY_KNOWLEDGE_PROCESSING_STAGE = 'Extracting document text';

export type CompanyKnowledgeStatusPayload = {
  documentId: number;
  versionId: number;
  status: CompanyKnowledgeVersionStatus;
  stage: string | null;
  processingStartedAt: Date | null;
  updatedAt: Date;
};

type CompanyKnowledgeSocketData = {
  companyKnowledgeIdentity?: {
    userId: number;
    sessionId: string;
    sessionVersion: number;
    expiresAt?: number;
  };
};
type AuthenticatedSocket = Socket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  CompanyKnowledgeSocketData
>;
type CompanyKnowledgeServer = Server<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  CompanyKnowledgeSocketData
>;

@WebSocketGateway({
  cors: { origin: securityConfig().origins, credentials: true },
})
export class CompanyKnowledgeStatusGateway implements OnGatewayInit {
  private readonly logger = new Logger(CompanyKnowledgeStatusGateway.name);
  private emissionQueue = Promise.resolve();

  @WebSocketServer()
  private server?: CompanyKnowledgeServer;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit(server: CompanyKnowledgeServer) {
    this.server = server;
    server.use((client, next) => {
      void this.authenticate(client, next);
    });
  }

  emitStatus(payload: CompanyKnowledgeStatusPayload) {
    const delivery = this.emissionQueue.then(() => this.deliverStatus(payload));
    this.emissionQueue = delivery.catch(() => undefined);
    return delivery;
  }

  private async deliverStatus(payload: CompanyKnowledgeStatusPayload) {
    const sockets = [...(this.server?.sockets.sockets.values() ?? [])];
    if (!sockets.length) return;

    try {
      const active = sockets.flatMap((socket) => {
        const identity = socket.data.companyKnowledgeIdentity;
        if (!identity) return [];
        return [{ socket, identity }];
      });
      if (!active.length) return;

      const users = await this.prisma.user.findMany({
        where: {
          id: {
            in: [...new Set(active.map(({ identity }) => identity.userId))],
          },
        },
        select: {
          id: true,
          role: true,
          status: true,
          activatedAt: true,
          sessionVersion: true,
          passwordChangeRequired: true,
        },
      });
      const sessions = await this.prisma.userSession.findMany({
        where: {
          id: {
            in: [...new Set(active.map(({ identity }) => identity.sessionId))],
          },
          revokedAt: null,
        },
        select: { id: true, userId: true },
      });
      const usersById = new Map(users.map((user) => [user.id, user]));
      const sessionsById = new Map(
        sessions.map((session) => [session.id, session]),
      );
      const version =
        await this.prisma.companyKnowledgeDocumentVersion.findUnique({
          where: { id: payload.versionId },
          select: {
            id: true,
            documentId: true,
            status: true,
            processingStartedAt: true,
            updatedAt: true,
          },
        });
      if (!version || version.documentId !== payload.documentId) return;
      const currentPayload: CompanyKnowledgeStatusPayload = {
        documentId: version.documentId,
        versionId: version.id,
        status: version.status,
        stage:
          version.status === 'PROCESSING'
            ? COMPANY_KNOWLEDGE_PROCESSING_STAGE
            : null,
        processingStartedAt: version.processingStartedAt,
        updatedAt: version.updatedAt,
      };

      for (const { socket, identity } of active) {
        const user = usersById.get(identity.userId);
        const session = sessionsById.get(identity.sessionId);
        if (
          !user ||
          user.role !== UserRole.SUPER_ADMIN ||
          user.status !== 'ACTIVE' ||
          !user.activatedAt ||
          user.sessionVersion !== identity.sessionVersion ||
          user.passwordChangeRequired ||
          !session ||
          session.userId !== identity.userId ||
          (identity.expiresAt !== undefined &&
            identity.expiresAt <= Math.floor(Date.now() / 1000))
        ) {
          socket.disconnect(true);
          continue;
        }
        socket.emit(COMPANY_KNOWLEDGE_STATUS_EVENT, currentPayload);
      }
    } catch {
      this.logger.error('Company Knowledge status delivery failed');
    }
  }

  private async authenticate(
    socket: AuthenticatedSocket,
    next: (error?: Error) => void,
  ) {
    try {
      const token: unknown = socket.handshake.auth?.token;
      if (typeof token !== 'string' || token.length > 8192)
        throw new UnauthorizedException();
      const payload = await this.jwt.verifyAsync<{
        sub: number;
        sid?: string;
        sessionVersion?: number;
        exp?: number;
      }>(token, { secret: jwtConstants.secret });
      if (
        !Number.isInteger(payload.sub) ||
        payload.sub < 1 ||
        typeof payload.sid !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          payload.sid,
        ) ||
        !Number.isInteger(payload.sessionVersion)
      )
        throw new UnauthorizedException();

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          role: true,
          status: true,
          activatedAt: true,
          sessionVersion: true,
          passwordChangeRequired: true,
        },
      });
      if (
        !user ||
        user.role !== UserRole.SUPER_ADMIN ||
        user.status !== 'ACTIVE' ||
        !user.activatedAt ||
        user.sessionVersion !== payload.sessionVersion ||
        user.passwordChangeRequired
      )
        throw new UnauthorizedException();

      const session = await this.prisma.userSession.findFirst({
        where: { id: payload.sid, userId: user.id, revokedAt: null },
        select: { id: true },
      });
      if (!session) throw new UnauthorizedException();

      socket.data.companyKnowledgeIdentity = {
        userId: user.id,
        sessionId: session.id,
        sessionVersion: user.sessionVersion,
        expiresAt: payload.exp,
      };
      next();
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        (error instanceof Error &&
          ['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(
            error.name,
          ))
      ) {
        next(new Error('Unauthorized'));
        return;
      }
      this.logger.error('Company Knowledge socket authentication failed');
      next(new Error('Authentication unavailable'));
    }
  }
}
