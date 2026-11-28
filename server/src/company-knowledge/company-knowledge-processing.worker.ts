import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CompanyKnowledgeTextExtractionService } from './company-knowledge-text-extraction.service';
import {
  COMPANY_KNOWLEDGE_PROCESSING_STAGE,
  CompanyKnowledgeStatusGateway,
} from './company-knowledge-status.gateway';

export const COMPANY_KNOWLEDGE_QUEUE_POLL_INTERVAL_MS = 1_000;
export const COMPANY_KNOWLEDGE_PROCESSING_LEASE_MS = 60_000;

type ClaimedVersion = {
  id: number;
  documentId: number;
  storageKey: string;
  contentType: string;
  processingStartedAt: Date;
  updatedAt: Date;
};

@Injectable()
export class CompanyKnowledgeProcessingWorker
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(CompanyKnowledgeProcessingWorker.name);
  private readonly workerId = randomUUID();
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private stopping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly extraction: CompanyKnowledgeTextExtractionService,
    private readonly statusGateway: CompanyKnowledgeStatusGateway,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.trigger();
    }, COMPANY_KNOWLEDGE_QUEUE_POLL_INTERVAL_MS);
    this.timer.unref();
    void this.trigger();
  }

  trigger() {
    if (this.stopping || this.running) return this.running;
    this.running = this.processNext()
      .catch((error: unknown) => {
        this.logger.error('Company Knowledge queue polling failed', error);
      })
      .finally(() => {
        this.running = undefined;
      });
    return this.running;
  }

  async onModuleDestroy() {
    this.stopping = true;
    clearInterval(this.timer);
    await this.running;
  }

  private async processNext() {
    const claim = await this.claimNext();
    if (claim) {
      await this.statusGateway.emitStatus({
        documentId: claim.documentId,
        versionId: claim.id,
        status: 'PROCESSING',
        stage: COMPANY_KNOWLEDGE_PROCESSING_STAGE,
        processingStartedAt: claim.processingStartedAt,
        updatedAt: claim.updatedAt,
      });
      await this.processClaim(claim);
    }
  }

  private claimNext() {
    const leaseToken = randomUUID();
    return this.prisma.$queryRaw<ClaimedVersion[]>`
      WITH candidate AS (
        SELECT "id"
        FROM "CompanyKnowledgeDocumentVersion"
        WHERE "status" = 'UPLOADED'
           OR (
             "status" = 'PROCESSING'
             AND "processingLeaseExpiresAt" <= CURRENT_TIMESTAMP
           )
        ORDER BY "createdAt" ASC, "id" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "CompanyKnowledgeDocumentVersion" AS version
      SET "status" = 'PROCESSING',
          "processingStartedAt" = COALESCE("processingStartedAt", CURRENT_TIMESTAMP),
          "processingWorkerId" = ${this.workerId}::uuid,
          "processingLeaseToken" = ${leaseToken}::uuid,
          "processingLeaseExpiresAt" =
            CURRENT_TIMESTAMP + (${COMPANY_KNOWLEDGE_PROCESSING_LEASE_MS} * INTERVAL '1 millisecond'),
          "processingError" = NULL,
          "updatedAt" = CURRENT_TIMESTAMP
      FROM candidate
      WHERE version."id" = candidate."id"
      RETURNING version."id", version."documentId", version."storageKey",
                version."contentType", version."processingStartedAt",
                version."updatedAt"
    `.then((rows) => (rows[0] ? { ...rows[0], leaseToken } : null));
  }

  private async processClaim(claim: ClaimedVersion & { leaseToken: string }) {
    let leaseLost = false;
    let renewing: Promise<void> | undefined;
    const renew = () => {
      if (renewing || leaseLost) return;
      renewing = this.renewLease(claim)
        .then((renewed) => {
          if (!renewed) leaseLost = true;
        })
        .catch((error: unknown) => {
          leaseLost = true;
          this.logger.error(
            `Company Knowledge lease renewal failed for version ${claim.id}`,
            error,
          );
        })
        .finally(() => {
          renewing = undefined;
        });
    };
    const heartbeat = setInterval(
      renew,
      Math.floor(COMPANY_KNOWLEDGE_PROCESSING_LEASE_MS / 3),
    );
    heartbeat.unref();

    let text: string;
    try {
      text = await this.extraction.extract(claim.storageKey, claim.contentType);
    } catch {
      clearInterval(heartbeat);
      await renewing;
      if (!leaseLost) await this.fail(claim);
      this.logger.warn(
        `Company Knowledge extraction failed for version ${claim.id}`,
      );
      return;
    }
    clearInterval(heartbeat);
    await renewing;
    if (!leaseLost) await this.complete(claim, text);
  }

  private async renewLease(claim: ClaimedVersion & { leaseToken: string }) {
    const updated = await this.prisma.$executeRaw`
      UPDATE "CompanyKnowledgeDocumentVersion"
      SET "processingLeaseExpiresAt" =
            CURRENT_TIMESTAMP + (${COMPANY_KNOWLEDGE_PROCESSING_LEASE_MS} * INTERVAL '1 millisecond'),
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${claim.id}
        AND "status" = 'PROCESSING'
        AND "processingWorkerId" = ${this.workerId}::uuid
        AND "processingLeaseToken" = ${claim.leaseToken}::uuid
        AND "processingLeaseExpiresAt" > CURRENT_TIMESTAMP
    `;
    return updated === 1;
  }

  private async complete(
    claim: ClaimedVersion & { leaseToken: string },
    text: string,
  ) {
    const result = await this.prisma.$transaction(async (db) => {
      const updated = await db.$queryRaw<
        Array<{
          id: number;
          documentId: number;
          processingStartedAt: Date;
          updatedAt: Date;
        }>
      >`
        UPDATE "CompanyKnowledgeDocumentVersion"
        SET "status" = 'READY_FOR_REVIEW',
            "processingWorkerId" = NULL,
            "processingLeaseToken" = NULL,
            "processingLeaseExpiresAt" = NULL,
            "processingError" = NULL,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${claim.id}
          AND "status" = 'PROCESSING'
          AND "processingWorkerId" = ${this.workerId}::uuid
          AND "processingLeaseToken" = ${claim.leaseToken}::uuid
          AND "processingLeaseExpiresAt" > CURRENT_TIMESTAMP
        RETURNING "id", "documentId", "processingStartedAt", "updatedAt"
      `;
      if (updated.length === 0) return null;
      await db.companyKnowledgeExtractedText.create({
        data: { versionId: claim.id, text },
      });
      return updated[0];
    });
    if (result)
      await this.statusGateway.emitStatus({
        documentId: result.documentId,
        versionId: result.id,
        status: 'READY_FOR_REVIEW',
        stage: null,
        processingStartedAt: result.processingStartedAt,
        updatedAt: result.updatedAt,
      });
  }

  private async fail(claim: ClaimedVersion & { leaseToken: string }) {
    const error = 'Text extraction failed. Verify the file is valid and retry.';
    const updated = await this.prisma.$queryRaw<
      Array<{
        id: number;
        documentId: number;
        processingStartedAt: Date;
        updatedAt: Date;
      }>
    >`
      UPDATE "CompanyKnowledgeDocumentVersion"
      SET "status" = 'FAILED',
          "processingWorkerId" = NULL,
          "processingLeaseToken" = NULL,
          "processingLeaseExpiresAt" = NULL,
          "processingError" = ${error},
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${claim.id}
        AND "status" = 'PROCESSING'
        AND "processingWorkerId" = ${this.workerId}::uuid
        AND "processingLeaseToken" = ${claim.leaseToken}::uuid
        AND "processingLeaseExpiresAt" > CURRENT_TIMESTAMP
      RETURNING "id", "documentId", "processingStartedAt", "updatedAt"
    `;
    if (updated[0])
      await this.statusGateway.emitStatus({
        documentId: updated[0].documentId,
        versionId: updated[0].id,
        status: 'FAILED',
        stage: null,
        processingStartedAt: updated[0].processingStartedAt,
        updatedAt: updated[0].updatedAt,
      });
  }
}
