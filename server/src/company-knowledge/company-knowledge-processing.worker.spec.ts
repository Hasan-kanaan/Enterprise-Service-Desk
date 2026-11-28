import { CompanyKnowledgeProcessingWorker } from './company-knowledge-processing.worker';
import { PrismaService } from '../prisma/prisma.service';
import { CompanyKnowledgeTextExtractionService } from './company-knowledge-text-extraction.service';
import type { CompanyKnowledgeStatusPayload } from './company-knowledge-status.gateway';

const claimed = {
  id: 12,
  documentId: 7,
  storageKey: '9a8b7c6d-5e4f-3210-9876-123456789abc',
  contentType: 'text/plain',
  processingStartedAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

function sqlOf(mock: jest.Mock, callIndex = 0) {
  const calls = mock.mock.calls as unknown[][];
  const template = calls[callIndex]?.[0];
  if (
    !Array.isArray(template) ||
    !template.every((part) => typeof part === 'string')
  )
    throw new Error('Expected a tagged SQL template');
  return template.join(' ');
}

function argumentOf(mock: jest.Mock, callIndex: number, argumentIndex: number) {
  const calls = mock.mock.calls as unknown[][];
  const call = calls[callIndex];
  if (!call) throw new Error('Expected a recorded mock call');
  return call[argumentIndex];
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeWorker(
  extraction = jest.fn().mockResolvedValue('complete extracted text'),
  overrides: {
    claim?: jest.Mock;
    renew?: jest.Mock;
    complete?: jest.Mock;
    transaction?: jest.Mock;
  } = {},
) {
  const claim =
    overrides.claim ?? jest.fn().mockResolvedValue([{ ...claimed }]);
  const renew = overrides.renew ?? jest.fn().mockResolvedValue(1);
  const complete =
    overrides.complete ??
    jest.fn().mockResolvedValue([
      {
        id: 12,
        documentId: claimed.documentId,
        processingStartedAt: claimed.processingStartedAt,
        updatedAt: new Date('2026-01-01T00:05:00.000Z'),
      },
    ]);
  const createText = jest.fn().mockResolvedValue({ versionId: 12 });
  const tx = {
    $queryRaw: complete,
    companyKnowledgeExtractedText: { create: createText },
  };
  const transaction =
    overrides.transaction ??
    jest.fn((callback: (db: typeof tx) => Promise<unknown>) => callback(tx));
  const prisma = {
    $queryRaw: claim,
    $executeRaw: renew,
    $transaction: transaction,
  } as unknown as PrismaService;
  const extractor = {
    extract: extraction,
  } as unknown as CompanyKnowledgeTextExtractionService;
  const emittedStatuses: CompanyKnowledgeStatusPayload[] = [];
  const statusGateway = {
    emitStatus: jest.fn((event: CompanyKnowledgeStatusPayload) => {
      emittedStatuses.push(event);
      return Promise.resolve();
    }),
    emittedStatuses,
  };
  return {
    worker: new CompanyKnowledgeProcessingWorker(
      prisma,
      extractor,
      statusGateway as never,
    ),
    claim,
    renew,
    complete,
    createText,
    transaction,
    extraction,
    statusGateway,
  };
}

describe('CompanyKnowledgeProcessingWorker', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('claims in FIFO order with a single atomic SKIP LOCKED query', async () => {
    const { worker, claim } = makeWorker();

    await worker.trigger();

    const sql = sqlOf(claim);
    expect(sql).toContain('ORDER BY "createdAt" ASC, "id" ASC');
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toContain('"processingLeaseExpiresAt" <= CURRENT_TIMESTAMP');
    expect(sql).toContain(
      '"processingStartedAt" = COALESCE("processingStartedAt", CURRENT_TIMESTAMP)',
    );
  });

  it('processes no more than one job at a time per worker instance', async () => {
    const extraction = deferred<string>();
    const {
      worker,
      claim,
      extraction: extract,
    } = makeWorker(jest.fn(() => extraction.promise));

    const first = worker.trigger();
    const concurrent = worker.trigger();
    await new Promise((resolve) => setImmediate(resolve));
    expect(concurrent).toBe(first);
    expect(claim).toHaveBeenCalledTimes(1);
    expect(extract).toHaveBeenCalledTimes(1);

    extraction.resolve('complete extracted text');
    await first;
  });

  it('allows different workers to claim different documents concurrently', async () => {
    const claims = [[{ ...claimed, id: 12 }], [{ ...claimed, id: 13 }]];
    const sharedClaim = jest
      .fn()
      .mockImplementation(() => Promise.resolve(claims.shift() ?? []));
    const sharedRenew = jest.fn().mockResolvedValue(1);
    const transaction = jest.fn(
      (
        callback: (db: {
          $queryRaw: jest.Mock;
          companyKnowledgeExtractedText: { create: jest.Mock };
        }) => Promise<unknown>,
      ) =>
        callback({
          $queryRaw: jest.fn().mockResolvedValue([{ id: 12 }]),
          companyKnowledgeExtractedText: {
            create: jest.fn().mockResolvedValue(undefined),
          },
        }),
    );
    const prisma = {
      $queryRaw: sharedClaim,
      $executeRaw: sharedRenew,
      $transaction: transaction,
    } as unknown as PrismaService;
    const extract = jest.fn().mockResolvedValue('text');
    const extraction = {
      extract,
    } as unknown as CompanyKnowledgeTextExtractionService;
    const statusGateway = {
      emitStatus: jest.fn().mockResolvedValue(undefined),
    };
    const first = new CompanyKnowledgeProcessingWorker(
      prisma,
      extraction,
      statusGateway as never,
    );
    const second = new CompanyKnowledgeProcessingWorker(
      prisma,
      extraction,
      statusGateway as never,
    );

    await Promise.all([first.trigger(), second.trigger()]);

    expect(sharedClaim).toHaveBeenCalledTimes(2);
    expect(argumentOf(sharedClaim, 0, 1)).not.toEqual(
      argumentOf(sharedClaim, 1, 1),
    );
    expect(extract).toHaveBeenCalledTimes(2);
  });

  it('renews a live lease and atomically persists complete text with READY_FOR_REVIEW', async () => {
    jest.useFakeTimers();
    const extraction = deferred<string>();
    const { worker, renew, complete, createText, statusGateway } = makeWorker(
      jest.fn(() => extraction.promise),
    );

    const running = worker.trigger();
    await jest.advanceTimersByTimeAsync(20_000);
    expect(renew).toHaveBeenCalledTimes(1);

    extraction.resolve('complete extracted text');
    await running;

    expect(sqlOf(complete)).toContain("'READY_FOR_REVIEW'");
    expect(createText).toHaveBeenCalledWith({
      data: { versionId: claimed.id, text: 'complete extracted text' },
    });
    expect(createText.mock.invocationCallOrder[0]).toBeGreaterThan(
      complete.mock.invocationCallOrder[0],
    );
    expect(sqlOf(complete)).not.toContain('"processingStartedAt" =');
    expect(statusGateway.emittedStatuses.map((event) => event.status)).toEqual([
      'PROCESSING',
      'READY_FOR_REVIEW',
    ]);
    expect(Object.keys(statusGateway.emittedStatuses[0])).toEqual([
      'documentId',
      'versionId',
      'status',
      'stage',
      'processingStartedAt',
      'updatedAt',
    ]);
    expect(
      statusGateway.emitStatus.mock.invocationCallOrder[1],
    ).toBeGreaterThan(createText.mock.invocationCallOrder[0]);
  });

  it('does not emit completion when its lease-guarded update affects no row', async () => {
    const { worker, statusGateway, createText } = makeWorker(
      jest.fn().mockResolvedValue('complete extracted text'),
      { complete: jest.fn().mockResolvedValue([]) },
    );

    await worker.trigger();

    expect(createText).not.toHaveBeenCalled();
    expect(statusGateway.emittedStatuses.map((event) => event.status)).toEqual([
      'PROCESSING',
    ]);
  });

  it('does not complete after losing its lease to a newer claim', async () => {
    jest.useFakeTimers();
    const extraction = deferred<string>();
    const { worker, renew, transaction, statusGateway } = makeWorker(
      jest.fn(() => extraction.promise),
      { renew: jest.fn().mockResolvedValue(0) },
    );

    const running = worker.trigger();
    await jest.advanceTimersByTimeAsync(20_000);
    expect(renew).toHaveBeenCalledTimes(1);
    extraction.resolve('stale extracted text');
    await running;

    expect(transaction).not.toHaveBeenCalled();
    expect(statusGateway.emitStatus).toHaveBeenCalledTimes(1);
    expect(statusGateway.emittedStatuses[0].status).toBe('PROCESSING');
  });

  it('fails a replacement without creating text or changing other versions', async () => {
    const extraction = jest
      .fn()
      .mockRejectedValue(new Error('private parser details'));
    const { worker, claim, statusGateway } = makeWorker(extraction);

    await worker.trigger();

    expect(sqlOf(claim, 1)).toContain('"status" = \'FAILED\'');
    expect(argumentOf(claim, 1, 1)).toBe(
      'Text extraction failed. Verify the file is valid and retry.',
    );
    expect(sqlOf(claim, 1)).not.toContain('"processingStartedAt" =');
    expect(statusGateway.emittedStatuses.map((event) => event.status)).toEqual([
      'PROCESSING',
      'FAILED',
    ]);
  });
});
