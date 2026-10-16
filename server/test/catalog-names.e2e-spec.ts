import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { jwtConstants } from '../src/auth/auth.constants';
import { MailProvider } from '../src/auth/mail.provider';
import { FakeMailProvider } from './fake-mail.provider';
import { configureTestSecurity } from './security-test-app';

const catalogs = [
  ['Region', '/organization/regions'],
  ['Department', '/organization/departments'],
  ['Specialty', '/organization/specialties'],
  ['TicketCategory', '/ticket-configuration/categories'],
  ['TicketTag', '/ticket-configuration/tags'],
] as const;

describe('Case-insensitive catalog names (PostgreSQL/HTTP)', () => {
  let app: NestExpressApplication;
  let db: PrismaService;
  let authorization: string;
  let adminId: number;
  const prefix = `ci-${randomUUID()}-`;
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailProvider)
      .useValue(new FakeMailProvider())
      .compile();
    app = module.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });
    configureTestSecurity(app);
    await app.init();
    db = app.get(PrismaService);
    const sid = randomUUID();
    const admin = await db.user.create({
      data: {
        email: `${prefix}@test.invalid`,
        displayName: prefix,
        role: 'ADMIN',
        activatedAt: new Date(),
        password: 'unused-test-hash',
        sessions: { create: { id: sid } },
      },
    });
    adminId = admin.id;
    authorization = `Bearer ${new JwtService({ secret: jwtConstants.secret }).sign({ sub: admin.id, sid, sessionVersion: admin.sessionVersion })}`;
  });
  afterAll(async () => {
    // Only this suite's uniquely prefixed fixtures; never reset a database.
    for (const table of ['Team', ...catalogs.map(([table]) => table)]) {
      await pool.query(
        `DELETE FROM "${table}" WHERE lower(btrim(name)) LIKE $1`,
        [`${prefix}%`],
      );
    }
    if (adminId) await db.user.delete({ where: { id: adminId } });
    await app?.close();
    await pool.end();
  });
  const post = (path: string, body: object = {}) =>
    request(app.getHttpServer())
      .post(path)
      .set('Authorization', authorization)
      .send(body);
  const patch = (path: string, body: object) =>
    request(app.getHttpServer())
      .patch(path)
      .set('Authorization', authorization)
      .send(body);

  it.each(catalogs)(
    '%s preserves display casing and rejects case/space duplicates, rename and archived collisions',
    async (table, path) => {
      const name = `${prefix}${table} Cyber Security`;
      const response = await post(path, { name: `  ${name}  ` }).expect(201);
      const original = response.body as { id: number; name: string };
      expect(original.name).toBe(name);
      for (const duplicate of [
        name.toLowerCase(),
        name.toUpperCase(),
        ` ${name.toUpperCase()} `,
      ]) {
        const conflict = await post(path, { name: duplicate }).expect(409);
        expect(JSON.stringify(conflict.body)).not.toMatch(
          /_ci_key|23505|unique constraint/i,
        );
      }
      const second = (await post(path, { name: `${name} Other` }).expect(201))
        .body as { id: number };
      await patch(`${path}/${second.id}`, { name: name.toUpperCase() }).expect(
        409,
      );
      await patch(`${path}/${original.id}`, {
        name: name.toUpperCase(),
      }).expect(200);
      await post(`${path}/${original.id}/archive`).expect(201);
      await post(path, { name: name.toLowerCase() }).expect(409);
      await post(`${path}/${original.id}/reactivate`).expect(201);
      const rows = await pool.query<{ name: string; archivedAt: Date | null }>(
        `SELECT name, "archivedAt" FROM "${table}" WHERE id = $1`,
        [original.id],
      );
      expect(rows.rows[0]).toEqual({
        name: name.toUpperCase(),
        archivedAt: null,
      });
      // Raw concurrent SQL bypasses all service validation and Prisma checks.
      const race = `${prefix}${table} Concurrent`;
      const results = await Promise.allSettled([
        pool.query(
          `INSERT INTO "${table}" (name, "updatedAt") VALUES ($1, NOW())`,
          [race],
        ),
        pool.query(
          `INSERT INTO "${table}" (name, "updatedAt") VALUES ($1, NOW())`,
          [` ${race.toUpperCase()} `],
        ),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const failure = results.find(
        (r) => r.status === 'rejected',
      ) as PromiseRejectedResult;
      expect(failure.reason).toMatchObject({ code: '23505' });
    },
  );

  it('Team uniqueness keeps the existing Region/global key for creation, rename and coverage changes', async () => {
    const a = await db.region.create({
      data: { name: `${prefix}Team Region A` },
    });
    const b = await db.region.create({
      data: { name: `${prefix}Team Region B` },
    });
    const name = `${prefix}Service Team`;
    const regional = (
      await post('/organization/teams', {
        name: ` ${name} `,
        scope: 'REGION',
        regionId: a.id,
      }).expect(201)
    ).body as { id: number; name: string };
    expect(regional.name).toBe(name);
    for (const duplicate of [name.toLowerCase(), name.toUpperCase()]) {
      await post('/organization/teams', {
        name: duplicate,
        scope: 'REGION',
        regionId: a.id,
      }).expect(409);
    }
    await post('/organization/teams', {
      name: name.toLowerCase(),
      scope: 'REGION',
      regionId: b.id,
    }).expect(201);
    const global = (
      await post('/organization/teams', { name, scope: 'GLOBAL' }).expect(201)
    ).body as { id: number };
    await post('/organization/teams', {
      name: name.toUpperCase(),
      scope: 'GLOBAL',
    }).expect(409);
    await patch(`/organization/teams/${regional.id}/coverage`, {
      scope: 'GLOBAL',
    }).expect(409);
    await patch(`/organization/teams/${global.id}`, {
      name: `${name} Renamed`,
    }).expect(200);
    await patch(`/organization/teams/${regional.id}/coverage`, {
      scope: 'GLOBAL',
    }).expect(200);
    await patch(`/organization/teams/${global.id}`, {
      name: name.toLowerCase(),
    }).expect(409);
    await post(`/organization/teams/${regional.id}/archive`).expect(201);
    await post('/organization/teams', {
      name: name.toLowerCase(),
      scope: 'GLOBAL',
    }).expect(409);
    await post(`/organization/teams/${regional.id}/reactivate`).expect(201);
    for (const regionId of [null, a.id]) {
      const race = `${prefix}Team Race ${regionId ?? 'global'}`;
      const results = await Promise.allSettled(
        [race, race.toUpperCase()].map((value) =>
          pool.query(
            'INSERT INTO "Team" (name, scope, "regionId", "updatedAt") VALUES ($1, $2, $3, NOW())',
            [value, regionId ? 'REGION' : 'GLOBAL', regionId],
          ),
        ),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(
        (results.find((r) => r.status === 'rejected') as PromiseRejectedResult)
          .reason,
      ).toMatchObject({ code: '23505' });
    }
  });

  it.each([...catalogs.map(([table]) => table), 'Team'])(
    'migration clearly rejects existing %s duplicates without repairing data',
    async (table) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Temporary tables shadow real tables: exercise the real migration safely.
        for (const name of [...catalogs.map(([name]) => name), 'Team']) {
          await client.query(
            `CREATE TEMP TABLE "${name}" (name text, "regionId" integer) ON COMMIT DROP`,
          );
        }
        await client.query(
          `INSERT INTO "${table}" (name) VALUES ('Mixed Name'), ('mixed name')`,
        );
        await client.query('SAVEPOINT before_migration');
        const migration = readFileSync(
          join(
            __dirname,
            '../prisma/migrations/20261016120000_catalog_case_insensitive_names/migration.sql',
          ),
          'utf8',
        ).replace(/^BEGIN;|^COMMIT;/gm, '');
        await expect(client.query(migration)).rejects.toThrow(
          /Case-insensitive.*collision/,
        );
        await client.query('ROLLBACK TO SAVEPOINT before_migration');
        expect(
          (
            await client.query<{ name: string }>(
              `SELECT name FROM "${table}" ORDER BY name`,
            )
          ).rows
            .map((row) => row.name)
            .sort(),
        ).toEqual(['Mixed Name', 'mixed name']);
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    },
  );

  it('contains all seven migration-owned functional unique indexes', async () => {
    const result = await pool.query<{ indexname: string; indexdef: string }>(
      "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE '%_ci_key'",
    );
    expect(result.rows).toHaveLength(7);
    for (const row of result.rows)
      expect(row.indexdef).toMatch(/CREATE UNIQUE INDEX .*lower\(btrim/);
  });
});
