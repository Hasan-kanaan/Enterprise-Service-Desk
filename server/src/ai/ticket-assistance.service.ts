import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { requireActiveActor } from '../prisma/transactions';
import { TicketAuthorizationService } from '../tickets/ticket-authorization.service';
import { TicketAuthorizationUser } from '../tickets/ticket-authorization.types';
import { AiRateLimiter } from './ai-rate-limiter';
import {
  AiRecommendationProvider,
  draftTokenReservation,
} from './gemini.provider';
import { AiUnavailableException } from './ai-unavailable.exception';
import { AI_MODEL, priorities, redact } from './ai-contract';
import {
  DRAFT_DESCRIPTION_MAX,
  DRAFT_DESCRIPTION_MIN,
  DRAFT_PROMPT_VERSION,
  DraftAiInput,
  meaningfulCharacters,
  validateDraftResult,
} from './ticket-assistance.contract';
import { TicketAssistanceDto } from './ticket-assistance.dto';

@Injectable()
export class TicketAssistanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: TicketAuthorizationService,
    private readonly provider: AiRecommendationProvider,
    private readonly limiter: AiRateLimiter,
  ) {}

  private choices(actor: TicketAuthorizationUser) {
    this.policy.assertCanCreateTicket(actor);
    return this.prisma.$transaction(
      async (db) => {
        await requireActiveActor(db, actor);
        // Same active public catalogs as ticket-options. No organization-admin API,
        // user directory, home identity or routing data is needed for this projection.
        const query = {
          where: { archivedAt: null },
          select: { id: true, name: true },
          orderBy: { id: 'asc' },
          take: 30,
        } as const;
        const [categories, tags, regions, departments] = await Promise.all([
          db.ticketCategory.findMany(query),
          db.ticketTag.findMany(query),
          db.region.findMany(query),
          db.department.findMany(query),
        ]);
        const clean = (items: { id: number; name: string }[]) =>
          items.map((c) => ({ id: c.id, name: redact(c.name, 100) }));
        return {
          categories: clean(categories),
          tags: clean(tags),
          regions: clean(regions),
          departments: clean(departments),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async assist(actor: TicketAuthorizationUser, dto: TicketAssistanceDto) {
    if (
      typeof dto.description !== 'string' ||
      dto.description.length > DRAFT_DESCRIPTION_MAX ||
      meaningfulCharacters(dto.description) < DRAFT_DESCRIPTION_MIN ||
      (dto.title !== undefined &&
        (typeof dto.title !== 'string' || dto.title.length > 200))
    )
      throw new BadRequestException(
        'For AI assistance, use a description with at least 20 letters or digits and no more than 3,000 characters, and a title of at most 200 characters. Your manual ticket can still be submitted.',
      );
    const candidates = await this.choices(actor);
    const input: DraftAiInput = {
      draft: {
        title: redact(dto.title ?? '', 200),
        description: redact(dto.description, DRAFT_DESCRIPTION_MAX),
      },
      candidates,
      priorities,
    };
    this.limiter.consumeRequester(
      actor.id,
      undefined,
      draftTokenReservation(input),
    );
    let result: ReturnType<typeof validateDraftResult>;
    try {
      result = validateDraftResult(
        await this.provider.generateDraft(input),
        input,
      );
    } catch {
      throw new AiUnavailableException();
    }
    const current = await this.choices(actor);
    if (JSON.stringify(current) !== JSON.stringify(candidates))
      throw new ConflictException(
        'Available choices changed. Review your draft and ask for assistance again.',
      );
    return {
      ...result,
      provider: 'gemini',
      model: AI_MODEL,
      promptVersion: DRAFT_PROMPT_VERSION,
      generatedAt: new Date().toISOString(),
    };
  }
}
