import { MailProvider } from '../src/auth/mail.provider';
import { FakeMailProvider } from './fake-mail.provider';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { Client } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, UserRole, type User } from '../generated/prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { configureTestSecurity } from './security-test-app';
import { readFileSync, readdirSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as bcrypt from 'bcryptjs';
import type { Server } from 'node:http';

type Login = { accessToken: string; user: { passwordChangeRequired: boolean } };
describe('Account directory consistency (isolated PostgreSQL and HTTP)', () => {
  const mail = new FakeMailProvider();
  const schema = `hardening_${randomUUID().replaceAll('-', '')}`;
  const sql = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  const secret = 'test-bootstrap-9xQ4rT7vB2nM6pL8-fixture';
  const originalSecret = process.env.INITIAL_SETUP_SECRET;
  const originalStorage = process.env.ATTACHMENT_STORAGE_DIR;
  let app: NestExpressApplication<Server>, db: PrismaClient, directory: string;
  const password = 'InitialPassword123!';
  const post = (path: string, token?: string) =>
    request(app.getHttpServer())
      .post(path)
      .set('Origin', 'http://localhost:3000')
      .set('Authorization', token ? `Bearer ${token}` : '');
  const login = async (user: User, value = password) => {
    const response = await post('/auth/login')
      .send({ email: user.email, password: value })
      .expect(201);
    return {
      token: (response.body as Login).accessToken,
      cookie: response.headers['set-cookie'] as unknown as string[],
      body: response.body as Login,
    };
  };
  const seed = async (role: UserRole) =>
    db.user.create({
      data: {
        displayName: randomUUID(),
        email: `${randomUUID()}@example.test`,
        role,
        password: await bcrypt.hash(password, 10),
        activatedAt: new Date(),
      },
    });
  beforeAll(async () => {
    await sql.connect();
    await sql.query(`CREATE SCHEMA "${schema}"`);
    await sql.query(`SET search_path TO "${schema}"`);
    for (const migration of readdirSync(join(__dirname, '../prisma/migrations'))
      .filter((name) => /^\d/.test(name))
      .sort())
      await sql.query(
        readFileSync(
          join(__dirname, '../prisma/migrations', migration, 'migration.sql'),
          'utf8',
        ),
      );
    const url = new URL(process.env.TEST_DATABASE_URL!);
    url.searchParams.set('options', `-c search_path=${schema}`);
    db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url.toString() }, { schema }),
    });
    directory = await mkdtemp(join(tmpdir(), 'eds-hardening-'));
    process.env.INITIAL_SETUP_SECRET = secret;
    process.env.ATTACHMENT_STORAGE_DIR = directory;
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(db)
      .overrideProvider(MailProvider)
      .useValue(mail)
      .compile();
    app = module.createNestApplication<NestExpressApplication<Server>>({
      bodyParser: false,
    });
    configureTestSecurity(app);
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await sql.end();
    if (directory) await rm(directory, { recursive: true, force: true });
    if (originalSecret === undefined) delete process.env.INITIAL_SETUP_SECRET;
    else process.env.INITIAL_SETUP_SECRET = originalSecret;
    if (originalStorage === undefined)
      delete process.env.ATTACHMENT_STORAGE_DIR;
    else process.env.ATTACHMENT_STORAGE_DIR = originalStorage;
  });

  let root: User, rootToken: string;
  const input = (extra = {}) => ({
    displayName: 'Directory Person',
    jobTitle: 'Employee',

    email: `${randomUUID()}@example.test`,
    role: UserRole.EMPLOYEE,
    ...extra,
  });
  type Page = {
    items: { id: number; role: string }[];
    hasMore: boolean;
    nextCursor: string | null;
  };
  const list = async (token = rootToken, query = {}) => {
    const response = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${token}`)
      .query(query)
      .expect(200);
    return response.body as Page;
  };
  it('returns the sole activated bootstrap root on the first request after login and on reload', async () => {
    await post('/auth/setup')
      .send({
        ...input({ displayName: 'root', email: 'root@example.test' }),
        role: undefined,
        setupSecret: secret,
      })
      .expect(201);
    await post('/auth/activate')
      .send({
        token: mail.token('root@example.test', 'activation'),
        newPassword: password,
      })
      .expect(201);
    root = await db.user.findUniqueOrThrow({
      where: { email: 'root@example.test' },
    });
    rootToken = (await login(root)).token;
    const first = await list();
    expect(first.items.map((u) => u.id)).toEqual([root.id]);
    expect(first.hasMore).toBe(false);
    expect(await list()).toEqual(first);
    expect(await db.user.count()).toBe(1);
  });
  it.each(['email'] as const)(
    'rejects duplicate %s without account, token, mail or directory changes',
    async (field) => {
      const before = await list();
      const users = await db.user.findMany({ orderBy: { id: 'asc' } });
      const tokens = await db.accountActionToken.findMany({
        orderBy: { id: 'asc' },
      });
      const mailCount = mail.messages.length;
      const response = await post('/auth/accounts', rootToken)
        .send(input({ [field]: root[field].toUpperCase() }))
        .expect(409);
      expect(response.body).toMatchObject({
        message: 'User with this email already exists',
      });
      expect(await db.user.findMany({ orderBy: { id: 'asc' } })).toEqual(users);
      expect(
        await db.accountActionToken.findMany({ orderBy: { id: 'asc' } }),
      ).toEqual(tokens);
      expect(mail.messages).toHaveLength(mailCount);
      expect(await list()).toEqual(before);
    },
  );
  it('requires displayName, rejects obsolete contracts and permits duplicate names with distinct emails', async () => {
    for (const change of [
      { displayName: undefined },
      { displayName: '   ' },
      { username: 'obsolete' },
    ]) {
      await post('/auth/accounts', rootToken).send(input(change)).expect(400);
    }
    await post('/auth/setup')
      .send({
        displayName: 'Root',
        jobTitle: 'Administrator',
        email: 'root@example.test',
        setupSecret: secret,
        username: 'obsolete',
      })
      .expect(400);
    const first = await post('/auth/accounts', rootToken)
      .send(input({ displayName: 'Same Name' }))
      .expect(201);
    const second = await post('/auth/accounts', rootToken)
      .send(input({ displayName: 'Same Name' }))
      .expect(201);
    const firstUser = (
      first.body as { user: { id: number; email: string; displayName: string } }
    ).user;
    const secondUser = (
      second.body as {
        user: { id: number; email: string; displayName: string };
      }
    ).user;
    expect(firstUser.id).not.toBe(secondUser.id);
    expect(firstUser.email).not.toBe(secondUser.email);
    expect(firstUser).not.toHaveProperty('username');
    expect(secondUser.displayName).toBe('Same Name');
    const matches = await list(rootToken, { search: 'Same Name' });
    expect(matches.items.map((u) => u.id).sort()).toEqual(
      [firstUser.id, secondUser.id].sort(),
    );
    expect(JSON.stringify(matches)).not.toContain('"username"');
  });
  it('preserves creation success and pending ownership on mail delivery failure', async () => {
    const count = await db.user.count();
    const mailCount = mail.messages.length;
    const identity = input();
    mail.fail = true;
    try {
      const response = await post('/auth/accounts', rootToken)
        .send(identity)
        .expect(201);
      const body = response.body as { delivery: string; user: { id: number } };
      expect(body.delivery).toBe('FAILED');
      expect(await db.user.count()).toBe(count + 1);
      expect(
        await db.user.findUnique({ where: { id: body.user.id } }),
      ).toMatchObject({
        password: null,
        activatedAt: null,
        emailVerifiedAt: null,
      });
      expect(
        await db.accountActionToken.count({ where: { userId: body.user.id } }),
      ).toBe(1);
      expect(mail.messages).toHaveLength(mailCount);
      expect((await list()).items.map((u) => u.id)).toContain(body.user.id);
      const before = await list();
      await post('/auth/accounts', rootToken).send(identity).expect(409);
      expect(await list()).toEqual(before);
      expect(
        await db.accountActionToken.count({ where: { userId: body.user.id } }),
      ).toBe(1);
    } finally {
      mail.fail = false;
    }
  });
  it.each(['email'] as const)(
    'lets only one concurrent identity creation win for shared %s',
    async (field) => {
      const identity = input();
      const count = await db.user.count();
      const mailCount = mail.messages.length;
      const responses = await Promise.all(
        [
          input({ [field]: identity[field] }),
          input({ [field]: identity[field] }),
        ].map((body) => post('/auth/accounts', rootToken).send(body)),
      );
      expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await db.user.count()).toBe(count + 1);
      expect(mail.messages).toHaveLength(mailCount + 1);
      const winner = responses.find((r) => r.status === 201)!.body as {
        user: { id: number };
      };
      expect(
        await db.accountActionToken.count({
          where: { userId: winner.user.id },
        }),
      ).toBe(1);
    },
  );
  it('preserves both administrative directory views, creation hierarchy, filters and deterministic pagination', async () => {
    const admin = await seed('ADMIN');
    const adminToken = (await login(admin)).token;
    for (const role of ['ADMIN', 'SUPER_ADMIN']) {
      await post('/auth/accounts', adminToken)
        .send(input({ role }))
        .expect(403);
    }
    await post('/auth/accounts', rootToken)
      .send(input({ role: 'SUPER_ADMIN' }))
      .expect(403);
    for (const role of ['ADMIN', 'MANAGER', 'AGENT', 'EMPLOYEE']) {
      await post('/auth/accounts', rootToken).send(input({ role })).expect(201);
    }
    for (const role of ['MANAGER', 'AGENT', 'EMPLOYEE']) {
      await post('/auth/accounts', adminToken)
        .send(input({ role }))
        .expect(201);
    }
    expect((await list(adminToken)).items).toEqual((await list()).items);
    for (const token of [rootToken, adminToken]) {
      expect(
        (
          await list(token, {
            role: 'SUPER_ADMIN',
            status: 'ACTIVE',
            search: 'ROOT@EXAMPLE.TEST',
          })
        ).items.map((u) => u.id),
      ).toEqual([root.id]);
      expect(
        (await list(token, { role: 'EMPLOYEE', search: root.email })).items,
      ).toEqual([]);
      expect(
        (await list(token, { status: 'INACTIVE', search: root.email })).items,
      ).toEqual([]);
    }
    await db.user.createMany({
      data: Array.from({ length: 30 }, () => input()),
    });
    const first = await list();
    expect(first.items).toHaveLength(25);
    expect(first.items.map((u) => u.id)).not.toContain(root.id);
    expect(await list()).toEqual(first);
    const ids = first.items.map((u) => u.id);
    let page = first;
    while (page.hasMore) {
      page = await list(rootToken, { cursor: page.nextCursor });
      ids.push(...page.items.map((u) => u.id));
    }
    expect(ids).toEqual(
      (
        await db.user.findMany({
          orderBy: { id: 'desc' },
          select: { id: true },
        })
      ).map((u) => u.id),
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.at(-1)).toBe(root.id);
    expect(await db.user.count({ where: { role: 'SUPER_ADMIN' } })).toBe(1);
  });
});
