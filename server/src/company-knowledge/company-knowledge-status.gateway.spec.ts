import { JwtService } from '@nestjs/jwt';
import type { Server, Socket } from 'socket.io';
import { jwtConstants } from '../auth/auth.constants';
import { PrismaService } from '../prisma/prisma.service';
import {
  COMPANY_KNOWLEDGE_STATUS_EVENT,
  CompanyKnowledgeStatusGateway,
  type CompanyKnowledgeStatusPayload,
} from './company-knowledge-status.gateway';

describe('CompanyKnowledgeStatusGateway', () => {
  const sessionId = '11111111-1111-4111-8111-111111111111';
  const verifyAsync = jest.fn();
  const findUnique = jest.fn();
  const findSession = jest.fn();
  const findManyUsers = jest.fn();
  const findManySessions = jest.fn();
  const findVersion = jest.fn();
  const gateway = new CompanyKnowledgeStatusGateway(
    { verifyAsync } as unknown as JwtService,
    {
      user: { findUnique, findMany: findManyUsers },
      userSession: { findFirst: findSession, findMany: findManySessions },
      companyKnowledgeDocumentVersion: { findUnique: findVersion },
    } as unknown as PrismaService,
  );
  let authenticate:
    ((socket: Socket, next: (error?: Error) => void) => void) | undefined;
  const sockets = new Map<string, Socket>();

  beforeEach(() => {
    jest.clearAllMocks();
    sockets.clear();
    verifyAsync.mockResolvedValue({
      sub: 1,
      sid: sessionId,
      sessionVersion: 0,
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    findUnique.mockResolvedValue({
      id: 1,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      activatedAt: new Date(),
      sessionVersion: 0,
      passwordChangeRequired: false,
    });
    findSession.mockResolvedValue({ id: sessionId });
    findManyUsers.mockResolvedValue([
      {
        id: 1,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        activatedAt: new Date(),
        sessionVersion: 0,
        passwordChangeRequired: false,
      },
    ]);
    findManySessions.mockResolvedValue([{ id: sessionId, userId: 1 }]);
    findVersion.mockResolvedValue({
      id: 12,
      documentId: 7,
      status: 'PROCESSING',
      processingStartedAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:01.000Z'),
    });

    const server = {
      use: (middleware: Parameters<Server['use']>[0]) => {
        authenticate = middleware;
      },
      sockets: { sockets },
    };
    gateway.afterInit(
      server as unknown as Parameters<
        CompanyKnowledgeStatusGateway['afterInit']
      >[0],
    );
  });

  async function connect(socket: Socket) {
    if (!authenticate)
      throw new Error('Socket authentication is not installed');
    await new Promise<void>((resolve, reject) => {
      authenticate!(socket, (error) => (error ? reject(error) : resolve()));
    });
  }

  it('accepts a valid SUPER_ADMIN database session before connecting', async () => {
    const socket = {
      handshake: { auth: { token: 'valid-token' } },
      data: {},
    } as unknown as Socket;

    await connect(socket);

    expect(socket.data).toMatchObject({
      companyKnowledgeIdentity: {
        userId: 1,
        sessionId,
        sessionVersion: 0,
      },
    });
    expect(verifyAsync).toHaveBeenCalledWith('valid-token', {
      secret: jwtConstants.secret,
    });
    expect(findSession).toHaveBeenCalledWith({
      where: { id: sessionId, userId: 1, revokedAt: null },
      select: { id: true },
    });
  });

  it('rejects expired JWTs using the same verification rules as HTTP auth', async () => {
    const expiredTokenError = new Error('expired');
    expiredTokenError.name = 'TokenExpiredError';
    verifyAsync.mockRejectedValueOnce(expiredTokenError);
    const socket = {
      handshake: { auth: { token: 'expired-token' } },
      data: {},
    } as unknown as Socket;

    await expect(connect(socket)).rejects.toThrow('Unauthorized');
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rejects a revoked or missing authenticated session', async () => {
    findSession.mockResolvedValueOnce(null);
    const socket = {
      handshake: { auth: { token: 'valid-token' } },
      data: {},
    } as unknown as Socket;

    await expect(connect(socket)).rejects.toThrow('Unauthorized');
    expect(findSession).toHaveBeenCalledWith({
      where: { id: sessionId, userId: 1, revokedAt: null },
      select: { id: true },
    });
  });

  it.each([
    ['ADMIN', 'ACTIVE', new Date(), 0, false],
    ['MANAGER', 'ACTIVE', new Date(), 0, false],
    ['AGENT', 'ACTIVE', new Date(), 0, false],
    ['EMPLOYEE', 'ACTIVE', new Date(), 0, false],
    ['SUPER_ADMIN', 'INACTIVE', new Date(), 0, false],
    ['SUPER_ADMIN', 'ACTIVE', null, 0, false],
    ['SUPER_ADMIN', 'ACTIVE', new Date(), 1, false],
    ['SUPER_ADMIN', 'ACTIVE', new Date(), 0, true],
  ])(
    'rejects a user who is not an active eligible SUPER_ADMIN',
    async (
      role,
      status,
      activatedAt,
      sessionVersion,
      passwordChangeRequired,
    ) => {
      findUnique.mockResolvedValue({
        id: 1,
        role,
        status,
        activatedAt,
        sessionVersion,
        passwordChangeRequired,
      });
      const socket = {
        handshake: { auth: { token: 'valid-token' } },
        data: {},
      } as unknown as Socket;

      await expect(connect(socket)).rejects.toThrow('Unauthorized');
    },
  );

  it.each(['ADMIN', 'MANAGER', 'AGENT', 'EMPLOYEE'])(
    'does not deliver to a connected %s socket',
    async (role) => {
      const emit = jest.fn();
      const disconnect = jest.fn();
      const socket = {
        data: {
          companyKnowledgeIdentity: {
            userId: 1,
            sessionId,
            sessionVersion: 0,
            expiresAt: Math.floor(Date.now() / 1000) + 60,
          },
        },
        emit,
        disconnect,
      } as unknown as Socket;
      sockets.set('admin', socket);
      findManyUsers.mockResolvedValue([
        {
          id: 1,
          role,
          status: 'ACTIVE',
          activatedAt: new Date(),
          sessionVersion: 0,
          passwordChangeRequired: false,
        },
      ]);

      await gateway.emitStatus({
        documentId: 7,
        versionId: 12,
        status: 'PROCESSING',
        stage: 'Extracting document text',
        processingStartedAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:01.000Z'),
      });

      expect(emit).not.toHaveBeenCalled();
      expect(disconnect).toHaveBeenCalledWith(true);
    },
  );

  it('sends only the status payload to an authenticated SUPER_ADMIN socket', async () => {
    const sentPayloads: CompanyKnowledgeStatusPayload[] = [];
    const emit = jest.fn(
      (_event: string, payload: CompanyKnowledgeStatusPayload) => {
        sentPayloads.push(payload);
      },
    );
    const socket = {
      handshake: { auth: { token: 'valid-token' } },
      data: {},
      emit,
      disconnect: jest.fn(),
    } as unknown as Socket;
    await connect(socket);
    sockets.set('admin', socket);
    const payload: CompanyKnowledgeStatusPayload = {
      documentId: 7,
      versionId: 12,
      status: 'PROCESSING',
      stage: 'Extracting document text',
      processingStartedAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:01.000Z'),
    };

    await gateway.emitStatus(payload);

    expect(emit).toHaveBeenCalledWith(COMPANY_KNOWLEDGE_STATUS_EVENT, payload);
    expect(Object.keys(sentPayloads[0])).toEqual([
      'documentId',
      'versionId',
      'status',
      'stage',
      'processingStartedAt',
      'updatedAt',
    ]);
  });
});
