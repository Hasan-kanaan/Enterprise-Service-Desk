import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import { after, listPage, listWindow, ListQuery } from '../common/list-query';
import { PrismaService } from '../prisma/prisma.service';
import { CompanyKnowledgeStorage } from './company-knowledge.storage';
import { CompanyKnowledgeUpload } from './company-knowledge-upload.interceptor';

const versionMetadataSelect = {
  id: true,
  versionNumber: true,
  originalName: true,
  contentType: true,
  byteSize: true,
  sha256: true,
  status: true,
  processingError: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CompanyKnowledgeDocumentVersionSelect;

const documentMetadataSelect = {
  id: true,
  title: true,
  createdAt: true,
  updatedAt: true,
  versions: {
    select: versionMetadataSelect,
    orderBy: { versionNumber: 'desc' },
  },
} satisfies Prisma.CompanyKnowledgeDocumentSelect;

type UploadActor = { id: number };

@Injectable()
export class CompanyKnowledgeService {
  private readonly logger = new Logger(CompanyKnowledgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: CompanyKnowledgeStorage,
  ) {}

  async list(query: ListQuery) {
    const window = listWindow(query);
    const rows = await this.prisma.companyKnowledgeDocument.findMany({
      where: {
        ...after(window.position),
        ...(window.search
          ? {
              title: {
                contains: window.search,
                mode: 'insensitive',
              },
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: window.limit + 1,
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { versions: true } },
        versions: {
          take: 1,
          orderBy: { versionNumber: 'desc' },
          select: versionMetadataSelect,
        },
      },
    });
    return listPage(rows, window.limit);
  }

  async details(id: number) {
    const document = await this.prisma.companyKnowledgeDocument.findUnique({
      where: { id },
      select: documentMetadataSelect,
    });
    if (!document) throw new NotFoundException('Company document not found');
    return document;
  }

  async uploadNew(file: CompanyKnowledgeUpload, actor: UploadActor) {
    const storageKey = randomUUID();
    return this.persistWithCleanup(
      storageKey,
      file.path,
      (markCommitUncertain) =>
        this.prisma.$transaction(async (db) => {
          const document = await db.companyKnowledgeDocument.create({
            data: {
              title: file.originalName,
              versions: {
                create: {
                  versionNumber: 1,
                  uploadedById: actor.id,
                  originalName: file.originalName,
                  contentType: file.contentType,
                  byteSize: file.byteSize,
                  sha256: file.sha256,
                  storageKey,
                },
              },
            },
            select: documentMetadataSelect,
          });
          markCommitUncertain();
          return document;
        }),
      () =>
        this.prisma.companyKnowledgeDocument.findFirst({
          where: { versions: { some: { storageKey } } },
          select: documentMetadataSelect,
        }),
    );
  }

  async uploadVersion(
    documentId: number,
    file: CompanyKnowledgeUpload,
    actor: UploadActor,
  ) {
    const exists = await this.prisma.companyKnowledgeDocument.findUnique({
      where: { id: documentId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Company document not found');

    const storageKey = randomUUID();
    return this.persistWithCleanup(
      storageKey,
      file.path,
      (markCommitUncertain) =>
        this.prisma.$transaction(async (db) => {
          const locked = await db.$queryRaw<Array<{ id: number }>>`
            SELECT "id"
            FROM "CompanyKnowledgeDocument"
            WHERE "id" = ${documentId}
            FOR UPDATE
          `;
          if (locked.length === 0)
            throw new NotFoundException('Company document not found');

          const latest = await db.companyKnowledgeDocumentVersion.aggregate({
            where: { documentId },
            _max: { versionNumber: true },
          });
          const version = await db.companyKnowledgeDocumentVersion.create({
            data: {
              documentId,
              versionNumber: (latest._max.versionNumber ?? 0) + 1,
              uploadedById: actor.id,
              originalName: file.originalName,
              contentType: file.contentType,
              byteSize: file.byteSize,
              sha256: file.sha256,
              storageKey,
            },
            select: versionMetadataSelect,
          });
          await db.companyKnowledgeDocument.update({
            where: { id: documentId },
            data: { updatedAt: new Date() },
          });
          markCommitUncertain();
          return version;
        }),
      () =>
        this.prisma.companyKnowledgeDocumentVersion.findUnique({
          where: { storageKey },
          select: versionMetadataSelect,
        }),
    );
  }

  async downloadMetadata(versionId: number) {
    const version =
      await this.prisma.companyKnowledgeDocumentVersion.findUnique({
        where: { id: versionId },
        select: {
          storageKey: true,
          originalName: true,
          contentType: true,
          byteSize: true,
        },
      });
    if (!version)
      throw new NotFoundException('Company document version not found');
    return version;
  }

  async retry(versionId: number) {
    const result = await this.prisma.$transaction(async (db) => {
      const version = await db.companyKnowledgeDocumentVersion.updateMany({
        where: { id: versionId, status: 'FAILED' },
        data: {
          status: 'UPLOADED',
          processingError: null,
        },
      });
      if (version.count === 0) return false;
      await db.companyKnowledgeExtractedText.deleteMany({
        where: { versionId },
      });
      return true;
    });
    if (!result)
      throw new ConflictException(
        'Only failed company document versions can be retried',
      );
    return { versionId, status: 'UPLOADED' as const };
  }

  async extractedText(versionId: number) {
    const extracted =
      await this.prisma.companyKnowledgeExtractedText.findUnique({
        where: { versionId },
        select: { text: true },
      });
    if (!extracted)
      throw new NotFoundException('Extracted company document text not found');
    return { text: extracted.text };
  }

  private async persistWithCleanup<T>(
    storageKey: string,
    sourcePath: string,
    persist: (markCommitUncertain: () => void) => Promise<T>,
    reconcile: () => Promise<T | null>,
  ) {
    let commitMayHaveCompleted = false;
    try {
      await this.storage.put(storageKey, sourcePath);
    } catch (error) {
      try {
        await this.storage.remove(storageKey);
      } catch (cleanupError) {
        this.logger.error(
          'Company document orphan cleanup failed; storage maintenance required',
          cleanupError,
        );
      }
      throw error;
    }

    try {
      return await persist(() => {
        commitMayHaveCompleted = true;
      });
    } catch (error) {
      if (!commitMayHaveCompleted) {
        await this.cleanupFailedPersistence(storageKey);
        throw error;
      }

      try {
        const persisted = await reconcile();
        if (persisted) {
          this.logger.warn(
            'Database commit returned an error after the company document record was found',
          );
          return persisted;
        }
        await this.storage.remove(storageKey);
      } catch (reconciliationError) {
        this.logger.error(
          'Company document commit outcome is uncertain; retained storage object for reconciliation',
          reconciliationError,
        );
      }
      throw error;
    }
  }

  private async cleanupFailedPersistence(storageKey: string) {
    try {
      await this.storage.remove(storageKey);
    } catch (cleanupError) {
      this.logger.error(
        'Company document orphan cleanup failed; storage maintenance required',
        cleanupError,
      );
    }
  }
}
