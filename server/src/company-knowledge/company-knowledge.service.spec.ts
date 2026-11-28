import { CompanyKnowledgeService } from './company-knowledge.service';
import { CompanyKnowledgeStorage } from './company-knowledge.storage';
import { PrismaService } from '../prisma/prisma.service';

describe('CompanyKnowledgeService persistence reconciliation', () => {
  const upload = {
    path: 'private-staging/original.pdf',
    stagingDirectory: 'private-staging',
    originalName: 'original.pdf',
    contentType: 'application/pdf',
    byteSize: 128,
    sha256: 'digest',
  };

  it('returns the committed record when the transaction reports an error after commit', async () => {
    const persistedDocument = {
      id: 1,
      title: upload.originalName,
      versions: [
        {
          id: 2,
          originalName: upload.originalName,
          status: 'UPLOADED',
          processingStartedAt: null,
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
    };
    const transaction = {
      companyKnowledgeDocument: {
        create: jest.fn().mockResolvedValue(persistedDocument),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        async (callback: (db: typeof transaction) => Promise<unknown>) => {
          await callback(transaction);
          throw new Error('commit acknowledgement lost');
        },
      ),
      companyKnowledgeDocument: {
        findFirst: jest.fn().mockResolvedValue(persistedDocument),
      },
    } as unknown as PrismaService;
    const put = jest.fn().mockResolvedValue(undefined);
    const remove = jest.fn().mockResolvedValue(undefined);
    const storage = { put, remove } as unknown as CompanyKnowledgeStorage;
    const statusGateway = {
      emitStatus: jest.fn().mockResolvedValue(undefined),
    };
    const service = new CompanyKnowledgeService(
      prisma,
      storage,
      statusGateway as never,
    );

    await expect(service.uploadNew(upload, { id: 7 })).resolves.toEqual(
      persistedDocument,
    );
    expect(put).toHaveBeenCalledWith(expect.any(String), upload.path);
    expect(remove).not.toHaveBeenCalled();
    expect(statusGateway.emitStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 1,
        versionId: 2,
        status: 'UPLOADED',
        stage: null,
      }),
    );
  });

  it('broadcasts a new version only after its transaction commits', async () => {
    const version = {
      id: 12,
      versionNumber: 2,
      originalName: upload.originalName,
      contentType: upload.contentType,
      byteSize: upload.byteSize,
      status: 'UPLOADED',
      processingStartedAt: null,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 3 }]),
      companyKnowledgeDocumentVersion: {
        aggregate: jest.fn().mockResolvedValue({ _max: { versionNumber: 1 } }),
        create: jest.fn().mockResolvedValue(version),
      },
      companyKnowledgeDocument: {
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    let committed = false;
    const transaction = jest.fn(
      async (callback: (db: typeof tx) => Promise<unknown>) => {
        const result = await callback(tx);
        committed = true;
        return result;
      },
    );
    const put = jest.fn().mockResolvedValue(undefined);
    const statusGateway = {
      emitStatus: jest.fn(() => {
        expect(committed).toBe(true);
        return Promise.resolve();
      }),
    };
    const service = new CompanyKnowledgeService(
      {
        companyKnowledgeDocument: {
          findUnique: jest.fn().mockResolvedValue({ id: 3 }),
        },
        companyKnowledgeDocumentVersion: {
          findUnique: jest.fn(),
        },
        $transaction: transaction,
      } as unknown as PrismaService,
      { put, remove: jest.fn() } as unknown as CompanyKnowledgeStorage,
      statusGateway as never,
    );

    await expect(service.uploadVersion(3, upload, { id: 7 })).resolves.toEqual(
      version,
    );
    expect(put).toHaveBeenCalledWith(expect.any(String), upload.path);
    expect(statusGateway.emitStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 3,
        versionId: 12,
        status: 'UPLOADED',
        stage: null,
      }),
    );
  });

  describe('CompanyKnowledgeService extraction access and retry', () => {
    it('atomically resets only a failed version and removes stale extracted text', async () => {
      const versionUpdate = jest.fn().mockResolvedValue({ count: 1 });
      const deleteText = jest.fn().mockResolvedValue({ count: 0 });
      const readVersion = jest.fn().mockResolvedValue({
        id: 12,
        documentId: 3,
        status: 'UPLOADED',
        processingStartedAt: null,
        updatedAt: new Date('2026-01-01T00:01:00.000Z'),
      });
      const tx = {
        companyKnowledgeDocumentVersion: {
          updateMany: versionUpdate,
          findUnique: readVersion,
        },
        companyKnowledgeExtractedText: { deleteMany: deleteText },
      };
      let committed = false;
      const transaction = jest.fn(
        async (callback: (db: typeof tx) => Promise<unknown>) => {
          const result = await callback(tx);
          committed = true;
          return result;
        },
      );
      const statusGateway = {
        emitStatus: jest.fn(() => {
          expect(committed).toBe(true);
          return Promise.resolve();
        }),
      };
      const service = new CompanyKnowledgeService(
        { $transaction: transaction } as unknown as PrismaService,
        {} as CompanyKnowledgeStorage,
        statusGateway as never,
      );

      await expect(service.retry(12)).resolves.toEqual({
        versionId: 12,
        status: 'UPLOADED',
      });
      expect(versionUpdate).toHaveBeenCalledWith({
        where: { id: 12, status: 'FAILED' },
        data: {
          status: 'UPLOADED',
          processingError: null,
          processingStartedAt: null,
        },
      });
      expect(deleteText).toHaveBeenCalledWith({ where: { versionId: 12 } });
      expect(readVersion).toHaveBeenCalled();
      expect(statusGateway.emitStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          documentId: 3,
          versionId: 12,
          status: 'UPLOADED',
        }),
      );
    });

    it('rejects duplicate retries after another retry wins the state transition', async () => {
      const tx = {
        companyKnowledgeDocumentVersion: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
        companyKnowledgeExtractedText: { deleteMany: jest.fn() },
      };
      const statusGateway = { emitStatus: jest.fn() };
      const service = new CompanyKnowledgeService(
        {
          $transaction: (callback: (db: typeof tx) => Promise<unknown>) =>
            callback(tx),
        } as unknown as PrismaService,
        {} as CompanyKnowledgeStorage,
        statusGateway as never,
      );

      await expect(service.retry(12)).rejects.toThrow(
        'Only failed company document versions can be retried',
      );
      expect(
        tx.companyKnowledgeExtractedText.deleteMany,
      ).not.toHaveBeenCalled();
      expect(statusGateway.emitStatus).not.toHaveBeenCalled();
    });

    it('does not broadcast a retry when its transaction fails', async () => {
      const transactionError = new Error('transaction rolled back');
      const tx = {
        companyKnowledgeDocumentVersion: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        companyKnowledgeExtractedText: {
          deleteMany: jest.fn().mockRejectedValue(transactionError),
        },
      };
      const statusGateway = { emitStatus: jest.fn() };
      const service = new CompanyKnowledgeService(
        {
          $transaction: (callback: (db: typeof tx) => Promise<unknown>) =>
            callback(tx),
        } as unknown as PrismaService,
        {} as CompanyKnowledgeStorage,
        statusGateway as never,
      );

      await expect(service.retry(12)).rejects.toBe(transactionError);
      expect(statusGateway.emitStatus).not.toHaveBeenCalled();
    });

    it('returns only separately persisted extracted text', async () => {
      const extractedText = {
        findUnique: jest.fn().mockResolvedValue({ text: 'private text' }),
      };
      const service = new CompanyKnowledgeService(
        {
          companyKnowledgeExtractedText: extractedText,
        } as unknown as PrismaService,
        {} as CompanyKnowledgeStorage,
        { emitStatus: jest.fn() } as never,
      );

      await expect(service.extractedText(12)).resolves.toEqual({
        text: 'private text',
      });
      expect(extractedText.findUnique).toHaveBeenCalledWith({
        where: { versionId: 12 },
        select: { text: true },
      });
    });
  });

  it('retains the object when a commit outcome cannot be reconciled', async () => {
    const transaction = {
      companyKnowledgeDocument: {
        create: jest.fn().mockResolvedValue({ id: 1 }),
      },
    };
    const commitError = new Error('commit acknowledgement lost');
    const prisma = {
      $transaction: jest.fn(
        async (callback: (db: typeof transaction) => Promise<unknown>) => {
          await callback(transaction);
          throw commitError;
        },
      ),
      companyKnowledgeDocument: {
        findFirst: jest
          .fn()
          .mockRejectedValue(new Error('database temporarily unavailable')),
      },
    } as unknown as PrismaService;
    const put = jest.fn().mockResolvedValue(undefined);
    const remove = jest.fn().mockResolvedValue(undefined);
    const storage = { put, remove } as unknown as CompanyKnowledgeStorage;
    const statusGateway = {
      emitStatus: jest.fn(),
    };
    const service = new CompanyKnowledgeService(
      prisma,
      storage,
      statusGateway as never,
    );

    await expect(service.uploadNew(upload, { id: 7 })).rejects.toBe(
      commitError,
    );
    expect(remove).not.toHaveBeenCalled();
    expect(statusGateway.emitStatus).not.toHaveBeenCalled();
  });
});
