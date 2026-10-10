const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  DATABASE,
  PASSWORD,
  connectionConfig,
  validateRequest,
  prepare,
} = require('./manual-test.cjs');
const url = `postgresql://postgres:postgres@127.0.0.1:5432/${DATABASE}`;

test('only the explicitly named local manual database is accepted', () => {
  for (const value of [
    undefined,
    '',
    'garbage',
    url.replace(DATABASE, 'enterprise_service_desk'),
    url.replace(DATABASE, 'eds_stabilization_test'),
    url.replace(DATABASE, 'other_test'),
    url.replace(DATABASE, 'other_manual'),
    url.replace(DATABASE, ''),
    url.replace('127.0.0.1', 'remote.example.test'),
    `${url}?dbname=enterprise_service_desk`,
    `${url}?host=remote.example.test`,
    `${url}?schema=public`,
    `${url}#fragment`,
    url.replace('_manual', '_%6danual'),
    url.replace('postgres:postgres@', ''),
    url.replace('postgresql:', 'https:'),
  ]) {
    assert.throws(() => connectionConfig(value), /MANUAL_TEST_DATABASE_URL/);
  }
  assert.equal(connectionConfig(url).database, DATABASE);
  assert.throws(() =>
    validateRequest({ DATABASE_URL: url, TEST_DATABASE_URL: url }, ['seed']),
  );
  assert.throws(() =>
    validateRequest({ MANUAL_TEST_DATABASE_URL: url }, ['reset']),
  );
  assert.throws(() =>
    validateRequest({ MANUAL_TEST_DATABASE_URL: url }, [
      'seed',
      '--super-admin',
    ]),
  );
  assert.equal(
    validateRequest({ MANUAL_TEST_DATABASE_URL: url }, [
      'reset',
      `--confirm=${DATABASE}`,
    ]).mode,
    'reset',
  );
});

function fake({
  database = DATABASE,
  bootstrap = true,
  existing = 0,
  occupied = false,
  failInsert = false,
} = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('current_database()'))
        return { rows: [{ name: database }] };
      if (sql.includes("WHERE role = 'SUPER_ADMIN'"))
        return { rows: bootstrap ? [{ id: 1 }] : [] };
      if (sql.includes('WHERE email = ANY'))
        return { rows: Array.from({ length: existing }, () => ({})) };
      if (sql.startsWith('SELECT 1')) return { rows: occupied ? [{}] : [] };
      if (sql.includes('FROM pg_tables'))
        return { rows: [{ tablename: 'User' }, { tablename: 'Ticket' }] };
      if (sql.startsWith('INSERT')) {
        if (failInsert) throw new Error('injected failure');
        return { rows: [{ id: calls.length }] };
      }
      return { rows: [] };
    },
  };
}
test('identity mismatch and missing bootstrap refuse writes and roll back', async () => {
  for (const db of [
    fake({ database: 'enterprise_service_desk' }),
    fake({ bootstrap: false }),
  ]) {
    await assert.rejects(prepare(db, 'seed'));
    assert.equal(db.calls.at(-1).sql, 'ROLLBACK');
    assert.ok(!db.calls.some(({ sql }) => /INSERT|TRUNCATE/.test(sql)));
  }
});
test('repeat seed preserves UI work; partial or non-bootstrap data refuses merging', async () => {
  const db = fake({ existing: 10 });
  assert.match(await prepare(db, 'seed'), /already exist/);
  assert.ok(
    !db.calls.some(({ sql }) => /INSERT|UPDATE|DELETE|TRUNCATE/.test(sql)),
  );
  for (const options of [
    { existing: 1 },
    { occupied: true },
    { failInsert: true },
  ]) {
    const failed = fake(options);
    await assert.rejects(prepare(failed, 'seed'));
    assert.equal(failed.calls.at(-1).sql, 'ROLLBACK');
  }
});
test('seed creates the intended personas and relationships without lifecycle fixtures', async () => {
  const db = fake();
  await prepare(db, 'seed');
  const users = db.calls.filter(({ sql }) =>
    sql.startsWith('INSERT INTO public."User"'),
  );
  assert.equal(users.length, 10);
  const record = ({ sql, values }) =>
    Object.fromEntries(
      sql
        .slice(sql.indexOf('(') + 1, sql.indexOf(')'))
        .split(', ')
        .map((key, i) => [key.replaceAll('"', ''), values[i]]),
    );
  const accounts = users.map(record);
  assert.equal(accounts.filter((u) => u.role === 'SUPER_ADMIN').length, 0);
  assert.equal(accounts.filter((u) => u.role === 'ADMIN').length, 1);
  assert.equal(accounts.filter((u) => u.role === 'MANAGER').length, 2);
  assert.equal(
    accounts.filter(
      (u) => u.role === 'AGENT' && u.status === 'ACTIVE' && u.activatedAt,
    ).length,
    3,
  );
  assert.equal(
    accounts.find((u) => u.username === 'manual-pending').password,
    null,
  );
  assert.equal(
    accounts.find((u) => u.username === 'manual-pending').activatedAt,
    null,
  );
  assert.equal(
    accounts.find((u) => u.username === 'manual-inactive').status,
    'INACTIVE',
  );
  assert.ok(await require('bcryptjs').compare(PASSWORD, accounts[0].password));
  const teams = db.calls
    .filter(({ sql }) => sql.startsWith('INSERT INTO public."Team"'))
    .map(record);
  assert.equal(teams.length, 3);
  assert.equal(teams.find((t) => t.scope === 'GLOBAL').regionId, null);
  assert.equal(teams.filter((t) => t.teamLeadId).length, 1);
  assert.equal(
    db.calls.filter(({ sql }) =>
      sql.startsWith('INSERT INTO public."TeamMember"'),
    ).length,
    5,
  );
  assert.equal(
    db.calls.filter(({ sql }) =>
      sql.startsWith('INSERT INTO public."TeamManager"'),
    ).length,
    2,
  );
  assert.ok(
    !db.calls.some(({ sql }) =>
      /^INSERT INTO public."(Ticket|Subtask|AccountActionToken|UserSession)"/.test(
        sql,
      ),
    ),
  );
  assert.equal(db.calls.at(-1).sql, 'COMMIT');
});
test('reset verifies target before truncating and preserves migration history', async () => {
  const wrong = fake({ database: 'eds_stabilization_test' });
  await assert.rejects(prepare(wrong, 'reset'));
  assert.ok(!wrong.calls.some(({ sql }) => sql.startsWith('TRUNCATE')));
  const db = fake();
  await prepare(db, 'reset');
  assert.ok(
    db.calls.some(({ sql }) =>
      sql.includes("tablename <> '_prisma_migrations'"),
    ),
  );
  assert.equal(
    db.calls.find(({ sql }) => sql.startsWith('TRUNCATE')).sql,
    'TRUNCATE TABLE public."User", public."Ticket" RESTART IDENTITY',
  );
  assert.equal(db.calls.at(-1).sql, 'COMMIT');
});
