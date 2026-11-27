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
