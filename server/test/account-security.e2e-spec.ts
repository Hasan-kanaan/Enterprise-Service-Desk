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

describe('Account activation and recovery (isolated PostgreSQL + fake mail)', () => {
  const mail = new FakeMailProvider();
  const schema = `hardening_${randomUUID().replaceAll('-', '')}`;
  const sql = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  const secret = 'test-bootstrap-9xQ4rT7vB2nM6pL8-fixture';
  const originalSecret = process.env.INITIAL_SETUP_SECRET;
  const originalStorage = process.env.ATTACHMENT_STORAGE_DIR;
  let app: NestExpressApplication<Server>, db: PrismaClient, directory: string;
  const password = 'InitialPassword123!';
  const nextPassword = 'ReplacementPassword456!';
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
        username: randomUUID(),
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
      .sort()) {
      if (migration === '20260927180000_account_activation')
        await sql.query(
          'INSERT INTO "User" (username, email, password, "updatedAt", "passwordChangeRequired") VALUES ($1, $2, $3, NOW(), true)',
          ['legacy', 'legacy@example.test', await bcrypt.hash(password, 10)],
        );
      await sql.query(
        readFileSync(
          join(__dirname, '../prisma/migrations', migration, 'migration.sql'),
          'utf8',
        ),
      );
    }
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

  it('migrates legacy credentials truthfully and preserves forced-change compatibility', async () => {
    const legacy = await db.user.findUniqueOrThrow({
      where: { email: 'legacy@example.test' },
    });
    expect(legacy.activatedAt).toEqual(legacy.createdAt);
    expect(legacy.emailVerifiedAt).toBeNull();
    const session = await login(legacy);
    expect(session.body.user.passwordChangeRequired).toBe(true);
    await request(app.getHttpServer())
      .get('/ticket-options')
      .set('Authorization', `Bearer ${session.token}`)
      .expect(403);
    await post('/auth/password', session.token)
      .send({ currentPassword: password, newPassword: nextPassword })
      .expect(201);
    expect(
      (await login(legacy, nextPassword)).body.user.passwordChangeRequired,
    ).toBe(false);
    expect(mail.messages.at(-1)).toMatchObject({
      type: 'changed',
      email: legacy.email,
    });
  });
  it('does not send email for ordinary ticket events', async () => {
    const employee = await seed('EMPLOYEE');
    const session = await login(employee);
    const category = await db.ticketCategory.create({
      data: { name: randomUUID() },
    });
    const count = mail.messages.length;
    await post('/tickets', session.token)
      .send({
        clientRequestId: randomUUID(),
        title: 'Ordinary ticket',
        description: 'Test',
        categoryId: category.id,
        allRegions: true,
        allDepartments: true,
        affectedRegionIds: [],
        affectedDepartmentIds: [],
      })
      .expect(201);
    expect(mail.messages).toHaveLength(count);
  });
  const provision = async (role: UserRole = 'EMPLOYEE') => {
    const admin = await seed('ADMIN');
    const session = await login(admin);
    const email = `${randomUUID()}@example.test`;
    const response = await post('/auth/accounts', session.token)
      .send({
        username: randomUUID(),
        email,
        role,
        phoneNumber: '+961 (70) 123-456',
      })
      .expect(201);
    const body = response.body as { user: { id: number }; delivery: string };
    expect(body.delivery).toBe('SENT');
    expect(JSON.stringify(body)).not.toContain(mail.token(email, 'activation'));
    const user = await db.user.findUniqueOrThrow({
      where: { id: body.user.id },
    });
    expect(user).toMatchObject({
      password: null,
      activatedAt: null,
      emailVerifiedAt: null,
      phoneNumber: '+96170123456',
      phoneVerifiedAt: null,
      status: 'ACTIVE',
    });
    return user;
  };
  const expireCooldown = (id: number) =>
    db.accountActionToken.updateMany({
      where: { userId: id },
      data: { createdAt: new Date(Date.now() - 61000) },
    });
  it('provisions pending users, verifies email on activation, never auto logs in, rejects replay and wrong purpose', async () => {
    const user = await provision();
    await post('/auth/login').send({ email: user.email, password }).expect(401);
    const token = mail.token(user.email, 'activation');
    const stored = await db.accountActionToken.findFirstOrThrow({
      where: { userId: user.id },
    });
    expect(stored.tokenHash).not.toBe(token);
    expect(stored.tokenHash).toHaveLength(64);
    await post('/auth/reset-password')
      .send({ token, newPassword: password })
      .expect(400);
    await post('/auth/activate')
      .send({ token, newPassword: 'short' })
      .expect(400);
    const response = await post('/auth/activate')
      .send({ token, newPassword: password })
      .expect(201);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.body).not.toHaveProperty('accessToken');
    const activated = await db.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(activated.activatedAt).toBeInstanceOf(Date);
    expect(activated.emailVerifiedAt).toBeInstanceOf(Date);
    expect(await bcrypt.compare(password, activated.password!)).toBe(true);
    await post('/auth/activate')
      .send({ token, newPassword: password })
      .expect(400);
    await login(user);
  });
  it('enforces expiry, replacement and durable cooldown for activation', async () => {
    const user = await provision();
    const old = mail.token(user.email, 'activation');
    const count = mail.messages.length;
    await post('/auth/resend-activation')
      .send({ email: user.email })
      .expect(201);
    expect(mail.messages).toHaveLength(count);
    await expireCooldown(user.id);
    await post('/auth/resend-activation')
      .send({ email: user.email })
      .expect(201);
    const replacement = mail.token(user.email, 'activation');
    expect(replacement).not.toBe(old);
    await post('/auth/activate')
      .send({ token: old, newPassword: password })
      .expect(400);
    await db.accountActionToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(0) },
    });
    await post('/auth/activate')
      .send({ token: replacement, newPassword: password })
      .expect(400);
  });
  it('returns identical public results for unknown, pending, inactive and eligible users; limits repeat emails', async () => {
    const active = await seed('SUPER_ADMIN');
    const inactive = await seed('EMPLOYEE');
    await db.user.update({
      where: { id: inactive.id },
      data: { status: 'INACTIVE' },
    });
    const pending = await provision();
    const before = mail.messages.length;
    const responses: unknown[] = [];
    for (const email of [
      active.email,
      inactive.email,
      pending.email,
      'unknown@example.test',
      active.email,
    ]) {
      responses.push(
        (await post('/auth/forgot-password').send({ email }).expect(201))
          .body as unknown,
      );
    }
    for (const response of responses) expect(response).toEqual(responses[0]);
    expect(mail.messages).toHaveLength(before + 1);
    expect(mail.messages.at(-1)?.email).toBe(active.email);
  });
  it('atomically resets credentials and invalidates every device without auto-login; sends notice', async () => {
    const user = await seed('EMPLOYEE');
    const devices = [await login(user), await login(user)];
    await post('/auth/forgot-password').send({ email: user.email }).expect(201);
    const token = mail.token(user.email, 'reset');
    const response = await post('/auth/reset-password')
      .send({ token, newPassword: nextPassword })
      .expect(201);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.body).not.toHaveProperty('accessToken');
    expect(mail.messages.at(-1)).toMatchObject({
      type: 'changed',
      email: user.email,
    });
    await post('/auth/reset-password')
      .send({ token, newPassword: password })
      .expect(400);
    await post('/auth/login').send({ email: user.email, password }).expect(401);
    for (const device of devices) {
      await post('/auth/refresh').set('Cookie', device.cookie).expect(401);
      await request(app.getHttpServer())
        .get('/users/profile')
        .set('Authorization', `Bearer ${device.token}`)
        .expect(401);
    }
    await login(user, nextPassword);
  });
  it('rejects expired/revoked reset tokens and concurrent consumption has one winner', async () => {
    const user = await seed('EMPLOYEE');
    await post('/auth/forgot-password').send({ email: user.email }).expect(201);
    const old = mail.token(user.email, 'reset');
    await db.accountActionToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(0) },
    });
    await post('/auth/reset-password')
      .send({ token: old, newPassword: nextPassword })
      .expect(400);
    await expireCooldown(user.id);
    await post('/auth/forgot-password').send({ email: user.email }).expect(201);
    await post('/auth/reset-password')
      .send({ token: old, newPassword: nextPassword })
      .expect(400);
    const token = mail.token(user.email, 'reset');
    const results = await Promise.all(
      [1, 2].map(() =>
        post('/auth/reset-password').send({ token, newPassword: nextPassword }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.every((r) => [201, 400, 409].includes(r.status))).toBe(true);
  });
  it('keeps provisioned accounts and changed credentials when delivery fails, hides public failures', async () => {
    const admin = await seed('ADMIN');
    const actor = await login(admin);
    mail.fail = true;
    try {
      const email = `${randomUUID()}@example.test`;
      const created = await post('/auth/accounts', actor.token)
        .send({ username: randomUUID(), email, role: 'EMPLOYEE' })
        .expect(201);
      expect((created.body as { delivery: string }).delivery).toBe('FAILED');
      expect(await db.user.findUnique({ where: { email } })).toMatchObject({
        activatedAt: null,
      });
      await post('/auth/forgot-password')
        .send({ email: admin.email })
        .expect(201);
      await post('/auth/password', actor.token)
        .send({ currentPassword: password, newPassword: nextPassword })
        .expect(201);
      await login(admin, nextPassword);
    } finally {
      mail.fail = false;
    }
  });
  it('rejects administrator password fields and invalid phone values', async () => {
    const admin = await seed('ADMIN');
    const actor = await login(admin);
    for (const extra of [
      { password },
      { phoneNumber: '70123456' },
      { phoneNumber: '+00012345678' },
      { phoneVerifiedAt: new Date().toISOString() },
    ]) {
      await post('/auth/accounts', actor.token)
        .send({
          username: randomUUID(),
          email: `${randomUUID()}@example.test`,
          role: 'EMPLOYEE',
          ...extra,
        })
        .expect(400);
    }
  });
});
