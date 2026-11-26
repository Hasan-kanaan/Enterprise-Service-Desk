import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

// Everything runs inside a transaction that is always rolled back.
describe('pgvector extension (PostgreSQL)', () => {
  const client = new Client({
    connectionString: process.env.TEST_DATABASE_URL,
  });
  beforeAll(() => client.connect());
  afterAll(() => client.end());
  afterEach(() => client.query('ROLLBACK'));

  it('stores vectors and returns nearest neighbours by cosine distance', async () => {
    await client.query('BEGIN');
    await client.query(
      'CREATE TEMP TABLE probe (id int, embedding public.vector(3))',
    );
    await client.query(
      `INSERT INTO probe VALUES (1, '[1,0,0]'), (2, '[0,1,0]'), (3, '[0.9,0.1,0]')`,
    );
    const result = await client.query<{ id: number }>(
      `SELECT id FROM probe ORDER BY embedding <=> '[1,0,0]' LIMIT 2`,
    );
    expect(result.rows.map((row) => row.id)).toEqual([1, 3]);
  });

  it('migration is safe when replayed inside a private schema', async () => {
    const schema = `pgvector_${randomUUID().replaceAll('-', '')}`;
    await client.query('BEGIN');
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}"`);
    await client.query(
      readFileSync(
        join(
          __dirname,
          '../prisma/migrations/20261125120000_enable_pgvector/migration.sql',
        ),
        'utf8',
      ),
    );
    const result = await client.query<{ v: string }>(
      `SELECT '[1,2,3]'::public.vector::text AS v`,
    );
    expect(result.rows[0].v).toBe('[1,2,3]');
  });
});
