// Explicit local fixtures only. Never imported by application startup or e2e tests.
const DATABASE = 'enterprise_service_desk_manual';
const PASSWORD = 'ManualDesk!2026';
const personas = [
  ['admin', 'ADMIN', 'North', 'IT'],
  ['manager-a', 'MANAGER', 'North', 'IT'],
  ['manager-b', 'MANAGER', 'South', 'IT'],
  ['agent-a', 'AGENT', 'North', 'IT'],
  ['agent-b', 'AGENT', 'North', 'IT'],
  ['agent-c', 'AGENT', 'South', 'IT'],
  ['employee-a', 'EMPLOYEE', 'North', 'Finance'],
  ['employee-b', 'EMPLOYEE', 'South', 'People'],
  ['pending', 'AGENT', 'South', 'IT'],
  ['inactive', 'AGENT', 'North', 'IT'],
];

function connectionConfig(raw) {
  const refuse = () => {
    throw new Error(
      `MANUAL_TEST_DATABASE_URL must explicitly target local ${DATABASE}; no fallback is allowed.`,
    );
  };
  if (typeof raw !== 'string' || !raw || raw.trim() !== raw) refuse();
  let url;
  try {
    url = new URL(raw);
  } catch {
    refuse();
  }
  // Reject query overrides, socket/remote hosts, encoded paths and ambiguous names.
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.pathname !== `/${DATABASE}` ||
    !url.pathname.endsWith('_manual') ||
    url.search ||
    url.hash ||
    !url.username ||
    !url.password
  )
    refuse();
  return {
    host: url.hostname === '[::1]' ? '::1' : url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: DATABASE,
    ssl: false,
    connectionTimeoutMillis: 5000,
    application_name: 'eds-manual-fixtures',
  };
}

function validateRequest(env, args) {
  const config = connectionConfig(env.MANUAL_TEST_DATABASE_URL);
  if (args[0] === 'seed' && args.length === 1) return { config, mode: 'seed' };
  if (
    args[0] === 'reset' &&
    args.length === 2 &&
    args[1] === `--confirm=${DATABASE}`
  )
    return { config, mode: 'reset' };
  throw new Error(
    `Use seed, or reset --confirm=${DATABASE}. Reset deletes ALL manual data including SUPER_ADMIN; stop the backend first.`,
  );
}

const quote = (name) => `"${name.replaceAll('"', '""')}"`;
async function insert(db, table, values) {
  const keys = Object.keys(values);
  const result = await db.query(
    `INSERT INTO public.${quote(table)} (${keys.map(quote).join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
    Object.values(values),
  );
  return result.rows[0].id;
}

async function seed(db) {
  const { rows: roots } = await db.query(
    `SELECT id FROM public."User" WHERE role = 'SUPER_ADMIN' AND status = 'ACTIVE' AND "activatedAt" IS NOT NULL AND password IS NOT NULL`,
  );
  if (roots.length !== 1)
    throw new Error(
      'Complete the real /setup flow and confirm it is locked before seeding. No SUPER_ADMIN is created by this utility.',
    );
  const emails = personas.map(([name]) => `manual-${name}@example.test`);
  const { rows: existing } = await db.query(
    'SELECT email FROM public."User" WHERE email = ANY($1::text[])',
    [emails],
  );
  if (existing.length === personas.length)
    return 'Fixtures already exist; no accounts, passwords, relationships or manual progress changed.';
  if (existing.length)
    throw new Error(
      'Partial fixture set detected; refusing to overwrite manual progress. Use an explicit reset to start over.',
    );

  // First seed is only supported immediately after bootstrap. Never merge into UI work.
  for (const table of [
    'User',
    'Region',
    'Department',
    'Specialty',
    'Team',
    'TicketCategory',
    'TicketTag',
    'Ticket',
  ]) {
    const where = table === 'User' ? ` WHERE role <> 'SUPER_ADMIN'` : '';
    const { rows } = await db.query(
      `SELECT 1 FROM public.${quote(table)}${where} LIMIT 1`,
    );
    if (rows.length)
      throw new Error(
        'Manual database already has non-bootstrap data. Refusing to merge fixtures; reset explicitly if a fresh scenario is wanted.',
      );
  }
  const now = new Date('2026-01-01T00:00:00.000Z');
  const catalog = async (table, names) => {
    const ids = {};
    for (const name of names)
      ids[name] = await insert(db, table, {
        name: `Manual ${name}`,
        createdAt: now,
        updatedAt: now,
      });
    return ids;
  };
  const regions = await catalog('Region', ['North', 'South']);
  const departments = await catalog('Department', ['IT', 'Finance', 'People']);
  const specialties = await catalog('Specialty', [
    'Hardware',
    'Network',
    'Applications',
  ]);
  await catalog('TicketCategory', ['Hardware', 'Connectivity', 'Access']);
  await catalog('TicketTag', ['VPN', 'Laptop', 'Onboarding']);
  const hash = await require('bcryptjs').hash(PASSWORD, 10);
  const users = {};
  for (const [name, role, region, department] of personas) {
    users[name] = await insert(db, 'User', {
      username: `manual-${name}`,
      email: `manual-${name}@example.test`,
      displayName: `Manual ${name}`,
      jobTitle: `Synthetic ${role.toLowerCase()}`,
      role,
      status: name === 'inactive' ? 'INACTIVE' : 'ACTIVE',
      password: name === 'pending' ? null : hash,
      activatedAt: name === 'pending' ? null : now,
      regionId: regions[region],
      departmentId: departments[department],
      createdAt: now,
      updatedAt: now,
    });
  }
  const link = async (table, values) => {
    const keys = Object.keys(values);
    await db.query(
      `INSERT INTO public.${quote(table)} (${keys.map(quote).join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')})`,
      Object.values(values),
    );
  };
  const teamSpecs = [
    [
      'North Support',
      'North',
      'manager-a',
      ['agent-a', 'agent-b'],
      ['Hardware', 'Network'],
      'agent-a',
    ],
    ['South Support', 'South', 'manager-b', ['agent-c'], ['Hardware'], null],
    [
      'Global Applications',
      null,
      null,
      ['agent-b', 'agent-c'],
      ['Applications'],
      null,
    ],
  ];
  for (const [name, region, manager, members, skills, lead] of teamSpecs) {
    const teamId = await insert(db, 'Team', {
      name: `Manual ${name}`,
      scope: region ? 'REGION' : 'GLOBAL',
      regionId: region ? regions[region] : null,
      teamLeadId: lead ? users[lead] : null,
      createdAt: now,
      updatedAt: now,
    });
    for (const member of members)
      await link('TeamMember', { teamId, userId: users[member] });
    if (manager)
      await link('TeamManager', { teamId, managerId: users[manager] });
    for (const skill of skills)
      await link('TeamSpecialty', { teamId, specialtyId: specialties[skill] });
  }
  for (const [name, skills] of [
    ['agent-a', ['Hardware', 'Network']],
    ['agent-b', ['Network', 'Applications']],
    ['agent-c', ['Hardware', 'Applications']],
  ]) {
    for (const skill of skills)
      await link('UserSpecialty', {
        userId: users[name],
        specialtyId: specialties[skill],
      });
  }
  return 'Seeded 10 synthetic accounts and organization/configuration fixtures. No tickets or SUPER_ADMIN created.';
}

async function prepare(db, mode) {
  await db.query('BEGIN');
  try {
    const { rows } = await db.query('SELECT current_database() AS name');
    if (rows[0]?.name !== DATABASE)
      throw new Error(
        'Connected database identity mismatch; refusing all writes.',
      );
    await db.query('SET LOCAL search_path = public');
    await db.query("SET LOCAL lock_timeout = '5s'");
    await db.query('SELECT pg_advisory_xact_lock(783421)'); // Same bootstrap lock.
    let message;
    if (mode === 'reset') {
      const { rows: tables } = await db.query(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename",
      );
      // No CASCADE: unexpected dependencies outside this schema must fail closed.
      if (tables.length)
        await db.query(
          `TRUNCATE TABLE ${tables.map(({ tablename }) => `public.${quote(tablename)}`).join(', ')} RESTART IDENTITY`,
        );
      message =
        'Manual data cleared, migrations retained. Complete /setup again before seed. Attachment files and Mailpit messages were not deleted.';
    } else if (mode === 'seed') {
      message = await seed(db);
    } else throw new Error('Unknown manual operation.');
    await db.query('COMMIT');
    return message;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

async function main() {
  const { config, mode } = validateRequest(process.env, process.argv.slice(2));
  const { Client } = require('pg');
  const db = new Client(config);
  try {
    await db.connect();
    console.log(await prepare(db, mode));
  } finally {
    await db.end();
  }
}

if (require.main === module)
  main().catch((error) => {
    // Never print the connection URL or driver details that may contain secrets.
    console.error(
      error.code
        ? `Manual preparation failed (${error.code}); check the manual DB connection/migrations. No transaction was committed.`
        : error.message,
    );
    process.exitCode = 1;
  });
module.exports = {
  DATABASE,
  PASSWORD,
  personas,
  connectionConfig,
  validateRequest,
  prepare,
};
