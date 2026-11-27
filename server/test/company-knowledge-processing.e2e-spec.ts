import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  CompanyKnowledgeVersionStatus,
  PrismaClient,
} from '../generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { CompanyKnowledgeProcessingWorker } from '../src/company-knowledge/company-knowledge-processing.worker';
import { CompanyKnowledgeStorage } from '../src/company-knowledge/company-knowledge.storage';
import { CompanyKnowledgeTextExtractionService } from '../src/company-knowledge/company-knowledge-text-extraction.service';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

type TestFixture = {
  userIds: number[];
  documentIds: number[];
  versionIds: number[];
};

type WorkerClaim = {
  id: number;
  storageKey: string;
  contentType: string;
  leaseToken: string;
};

type WorkerLeaseOperations = {
  renewLease(claim: WorkerClaim): Promise<boolean>;
  complete(claim: WorkerClaim, text: string): Promise<void>;
  fail(claim: WorkerClaim): Promise<void>;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function waitForStart(started: Promise<void>, operation: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      started,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Timed out waiting for ${operation}`)),
          10_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

describe('Company Knowledge processing worker (isolated PostgreSQL)', () => {
  jest.setTimeout(45_000);

  const schema = `knowledge_worker_${randomUUID().replaceAll('-', '')}`;
  let sql: Client | undefined;
  let db: PrismaClient | undefined;
  let schemaCreated = false;

  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString)
      throw new Error(
        'TEST_DATABASE_URL is required for this integration test',
      );

    const url = new URL(connectionString);
    const databaseName = decodeURIComponent(url.pathname.slice(1));
    if (
      !url.pathname.endsWith('_test') ||
      !['localhost', '127.0.0.1', '::1'].includes(url.hostname)
    )
      throw new Error(
        'Company Knowledge integration tests require a local PostgreSQL database ending in _test',
      );

    sql = new Client({ connectionString });
    await sql.connect();
    const target = await sql.query<{ name: string; version: string }>(
      "SELECT current_database() AS name, current_setting('server_version_num') AS version",
    );
    if (target.rows[0]?.name !== databaseName)
      throw new Error(
        'Connected PostgreSQL database did not match TEST_DATABASE_URL',
      );
    if (!String(target.rows[0]?.version).startsWith('17'))
      throw new Error(
        'Company Knowledge integration test requires PostgreSQL 17',
      );
    console.log(
      `Company Knowledge integration target: PostgreSQL 17 database ${databaseName} (local isolated schema)`,
    );

    await sql.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    await sql.query(`SET search_path TO "${schema}"`);
    await sql.query(
      'CREATE TABLE "User" ("id" SERIAL NOT NULL, CONSTRAINT "User_pkey" PRIMARY KEY ("id"))',
    );

    for (const migration of [
      '20261127120000_company_knowledge_documents',
      '20261127230000_company_knowledge_processing_queue',
    ]) {
      const migrationSql = readFileSync(
        join(__dirname, '../prisma/migrations', migration, 'migration.sql'),
        'utf8',
      );
      await sql.query(migrationSql);
    }

    url.searchParams.set('options', `-c search_path=${schema}`);
    db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url.toString() }, { schema }),
    });
    await db.$connect();
  });

  afterAll(async () => {
    await db?.$disconnect();
    if (schemaCreated && sql)
      await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await sql?.end();
  });

  function client() {
    if (!db) throw new Error('PostgreSQL test client was not initialized');
    return db;
  }

  function connection() {
    if (!sql) throw new Error('PostgreSQL connection was not initialized');
    return sql;
  }

  async function createFixture() {
    const fixture: TestFixture = {
      userIds: [],
      documentIds: [],
      versionIds: [],
    };
    const inserted = await connection().query<{ id: number }>(
      'INSERT INTO "User" DEFAULT VALUES RETURNING "id"',
    );
    fixture.userIds.push(inserted.rows[0].id);
    return fixture;
  }

  async function createVersion(
    fixture: TestFixture,
    userId: number,
    options: {
      createdAt?: Date;
      status?: CompanyKnowledgeVersionStatus;
      workerId?: string;
      leaseToken?: string;
      leaseExpiresAt?: Date;
    } = {},
  ) {
    const createdAt = options.createdAt ?? new Date();
    const document = await client().companyKnowledgeDocument.create({
      data: {
        title: `worker-test-${randomUUID()}`,
        createdAt,
      },
    });
    fixture.documentIds.push(document.id);
    const version = await client().companyKnowledgeDocumentVersion.create({
      data: {
        documentId: document.id,
        versionNumber: 1,
        uploadedById: userId,
        originalName: 'queue-test.txt',
        contentType: 'text/plain',
        byteSize: 1,
        sha256: 'a'.repeat(64),
        storageKey: randomUUID(),
        status: options.status ?? CompanyKnowledgeVersionStatus.UPLOADED,
        processingWorkerId: options.workerId,
        processingLeaseToken: options.leaseToken,
        processingLeaseExpiresAt: options.leaseExpiresAt,
        createdAt,
      },
      select: { id: true, storageKey: true },
    });
    fixture.versionIds.push(version.id);
    return version;
  }

  async function cleanupFixture(fixture: TestFixture) {
    if (fixture.versionIds.length > 0) {
      await client().companyKnowledgeExtractedText.deleteMany({
        where: { versionId: { in: fixture.versionIds } },
      });
      await client().companyKnowledgeDocumentVersion.deleteMany({
        where: { id: { in: fixture.versionIds } },
      });
    }
    if (fixture.documentIds.length > 0)
      await client().companyKnowledgeDocument.deleteMany({
        where: { id: { in: fixture.documentIds } },
      });
    if (fixture.userIds.length > 0)
      await connection().query(
        'DELETE FROM "User" WHERE "id" = ANY($1::integer[])',
        [fixture.userIds],
      );
  }

  function makeWorker(
    extract: (storageKey: string, contentType: string) => Promise<string>,
  ) {
    const extraction = new CompanyKnowledgeTextExtractionService({
      stream: jest.fn(),
    } as unknown as CompanyKnowledgeStorage);
    jest.spyOn(extraction, 'extract').mockImplementation(extract);
    return new CompanyKnowledgeProcessingWorker(
      client() as unknown as PrismaService,
      extraction,
    );
  }

  function leaseOperations(worker: CompanyKnowledgeProcessingWorker) {
    return worker as unknown as WorkerLeaseOperations;
  }

  function runWorker(worker: CompanyKnowledgeProcessingWorker) {
    const running = worker.trigger();
    if (!running) throw new Error('Worker did not start its queue cycle');
    return running;
  }

  it('claims concurrent FIFO jobs once and atomically persists complete extracted text', async () => {
    const fixture = await createFixture();
    const controls = new Map<
      string,
      { started: Deferred<void>; result: Deferred<string> }
    >();
    const claimedStorageKeys: string[] = [];
    const workers: CompanyKnowledgeProcessingWorker[] = [];
    const running: Promise<void>[] = [];
    try {
      const userId = fixture.userIds[0];
      const oldest = await createVersion(fixture, userId, {
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      });
      const next = await createVersion(fixture, userId, {
        createdAt: new Date('2025-01-02T00:00:00.000Z'),
      });
      for (const version of [oldest, next])
        controls.set(version.storageKey, {
          started: deferred<void>(),
          result: deferred<string>(),
        });

      const extraction = (storageKey: string) => {
        const control = controls.get(storageKey);
        if (!control)
          throw new Error('Worker claimed an unexpected test version');
        claimedStorageKeys.push(storageKey);
        control.started.resolve(undefined);
        return control.result.promise;
      };
      workers.push(makeWorker(extraction), makeWorker(extraction));
      running.push(runWorker(workers[0]), runWorker(workers[1]));

      await Promise.all(
        Array.from(controls.values(), ({ started }) =>
          waitForStart(started.promise, 'both concurrent claims'),
        ),
      );
      expect(claimedStorageKeys).toEqual([oldest.storageKey, next.storageKey]);

      const claimedVersions =
        await client().companyKnowledgeDocumentVersion.findMany({
          where: { id: { in: [oldest.id, next.id] } },
          select: { id: true, status: true, processingWorkerId: true },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });
      expect(claimedVersions.map((row) => row.status)).toEqual([
        CompanyKnowledgeVersionStatus.PROCESSING,
        CompanyKnowledgeVersionStatus.PROCESSING,
      ]);
      expect(
        new Set(claimedVersions.map((row) => row.processingWorkerId)).size,
      ).toBe(2);

      for (const [storageKey, control] of controls)
        control.result.resolve(`complete text for ${storageKey}`);
      await Promise.all(running);

      const completed = await client().companyKnowledgeDocumentVersion.findMany(
        {
          where: { id: { in: [oldest.id, next.id] } },
          select: { id: true, status: true },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      );
      expect(completed.map((row) => row.status)).toEqual([
        CompanyKnowledgeVersionStatus.READY_FOR_REVIEW,
        CompanyKnowledgeVersionStatus.READY_FOR_REVIEW,
      ]);
      const extracted = await client().companyKnowledgeExtractedText.findMany({
        where: { versionId: { in: [oldest.id, next.id] } },
        orderBy: { versionId: 'asc' },
      });
      expect(extracted.map((row) => row.text)).toEqual([
        `complete text for ${oldest.storageKey}`,
        `complete text for ${next.storageKey}`,
      ]);
    } finally {
      for (const control of controls.values())
        control.result.resolve('test cleanup');
      await Promise.allSettled(running);
      await Promise.all(workers.map((worker) => worker.onModuleDestroy()));
      await cleanupFixture(fixture);
    }
  });

  it('recovers an expired lease and rejects stale renew, complete, and fail mutations', async () => {
    const fixture = await createFixture();
    const oldResult = deferred<string>();
    const newResult = deferred<string>();
    const oldStarted = deferred<void>();
    const newStarted = deferred<void>();
    const workers: CompanyKnowledgeProcessingWorker[] = [];
    const running: Promise<void>[] = [];
    try {
      const version = await createVersion(fixture, fixture.userIds[0]);
      const oldWorker = makeWorker(async () => {
        oldStarted.resolve(undefined);
        return oldResult.promise;
      });
      const newWorker = makeWorker(async () => {
        newStarted.resolve(undefined);
        return newResult.promise;
      });
      workers.push(oldWorker, newWorker);
      const oldRun = runWorker(oldWorker);
      running.push(oldRun);
      await waitForStart(oldStarted.promise, 'the original claim');

      const oldClaim =
        await client().companyKnowledgeDocumentVersion.findUniqueOrThrow({
          where: { id: version.id },
          select: { processingWorkerId: true, processingLeaseToken: true },
        });
      if (!oldClaim.processingWorkerId || !oldClaim.processingLeaseToken)
        throw new Error(
          'Expected the original worker to own a processing lease',
        );

      await client().companyKnowledgeDocumentVersion.update({
        where: { id: version.id },
        data: {
          processingLeaseExpiresAt: new Date(Date.now() - 60_000),
        },
      });
      const newRun = runWorker(newWorker);
      running.push(newRun);
      await waitForStart(newStarted.promise, 'the recovered claim');

      const newClaim =
        await client().companyKnowledgeDocumentVersion.findUniqueOrThrow({
          where: { id: version.id },
          select: {
            status: true,
            processingWorkerId: true,
            processingLeaseToken: true,
            processingLeaseExpiresAt: true,
          },
        });
      expect(newClaim.status).toBe(CompanyKnowledgeVersionStatus.PROCESSING);
      expect(newClaim.processingWorkerId).not.toBe(oldClaim.processingWorkerId);
      expect(newClaim.processingLeaseToken).not.toBe(
        oldClaim.processingLeaseToken,
      );
      expect(newClaim.processingLeaseExpiresAt!.getTime()).toBeGreaterThan(
        Date.now(),
      );

      const staleClaim: WorkerClaim = {
        id: version.id,
        storageKey: version.storageKey,
        contentType: 'text/plain',
        leaseToken: oldClaim.processingLeaseToken,
      };
      expect(await leaseOperations(oldWorker).renewLease(staleClaim)).toBe(
        false,
      );
      await leaseOperations(oldWorker).complete(
        staleClaim,
        'stale extracted text',
      );
      await leaseOperations(oldWorker).fail(staleClaim);

      oldResult.reject(new Error('stale extraction failure'));
      await oldRun;
      const afterStaleFailure =
        await client().companyKnowledgeDocumentVersion.findUniqueOrThrow({
          where: { id: version.id },
          select: { status: true, processingLeaseToken: true },
        });
      expect(afterStaleFailure).toEqual({
        status: CompanyKnowledgeVersionStatus.PROCESSING,
        processingLeaseToken: newClaim.processingLeaseToken,
      });
      expect(
        await client().companyKnowledgeExtractedText.count({
          where: { versionId: version.id },
        }),
      ).toBe(0);

      newResult.resolve('current worker complete text');
      await newRun;
      const completed =
        await client().companyKnowledgeDocumentVersion.findUniqueOrThrow({
          where: { id: version.id },
          select: { status: true },
        });
      const extracted = await client().companyKnowledgeExtractedText.findUnique(
        {
          where: { versionId: version.id },
          select: { text: true },
        },
      );
      expect(completed.status).toBe(
        CompanyKnowledgeVersionStatus.READY_FOR_REVIEW,
      );
      expect(extracted).toEqual({ text: 'current worker complete text' });
    } finally {
      oldResult.resolve('test cleanup');
      newResult.resolve('test cleanup');
      await Promise.allSettled(running);
      await Promise.all(workers.map((worker) => worker.onModuleDestroy()));
      await cleanupFixture(fixture);
    }
  });
});
