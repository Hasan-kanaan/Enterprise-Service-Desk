import { UserRole } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TicketAuthorizationService } from '../tickets/ticket-authorization.service';
import { AiRateLimiter } from './ai-rate-limiter';
import { AiRecommendationProvider } from './gemini.provider';
import { TicketAssistanceService } from './ticket-assistance.service';

describe('Requester AI provider boundary', () => {
  const findMany = jest.fn();
  const activeUser = {
    id: 7,
    role: UserRole.EMPLOYEE,
    status: 'ACTIVE',
    activatedAt: new Date(),
    sessionVersion: 0,
  };
  const db = {
    $queryRaw: jest.fn(),
    user: { findUnique: jest.fn().mockResolvedValue(activeUser) },
    ticketCategory: { findMany },
    ticketTag: { findMany },
    region: { findMany },
    department: { findMany },
  };
  const transaction = jest.fn((action: (client: typeof db) => unknown) =>
    action(db),
  );
  const generateDraft = jest.fn();
  const service = () =>
    new TicketAssistanceService(
      { $transaction: transaction } as unknown as PrismaService,
      {
        assertCanCreateTicket: jest.fn(),
      } as unknown as TicketAuthorizationService,
      { generateDraft } as unknown as AiRecommendationProvider,
      new AiRateLimiter(),
    );
  const actor = { id: 7, role: UserRole.EMPLOYEE };
  const dto = {
    description: 'VPN fails on my laptop; call +961 71 123 456 for details.',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    findMany.mockResolvedValue([]);
    db.user.findUnique.mockResolvedValue(activeUser);
    generateDraft.mockRejectedValue(new Error('synthetic provider failure'));
  });

  it('redacts phone numbers before sending draft text to the provider', async () => {
    await expect(service().assist(actor, dto)).rejects.toThrow();
    expect(generateDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        draft: {
          title: '',
          description: 'VPN fails on my laptop; call [phone] for details.',
        },
      }),
    );
  });

  it('consumes requester quota before provider failures and does not refund it', async () => {
    const assistance = service();
    for (let attempt = 0; attempt < 5; attempt++)
      await expect(assistance.assist(actor, dto)).rejects.toThrow();

    await expect(assistance.assist(actor, dto)).rejects.toMatchObject({
      status: 429,
    });
    expect(generateDraft).toHaveBeenCalledTimes(5);
  });

});
