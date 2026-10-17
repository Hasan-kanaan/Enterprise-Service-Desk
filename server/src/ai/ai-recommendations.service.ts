import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma, UserRole } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { requireActiveActor } from '../prisma/transactions';
import { TicketAuthorizationService } from '../tickets/ticket-authorization.service';
import { TicketAuthorizationUser } from '../tickets/ticket-authorization.types';
import { TicketVisibilityService } from '../tickets/ticket-visibility.service';
import {
  AI_MODEL,
  AiInput,
  Candidate,
  PROMPT_VERSION,
  redact,
  validateResult,
} from './ai-contract';
import {
  AiRecommendationProvider,
  routingTokenReservation,
} from './gemini.provider';
import { AiRateLimiter } from './ai-rate-limiter';
import { AiUnavailableException } from './ai-unavailable.exception';

const named = { id: true, name: true } as const;
const specialties = {
  where: { specialty: { archivedAt: null } },
  orderBy: { specialtyId: 'asc' },
  take: 5,
  select: { specialty: { select: { name: true } } },
} as const;

@Injectable()
export class AiRecommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visibility: TicketVisibilityService,
    private readonly policy: TicketAuthorizationService,
    private readonly provider: AiRecommendationProvider,
    private readonly limiter: AiRateLimiter,
  ) {}

  private snapshot(ticketId: number, actor: TicketAuthorizationUser) {
    if (actor.role !== UserRole.MANAGER) throw new ForbiddenException();
    return this.prisma.$transaction(
      async (db) => {
        await requireActiveActor(db, actor);
        const ticket = await db.ticket.findFirst({
          where: { AND: [{ id: ticketId }, this.visibility.buildWhere(actor)] },
          select: {
            title: true,
            description: true,
            updatedAt: true,
            status: true,
            assignedManagerId: true,
            assignedTeamId: true,
            assignedAgentId: true,
            category: { select: { name: true } },
            priority: true,
            tags: {
              where: { tag: { archivedAt: null } },
              take: 30,
              orderBy: { tagId: 'asc' },
              select: { tag: { select: { name: true } } },
            },
          },
        });
        if (!ticket) throw new NotFoundException('Ticket not found');
        // Intake/requester visibility grants classification only, never an assignment directory.
        const canRoute =
          ticket.assignedManagerId === actor.id &&
          !['RESOLVED', 'CLOSED', 'CANCELLED'].includes(ticket.status);
        const [categories, tags] = await Promise.all([
          db.ticketCategory.findMany({
            where: { archivedAt: null },
            select: named,
            orderBy: { id: 'asc' },
            take: 30,
          }),
          db.ticketTag.findMany({
            where: { archivedAt: null },
            select: named,
            orderBy: { id: 'asc' },
            take: 30,
          }),
        ]);
        const teams = canRoute
          ? await db.team.findMany({
              where: this.policy.responsibleManagerTeamWhere(actor.id),
              select: { ...named, specialties },
              // REGION precedes GLOBAL in the enum: managed regional teams first.
              orderBy: [{ scope: 'asc' }, { id: 'asc' }],
              take: 20,
            })
          : [];
        const teamIds = teams.map((t) => t.id);
        const eligibleAgents = (
          teamId: number,
          take: number,
          excluded: number[],
        ) =>
          db.user.findMany({
            where: {
              id: { notIn: excluded },
              role: 'AGENT',
              status: 'ACTIVE',
              activatedAt: { not: null },
              teamMemberships: { some: { teamId } },
            },
            select: {
              id: true,
              displayName: true,
              specialties,
              teamMemberships: {
                where: { teamId: { in: teamIds } },
                orderBy: { teamId: 'asc' },
                take: 20,
                select: { teamId: true },
              },
            },
            orderBy: { id: 'asc' },
            take,
          });
        const agents: Awaited<ReturnType<typeof eligibleAgents>> = [];
        for (const teamId of teamIds) {
          if (agents.length === 40) break;
          agents.push(
            ...(await eligibleAgents(
              teamId,
              40 - agents.length,
              agents.map((a) => a.id),
            )),
          );
        }
        const cleanName = (c: Candidate) => ({
          id: c.id,
          name: redact(c.name, 150),
        });
        const input: AiInput = {
          ticket: {
            title: redact(ticket.title, 200),
            description: redact(ticket.description, 6000),
            category: redact(ticket.category.name, 100),
            priority: ticket.priority,
            tags: ticket.tags.map((t) => redact(t.tag.name, 100)),
          },
          candidates: {
            categories: categories.map(cleanName),
            tags: tags.map(cleanName),
            teams: teams.map((t) => ({
              ...cleanName(t),
              specialties: t.specialties.map((s) =>
                redact(s.specialty.name, 100),
              ),
            })),
            agents: agents.map((a) => ({
              id: a.id,
              name: redact(a.displayName, 150),
              teamIds: a.teamMemberships.map((m) => m.teamId),
              specialties: a.specialties.map((s) =>
                redact(s.specialty.name, 100),
              ),
            })),
          },
        };
        return {
          input,
          updatedAt: ticket.updatedAt.toISOString(),
          fingerprint: createHash('sha256')
            .update(
              JSON.stringify([
                input,
                ticket.updatedAt,
                ticket.status,
                ticket.assignedManagerId,
                ticket.assignedTeamId,
                ticket.assignedAgentId,
              ]),
            )
            .digest('hex'),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async generate(ticketId: number, actor: TicketAuthorizationUser) {
    const before = await this.snapshot(ticketId, actor);
    this.limiter.consume(
      actor.id,
      undefined,
      routingTokenReservation(before.input),
    );
    let result: ReturnType<typeof validateResult>;
    try {
      result = validateResult(
        await this.provider.generate(before.input),
        before.input,
      );
    } catch {
      // Never propagate/log provider bodies, prompts, secrets or exception details.
      throw new AiUnavailableException();
    }
    const after = await this.snapshot(ticketId, actor);
    if (before.fingerprint !== after.fingerprint)
      throw new ConflictException(
        'Ticket or eligible choices changed. Reload and regenerate AI suggestions.',
      );
    const name = (id: number | null, candidates: Candidate[]) =>
      candidates.find((c) => c.id === id)?.name ?? null;
    return {
      ticketId,
      ticketUpdatedAt: before.updatedAt,
      generatedAt: new Date().toISOString(),
      provider: 'gemini',
      model: AI_MODEL,
      promptVersion: PROMPT_VERSION,
      suggestions: {
        category: {
          ...result.category,
          name: name(result.category.id, before.input.candidates.categories),
        },
        priority: result.priority,
        tags: result.tags.map((t) => ({
          ...t,
          name: name(t.id, before.input.candidates.tags),
        })),
        team: {
          ...result.team,
          name: name(result.team.id, before.input.candidates.teams),
        },
        agent: {
          ...result.agent,
          name: name(result.agent.id, before.input.candidates.agents),
        },
      },
    };
  }
}
