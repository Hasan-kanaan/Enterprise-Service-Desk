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
      versions: [{ id: 2, originalName: upload.originalName }],
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
    const service = new CompanyKnowledgeService(prisma, storage);

    await expect(service.uploadNew(upload, { id: 7 })).resolves.toEqual(
      persistedDocument,
    );
    expect(put).toHaveBeenCalledWith(expect.any(String), upload.path);
    expect(remove).not.toHaveBeenCalled();
  });

  describe('CompanyKnowledgeService extraction access and retry', () => {
    it('atomically resets only a failed version and removes stale extracted text', async () => {
      const versionUpdate = jest.fn().mockResolvedValue({ count: 1 });
      const deleteText = jest.fn().mockResolvedValue({ count: 0 });
      const tx = {
        companyKnowledgeDocumentVersion: { updateMany: versionUpdate },
        companyKnowledgeExtractedText: { deleteMany: deleteText },
      };
      const transaction = jest.fn(
        (callback: (db: typeof tx) => Promise<unknown>) => callback(tx),
      );
      const service = new CompanyKnowledgeService(
        { $transaction: transaction } as unknown as PrismaService,
        {} as CompanyKnowledgeStorage,
      );

      await expect(service.retry(12)).resolves.toEqual({
        versionId: 12,
        status: 'UPLOADED',
      });
      expect(versionUpdate).toHaveBeenCalledWith({
        where: { id: 12, status: 'FAILED' },
        data: { status: 'UPLOADED', processingError: null },
      });
      expect(deleteText).toHaveBeenCalledWith({ where: { versionId: 12 } });
    });

    it('rejects duplicate retries after another retry wins the state transition', async () => {
      const tx = {
        companyKnowledgeDocumentVersion: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
        companyKnowledgeExtractedText: { deleteMany: jest.fn() },
      };
      const service = new CompanyKnowledgeService(
        {
          $transaction: (callback: (db: typeof tx) => Promise<unknown>) =>
            callback(tx),
        } as unknown as PrismaService,
        {} as CompanyKnowledgeStorage,
      );

      await expect(service.retry(12)).rejects.toThrow(
        'Only failed company document versions can be retried',
      );
      expect(
        tx.companyKnowledgeExtractedText.deleteMany,
      ).not.toHaveBeenCalled();
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
    const service = new CompanyKnowledgeService(prisma, storage);

    await expect(service.uploadNew(upload, { id: 7 })).rejects.toBe(
      commitError,
    );
    expect(remove).not.toHaveBeenCalled();
  });
});
