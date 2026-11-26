import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TicketAuthorizationService } from '../tickets/ticket-authorization.service';
import { TicketVisibilityService } from '../tickets/ticket-visibility.service';
import { AiRateLimiter } from './ai-rate-limiter';
import { AiRecommendationProvider } from './gemini.provider';
import { AiRecommendationsService } from './ai-recommendations.service';

describe('AI recommendations responsibility', () => {
  const activeUser = {
    id: 20,
    role: UserRole.MANAGER,
    status: 'ACTIVE',
    activatedAt: new Date(),
    sessionVersion: 0,
  };
  const ticket = {
    title: 'Unclaimed intake',
    description: 'Needs review',
    updatedAt: new Date(),
    status: 'NEW',
    assignedManagerId: null,
    assignedTeamId: null,
    assignedAgentId: null,
    category: { name: 'General' },
    priority: 'LOW',
    tags: [],
  };
  const db = {
    $queryRaw: jest.fn(),
    user: { findUnique: jest.fn() },
    ticket: { findFirst: jest.fn() },
  };
  const transaction = jest.fn((action: (client: typeof db) => unknown) =>
    action(db),
  );
  const generate = jest.fn();
  const consume = jest.fn();
  const service = () =>
    new AiRecommendationsService(
      { $transaction: transaction } as unknown as PrismaService,
      { buildWhere: jest.fn(() => ({})) } as unknown as TicketVisibilityService,
      {} as TicketAuthorizationService,
      { generate } as unknown as AiRecommendationProvider,
      { consume } as unknown as AiRateLimiter,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    db.user.findUnique.mockResolvedValue(activeUser);
    db.ticket.findFirst.mockResolvedValue(ticket);
  });

  it('rejects unclaimed intake before consuming quota or calling the provider', async () => {
    await expect(
      service().generate(142, {
        id: 20,
        role: UserRole.MANAGER,
        sessionVersion: 0,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(generate).not.toHaveBeenCalled();
    expect(consume).not.toHaveBeenCalled();
    expect(db.ticket.findFirst).toHaveBeenCalledTimes(1);
  });
});
