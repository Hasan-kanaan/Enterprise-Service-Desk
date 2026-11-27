import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from './http-test';
import { configureTestSecurity } from './security-test-app';
import { FakeMailProvider } from './fake-mail.provider';
import { MailProvider } from '../src/auth/mail.provider';
import { jwtConstants } from '../src/auth/auth.constants';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { User, UserRole } from '../generated/prisma/client';
import { LocalAttachmentStorage } from '../src/tickets/attachment-storage';
import { COMPANY_KNOWLEDGE_UPLOAD_LIMIT } from '../src/company-knowledge/company-knowledge-upload.interceptor';
import { CompanyKnowledgeStorage } from '../src/company-knowledge/company-knowledge.storage';

function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipFixture(entries: Array<[string, Buffer]>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;
  for (const [filename, contents] of entries) {
    const name = Buffer.from(filename);
    const compressed = deflateRawSync(contents);
    const checksum = crc32(contents);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(contents.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(contents.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, name);
    localOffset += local.length + name.length + compressed.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function validDocx() {
  return zipFixture([
    [
      '[Content_Types].xml',
      Buffer.from(
        '<?xml version="1.0"?><Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      ),
    ],
    [
      'word/document.xml',
      Buffer.from(
        '<?xml version="1.0"?><w:document xmlns:w="urn:word"><w:body/></w:document>',
      ),
    ],
  ]);
}

function validPdf() {
  const prefix = '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n';
  const xrefOffset = Buffer.byteLength(prefix);
  return Buffer.from(
    `${prefix}xref\n0 2\n0000000000 65535 f \n0000000009 00000 n \ntrailer\n<< /Size 2 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );
}

describe('Company knowledge documents (PostgreSQL and HTTP)', () => {
  let app: INestApplication<import('node:http').Server>;
  let db: PrismaService;
  let storageDir: string;
  let storage: CompanyKnowledgeStorage;
  const previousStorage = process.env.ATTACHMENT_STORAGE_DIR;
  const users: Record<string, User> = {};
  const sessionIds: Record<string, string> = {};
  const jwt = new JwtService({ secret: jwtConstants.secret });
  const token = (name: string) =>
    jwt.sign({
      sub: users[name].id,
      sid: sessionIds[name],
      sessionVersion: users[name].sessionVersion,
    });
  const get = <P extends string>(path: P, who: string) =>
    request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${token(who)}`);
  const upload = <P extends string>(
    path: P,
    who: string,
    bytes: Buffer,
    filename: string,
    contentType?: string,
  ) => {
    const uploadRequest = request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${token(who)}`);
    return contentType
      ? uploadRequest.attach('file', bytes, { filename, contentType })
      : uploadRequest.attach('file', bytes, filename);
  };

  beforeAll(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'eds-knowledge-test-'));
    process.env.ATTACHMENT_STORAGE_DIR = storageDir;
    const module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailProvider)
      .useValue(new FakeMailProvider())
      .compile();
    app = module.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });
    configureTestSecurity(app as NestExpressApplication);
    await app.init();
    db = app.get(PrismaService);
    storage = app.get(CompanyKnowledgeStorage);
  });

  afterAll(async () => {
    await app?.close();
    await rm(storageDir, { recursive: true, force: true });
    if (previousStorage === undefined)
      delete process.env.ATTACHMENT_STORAGE_DIR;
    else process.env.ATTACHMENT_STORAGE_DIR = previousStorage;
  });

  beforeEach(async () => {
    const prefix = randomUUID();
    for (const [name, role] of Object.entries({
      superAdmin: UserRole.SUPER_ADMIN,
      admin: UserRole.ADMIN,
      manager: UserRole.MANAGER,
      agent: UserRole.AGENT,
      employee: UserRole.EMPLOYEE,
    })) {
      sessionIds[name] = randomUUID();
      users[name] = await db.user.create({
        data: {
          sessions: { create: { id: sessionIds[name] } },
          displayName: `${name}-${prefix}`.slice(0, 50),
          email: `${name}-${prefix}@test.invalid`,
          password: 'unused',
          activatedAt: new Date(),
          role,
          status: 'ACTIVE',
        },
      });
    }
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    const ids = Object.values(users).map((user) => user.id);
    const documents = await db.companyKnowledgeDocument.findMany({
      where: { versions: { some: { uploadedById: { in: ids } } } },
      select: {
        id: true,
        versions: { select: { storageKey: true } },
      },
    });
    await Promise.all(
      documents.flatMap((document) =>
        document.versions.map((version) => storage.remove(version.storageKey)),
      ),
    );
    if (documents.length)
      await db.companyKnowledgeDocument.deleteMany({
        where: { id: { in: documents.map((document) => document.id) } },
      });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    for (const name of Object.keys(users)) delete users[name];
    await rm(storageDir, { recursive: true, force: true });
  });

  it('lets SUPER_ADMIN upload, list, inspect and download the unchanged original', async () => {
    const original = validPdf();
    const filename = `policy-${randomUUID()}.pdf`;
    const uploaded = await upload(
      '/company-knowledge/documents',
      'superAdmin',
      original,
      filename,
      'application/pdf',
    ).expect(201);
    expect(uploaded.body).toMatchObject({
      title: filename,
      versions: [
        {
          versionNumber: 1,
          originalName: filename,
          contentType: 'application/pdf',
          byteSize: original.length,
          sha256: createHash('sha256').update(original).digest('hex'),
          status: 'UPLOADED',
        },
      ],
    });
    expect(JSON.stringify(uploaded.body)).not.toContain('storageKey');

    const documentId = uploaded.body.id;
    const versionId = uploaded.body.versions[0].id;
    const listed = await get(
      `/company-knowledge/documents?search=${encodeURIComponent(filename)}`,
      'superAdmin',
    ).expect(200);
    expect(listed.body.items).toHaveLength(1);
    expect(listed.body.items[0]).toMatchObject({
      id: documentId,
      title: filename,
      _count: { versions: 1 },
    });
    const details = await get(
      `/company-knowledge/documents/${documentId}`,
      'superAdmin',
    ).expect(200);
    expect(details.body.versions[0]).toMatchObject({
      id: versionId,
      sha256: createHash('sha256').update(original).digest('hex'),
    });
    expect(JSON.stringify(details.body)).not.toContain('storageKey');

    const storedVersion =
      await db.companyKnowledgeDocumentVersion.findUniqueOrThrow({
        where: { id: versionId },
        select: { storageKey: true },
      });
    const knowledgeObject = join(
      storageDir,
      'company-knowledge',
      storedVersion.storageKey,
    );
    expect(await readFile(knowledgeObject)).toEqual(original);
    expect(
      await readFile(join(storageDir, storedVersion.storageKey)).catch(
        () => undefined,
      ),
    ).toBeUndefined();
    const downloaded = await get(
      `/company-knowledge/versions/${versionId}/download`,
      'superAdmin',
    ).expect(200);
    if (!Buffer.isBuffer(downloaded.body))
      throw new Error('Expected downloaded file bytes');
    expect(downloaded.body).toEqual(original);
    expect(downloaded.headers['x-content-type-options']).toBe('nosniff');
    expect(downloaded.headers['cache-control']).toContain('no-store');
  });

  it('stores replacement uploads as new versions without changing a published version', async () => {
    const first = await upload(
      '/company-knowledge/documents',
      'superAdmin',
      validPdf(),
      'policy.pdf',
      'application/pdf',
    ).expect(201);
    const documentId = first.body.id;
    const firstVersionId = first.body.versions[0].id;
    await db.companyKnowledgeDocumentVersion.update({
      where: { id: firstVersionId },
      data: { status: 'PUBLISHED' },
    });

    const replacementBytes = Buffer.from('# Updated policy\n');
    const replacement = await upload(
      `/company-knowledge/documents/${documentId}/versions`,
      'superAdmin',
      replacementBytes,
      'policy.md',
      'text/markdown',
    ).expect(201);
    expect(replacement.body).toMatchObject({
      versionNumber: 2,
      status: 'UPLOADED',
      originalName: 'policy.md',
    });
    const versions = await db.companyKnowledgeDocumentVersion.findMany({
      where: { documentId },
      orderBy: { versionNumber: 'asc' },
    });
    expect(versions.map((version) => version.status)).toEqual([
      'PUBLISHED',
      'UPLOADED',
    ]);
  });

  it('denies all document metadata, upload and original-file routes to other roles', async () => {
    const created = await upload(
      '/company-knowledge/documents',
      'superAdmin',
      Buffer.from('Company policy\n'),
      'policy.txt',
      'text/plain',
    ).expect(201);
    const documentId = created.body.id;
    const versionId = created.body.versions[0].id;

    for (const role of ['admin', 'manager', 'agent', 'employee']) {
      await get('/company-knowledge/documents', role).expect(403);
      await get(`/company-knowledge/documents/${documentId}`, role).expect(403);
      await get(
        `/company-knowledge/versions/${versionId}/download`,
        role,
      ).expect(403);
      await upload(
        '/company-knowledge/documents',
        role,
        Buffer.from('Unauthorized'),
        'denied.txt',
        'text/plain',
      ).expect(403);
      await upload(
        `/company-knowledge/documents/${documentId}/versions`,
        role,
        Buffer.from('Unauthorized'),
        'denied.txt',
        'text/plain',
      ).expect(403);
    }
  });

  it('validates actual PDF, DOCX, TXT and Markdown content', async () => {
    const accepted = [
      [
        'docx.docx',
        validDocx(),
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
      ['plain.txt', Buffer.from('plain text\n'), 'text/plain'],
      ['notes.md', Buffer.from('# Notes\n'), 'text/markdown'],
    ] as const;
    for (const [filename, bytes, contentType] of accepted)
      await upload(
        '/company-knowledge/documents',
        'superAdmin',
        bytes,
        filename,
        contentType,
      ).expect(201);

    const corruptedDocx = validDocx();
    corruptedDocx[49] ^= 0xff;
    const malformedPdf = Buffer.from('%PDF-1.7\ntruncated');
    const invalidText = Buffer.from([0xff, 0xfe, 0x00]);
    const pdfBytes = validPdf();
    for (const [filename, bytes, contentType] of [
      ['broken.pdf', malformedPdf, 'application/pdf'],
      [
        'broken.docx',
        Buffer.from('PK\x03\x04not-a-document'),
        'application/octet-stream',
      ],
      ['corrupt.docx', corruptedDocx, 'application/octet-stream'],
      ['invalid.txt', invalidText, 'text/plain'],
      ['mismatch.txt', pdfBytes, 'text/plain'],
      ['mismatch.pdf', pdfBytes, 'text/plain'],
      ['unsupported.exe', Buffer.from('binary'), 'application/octet-stream'],
    ] as const)
      await upload(
        '/company-knowledge/documents',
        'superAdmin',
        bytes,
        filename,
        contentType,
      ).expect(400);
  });

  it('rejects uploads larger than 50 MiB while streaming request bytes', async () => {
    const oversized = Buffer.alloc(COMPANY_KNOWLEDGE_UPLOAD_LIMIT + 1, 0x61);
    const countBefore = await db.companyKnowledgeDocument.count();
    await upload(
      '/company-knowledge/documents',
      'superAdmin',
      oversized,
      'oversized.txt',
      'text/plain',
    ).expect(413);
    expect(await db.companyKnowledgeDocument.count()).toBe(countBefore);
  });

  it('cleans the knowledge namespace when database persistence fails', async () => {
    const countBefore = await db.companyKnowledgeDocument.count();
    jest
      .spyOn(db, '$transaction')
      .mockRejectedValueOnce(new Error('simulated persistence failure'));
    await upload(
      '/company-knowledge/documents',
      'superAdmin',
      Buffer.from('company policy'),
      'policy.txt',
      'text/plain',
    ).expect(500);
    expect(await db.companyKnowledgeDocument.count()).toBe(countBefore);
    expect(await readdir(join(storageDir, 'company-knowledge'))).toEqual([]);
  });

  it('keeps company knowledge objects separate from ticket attachment objects', async () => {
    const ticketStorage = new LocalAttachmentStorage(storageDir);
    const ticketKey = randomUUID();
    const ticketBytes = Buffer.from('ticket attachment');
    await ticketStorage.put(ticketKey, ticketBytes);
    const uploaded = await upload(
      '/company-knowledge/documents',
      'superAdmin',
      Buffer.from('knowledge file'),
      'knowledge.txt',
      'text/plain',
    ).expect(201);
    const version = await db.companyKnowledgeDocumentVersion.findUniqueOrThrow({
      where: { id: uploaded.body.versions[0].id },
      select: { storageKey: true },
    });

    expect(await readFile(join(storageDir, ticketKey))).toEqual(ticketBytes);
    expect(
      await readFile(join(storageDir, 'company-knowledge', version.storageKey)),
    ).toEqual(Buffer.from('knowledge file'));
    await ticketStorage.remove(ticketKey);
  });
});
