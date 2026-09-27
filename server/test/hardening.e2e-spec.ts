import { MailProvider } from '../src/auth/mail.provider';
import { FakeMailProvider } from './fake-mail.provider';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, UserRole, type User } from '../generated/prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { configureTestSecurity } from './security-test-app';
import { readFileSync, readdirSync } from 'node:fs';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as bcrypt from 'bcryptjs';
import type { Server } from 'node:http';

type Login = { accessToken: string; user: { passwordChangeRequired: boolean } };
type TicketResult = { id: number };
describe('Pre-AI hardening (isolated PostgreSQL schema and HTTP)', () => {
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
  it('requires the setup secret, preserves concurrent one-root creation, and never projects secrets', async () => {
    const log = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    try {
      const input = { username: 'root', email: 'root@example.test', password };
      await post('/auth/setup').send(input).expect(400);
      await post('/auth/setup')
        .send({ ...input, setupSecret: 'wrong' })
        .expect(403);
      const attempts = await Promise.all(
        [0, 1].map((i) =>
          post('/auth/setup').send({
            ...input,
            username: `root${i}`,
            email: `root${i}@example.test`,
            setupSecret: secret,
          }),
        ),
      );
      expect(attempts.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await db.user.count({ where: { role: 'SUPER_ADMIN' } })).toBe(1);
      await post('/auth/setup')
        .send({ ...input, setupSecret: secret })
        .expect(409);
      expect(
        JSON.stringify(attempts.map((r) => r.body as unknown)),
      ).not.toContain(secret);
      expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
    } finally {
      log.mockRestore();
    }
  });
  it('creates one ticket, cycle and attachment across concurrent retries; keys never cross requester boundaries', async () => {
    const employee = await seed('EMPLOYEE'),
      other = await seed('EMPLOYEE');
    const a = await login(employee),
      b = await login(other);
    const category = await db.ticketCategory.create({
      data: { name: randomUUID() },
    });
    const input = {
      clientRequestId: randomUUID(),
      title: 'Network issue',
      description: 'Details',
      categoryId: category.id,
      allRegions: true,
      allDepartments: true,
      affectedRegionIds: [],
      affectedDepartmentIds: [],
    };
    const send = (token = a.token, body = input, file = 'evidence') =>
      post('/tickets', token)
        .field('payload', JSON.stringify(body))
        .attach('files', Buffer.from(file), 'evidence.txt');
    const results = await Promise.all([send(), send(), send()]);
    expect(results.map((r) => r.status)).toEqual([201, 201, 201]);
    const id = (results[0].body as TicketResult).id;
    expect(results.map((r) => (r.body as TicketResult).id)).toEqual([
      id,
      id,
      id,
    ]);
    await send().expect(201);
    await send(a.token, { ...input, title: 'Different' }).expect(409);
    await send(a.token, input, 'different attachment').expect(409);
    expect(await db.ticket.count({ where: { requesterId: employee.id } })).toBe(
      1,
    );
    expect(await db.ticketWorkCycle.count({ where: { ticketId: id } })).toBe(1);
    expect(await db.attachment.count({ where: { ticketId: id } })).toBe(1);
    expect(await db.notification.count({ where: { ticketId: id } })).toBe(0);
    expect(await readdir(directory)).toHaveLength(1);
    const distinct = await send(b.token).expect(201);
    expect((distinct.body as TicketResult).id).not.toBe(id);
    await request(app.getHttpServer())
      .get(`/tickets/${id}`)
      .set('Authorization', `Bearer ${b.token}`)
      .expect(404);
  });
  it('enforces password byte limits for setup, account creation, login, self-change and reset', async () => {
    const admin = await seed('ADMIN'),
      employee = await seed('EMPLOYEE');
    const a = await login(admin),
      e = await login(employee);
    for (const value of ['a'.repeat(73), 'é'.repeat(37), '😀'.repeat(19)]) {
      await post('/auth/setup')
        .send({
          username: 'large',
          email: 'large@example.test',
          setupSecret: secret,
          password: value,
        })
        .expect(400);
      await post('/auth/accounts', a.token)
        .send({
          username: 'large',
          email: 'large@example.test',
          password: value,
          role: 'EMPLOYEE',
        })
        .expect(400);
      await post('/auth/login')
        .send({ email: employee.email, password: value })
        .expect(400);
      await post('/auth/password', e.token)
        .send({ currentPassword: password, newPassword: value })
        .expect(400);
      await post(`/auth/accounts/${employee.id}/reset-password`, a.token)
        .send({ newPassword: value })
        .expect(400);
    }
  });
  it('self-change requires current password and invalidates every access/refresh session', async () => {
    const employee = await seed('EMPLOYEE');
    const a = await login(employee),
      b = await login(employee);
    await post('/auth/password', a.token)
      .send({ currentPassword: 'IncorrectPassword', newPassword: nextPassword })
      .expect(400);
    await post('/auth/password', a.token)
      .send({ currentPassword: password, newPassword: nextPassword })
      .expect(201);
    for (const session of [a, b]) {
      await request(app.getHttpServer())
        .get('/users/profile')
        .set('Authorization', `Bearer ${session.token}`)
        .expect(401);
      await post('/auth/refresh').set('Cookie', session.cookie).expect(401);
    }
    await post('/auth/login')
      .send({ email: employee.email, password })
      .expect(401);
    await login(employee, nextPassword);
  });
  it.each(Object.values(UserRole))(
    'enforces the complete reset matrix for %s',
    async (role) => {
      const actor = await seed(role),
        a = await login(actor);
      for (const targetRole of Object.values(UserRole)) {
        const target = await seed(targetRole),
          old = await login(target);
        const allowed =
          role === 'SUPER_ADMIN'
            ? targetRole !== 'SUPER_ADMIN'
            : role === 'ADMIN' &&
              !['SUPER_ADMIN', 'ADMIN'].includes(targetRole);
        const result = await post(
          `/auth/accounts/${target.id}/reset-password`,
          a.token,
        )
          .send({})
          .expect(allowed ? 201 : 403);
        expect(JSON.stringify(result.body)).not.toContain(nextPassword);
        if (allowed) {
          await post('/auth/reset-password')
            .send({
              token: mail.token(target.email, 'reset'),
              newPassword: nextPassword,
            })
            .expect(201);
          await post('/auth/refresh').set('Cookie', old.cookie).expect(401);
          await request(app.getHttpServer())
            .get('/users/profile')
            .set('Authorization', `Bearer ${old.token}`)
            .expect(401);
          const reset = await login(target, nextPassword);
          expect(reset.body.user.passwordChangeRequired).toBe(false);
        }
      }
    },
  );
});
