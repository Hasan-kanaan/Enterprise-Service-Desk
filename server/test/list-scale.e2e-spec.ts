import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import { PrismaClient, UserRole, Prisma } from '../generated/prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { jwtConstants } from '../src/auth/auth.constants';
import request from 'supertest';

type Page = {
  items: { id: number; title?: string; username?: string; status?: string }[];
  nextCursor: string | null;
  hasMore: boolean;
};

// TEST_DATABASE_URL is enforced by jest's setup. Never seed the development DB.
// LIST_SCALE_SIZE=2000 optionally exercises larger plans, without timing assertions.
describe('Bounded lists and scoped lookups (PostgreSQL)', () => {
  const prefix = `scale-${randomUUID().slice(0, 8)}`;
  const size = Math.max(
    57,
    Math.min(5000, Number(process.env.LIST_SCALE_SIZE) || 57),
  );
  const queries: Prisma.QueryEvent[] = [];
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }),
    log: [{ emit: 'event', level: 'query' }],
  });
  let app: INestApplication<import('node:http').Server>;
  const users: Record<
    string,
    { id: number; role: UserRole; username: string }
  > = {};
  const groups: Record<string, number[]> = {};
  let teamId: number,
    otherTeamId: number,
    globalTeamId: number,
    categoryId: number;
  const jwt = new JwtService({ secret: jwtConstants.secret });
  const get = (path: string, who = 'employee') =>
    request(app.getHttpServer())
      .get(path)
      .set(
        'Authorization',
        `Bearer ${jwt.sign({ sub: users[who].id, role: users[who].role })}`,
      );
  const page = async (path: string, who = 'employee') => {
    const response = await get(path, who).expect(200);
    return response.body as Page;
  };
  const ticketPath = (
    id: number,
    purpose: string,
    selectedTeam = teamId,
    search = prefix,
  ) =>
    `/ticket-workspace/tickets/${id}/people?purpose=${purpose}&teamId=${selectedTeam}&search=${encodeURIComponent(search)}`;

  beforeAll(async () => {
    db.$on('query', (event) => {
      if (process.env.LIST_SCALE_PLANS === 'true') queries.push(event);
    });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(db)
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    for (const [name, role] of Object.entries({
      employee: 'EMPLOYEE',
      other: 'EMPLOYEE',
      manager: 'MANAGER',
      otherManager: 'MANAGER',
      agent: 'AGENT',
      collaborator: 'AGENT',
      lead: 'AGENT',
      member: 'AGENT',
      inactive: 'AGENT',
      admin: 'ADMIN',
      superAdmin: 'SUPER_ADMIN',
    } as const)) {
      users[name] = await db.user.create({
        data: {
          username: `${prefix}-${name}`,
          email: `${prefix}-${name}@test.invalid`,
          password: 'test-only',
          role,
          status: name === 'inactive' ? 'INACTIVE' : 'ACTIVE',
        },
      });
    }
    const region = await db.region.create({ data: { name: prefix } });
    const team = await db.team.create({
      data: {
        name: prefix,
        scope: 'REGION',
        regionId: region.id,
        teamLeadId: users.lead.id,
        managers: { create: { managerId: users.manager.id } },
      },
    });
    teamId = team.id;
    otherTeamId = (
      await db.team.create({
        data: {
          name: `${prefix}-other`,
          scope: 'REGION',
          regionId: region.id,
          managers: { create: { managerId: users.otherManager.id } },
        },
      })
    ).id;
    globalTeamId = (
      await db.team.create({
        data: { name: `${prefix}-global`, scope: 'GLOBAL' },
      })
    ).id;
    const agents = await db.user.createManyAndReturn({
      data: Array.from({ length: size + 60 }, (_, i) => ({
        username: `${prefix}-person-${String(i).padStart(4, '0')}`,
        email: `${prefix}-${i}@test.invalid`,
        password: 'test-only',
        role: UserRole.AGENT,
      })),
    });
    await db.teamMember.createMany({
      data: [
        ...agents,
        users.agent,
        users.lead,
        users.member,
        users.inactive,
      ].map((user) => ({ teamId, userId: user.id })),
    });
    await db.teamMember.createMany({
      data: [
        { teamId: otherTeamId, userId: users.collaborator.id },
        { teamId: globalTeamId, userId: users.collaborator.id },
      ],
    });
    categoryId = (await db.ticketCategory.create({ data: { name: prefix } }))
      .id;
    for (const kind of [
      'primary',
      'collaboration',
      'led',
      'intake',
      'forbidden',
      'finished',
    ]) {
      const rows = await db.ticket.createManyAndReturn({
        data: Array.from({ length: size }, (_, i) => ({
          title: `${prefix} ${kind} ${i % 2 ? 'needle' : 'hay'} ${i}`,
          description: 'Synthetic list fixture',
          categoryId,
          requesterId:
            kind === 'forbidden' ? users.other.id : users.employee.id,
          status:
            kind === 'intake'
              ? 'NEW'
              : kind === 'finished'
                ? 'RESOLVED'
                : 'IN_PROGRESS',
          assignedManagerId:
            kind === 'intake'
              ? null
              : kind === 'forbidden'
                ? users.otherManager.id
                : users.manager.id,
          assignedTeamId:
            kind === 'intake'
              ? null
              : kind === 'forbidden'
                ? otherTeamId
                : teamId,
          assignedAgentId: kind === 'primary' ? users.agent.id : null,
          createdAt: new Date('2026-01-01T12:00:00.000Z'),
        })),
      });
      groups[kind] = rows.map((row) => row.id).sort((a, b) => b - a);
      const cycles = await db.ticketWorkCycle.createManyAndReturn({
        data: rows.map((row) => ({
          ticketId: row.id,
          sequenceNumber: 1,
          type: 'ORIGINAL',
          startedAt: row.createdAt,
          outcome: kind === 'finished' ? 'RESOLVED' : null,
        })),
      });
      if (kind === 'collaboration')
        await db.subtask.createMany({
          data: cycles.map((cycle) => ({
            ticketId: cycle.ticketId,
            createdInCycleId: cycle.id,
            title: `${prefix} subtask`,
            description: 'No parent disclosure',
            assignedAgentId: users.collaborator.id,
            assignedTeamId: otherTeamId,
          })),
        });
    }
    await db.ticket.create({
      data: {
        title: `${prefix} literal %_\\`,
        description: 'literal search',
        requesterId: users.employee.id,
        categoryId,
      },
    });
  }, 120000);

  afterAll(async () => {
    // Cleanup is always prefix-scoped, including a partially failed setup.
    const ticketWhere = { category: { name: prefix } };
    const teamWhere = { name: { startsWith: prefix } };
    try {
      await db.subtask.deleteMany({ where: { ticket: ticketWhere } });
      await db.ticketWorkCycle.deleteMany({ where: { ticket: ticketWhere } });
      await db.ticket.deleteMany({ where: ticketWhere });
      await db.ticketCategory.deleteMany({ where: { name: prefix } });
      await db.teamMember.deleteMany({ where: { team: teamWhere } });
      await db.teamManager.deleteMany({ where: { team: teamWhere } });
      await db.team.deleteMany({ where: teamWhere });
      await db.region.deleteMany({ where: { name: prefix } });
      await db.user.deleteMany({ where: { username: { startsWith: prefix } } });
    } finally {
      await app?.close();
      await db.$disconnect();
    }
  });

  it.each([
    ['employee', '', 'primary'],
    ['manager', 'intake', 'intake'],
    ['manager', 'mine', 'primary'],
    ['agent', 'primary', 'primary'],
    ['collaborator', 'collaboration', 'collaboration'],
    ['lead', 'team', 'led'],
  ])(
    '%s %s queue traverses tied timestamps without duplicates',
    async (who, queue, group) => {
      const path = `/tickets?queue=${queue || 'mine'}&search=${prefix}%20${group}&limit=17`;
      let result = await page(path, who);
      expect(result.items).toHaveLength(17);
      expect(result.nextCursor).toEqual(expect.any(String));
      const ids = result.items.map((item) => item.id);
      while (result.hasMore) {
        result = await page(`${path}&cursor=${result.nextCursor}`, who);
        ids.push(...result.items.map((item) => item.id));
      }
      expect(result.nextCursor).toBeNull();
      expect(ids).toEqual(groups[group]);
      expect(new Set(ids).size).toBe(ids.length);
    },
  );

  it('enforces default and maximum page sizes', async () => {
    expect((await page(`/tickets?search=${prefix}`)).items).toHaveLength(25);
    expect(
      (await page(`/tickets?search=${prefix}&limit=100`)).items,
    ).toHaveLength(100);
    await get('/tickets?limit=101').expect(400);
    await get('/tickets?limit=0').expect(400);
  });

  it.each([
    'bad!',
    'e30',
    Buffer.from('[1,-1,"bad"]').toString('base64url'),
    Buffer.from('[1,1,"2026-13-01"]').toString('base64url'),
  ])('rejects malformed cursor %s', async (cursor) => {
    await get(`/tickets?cursor=${cursor}`).expect(400);
    await get(`/users?cursor=${cursor}`, 'admin').expect(400);
  });

  it('combines literal search, category, status, active state and continuation', async () => {
    const result = await page(
      `/tickets?search=${prefix}%20primary%20needle&status=IN_PROGRESS&active=true&categoryId=${categoryId}&limit=7`,
    );
    expect(result.items).toHaveLength(7);
    const next = await page(
      `/tickets?search=${prefix}%20primary%20needle&status=IN_PROGRESS&active=true&categoryId=${categoryId}&limit=7&cursor=${result.nextCursor}`,
    );
    expect(
      next.items.every(
        (item) =>
          item.title?.includes('needle') &&
          !result.items.some((old) => old.id === item.id),
      ),
    ).toBe(true);
    expect(
      (
        await page(`/tickets?search=${prefix}&active=false&limit=100`)
      ).items.map((item) => item.id),
    ).toEqual(groups.finished.slice(0, 100));
    expect(
      (await page(`/tickets?search=${encodeURIComponent('%_\\')}`)).items,
    ).toHaveLength(1);
    expect(
      (await page(`/tickets?search=%23${groups.primary[0]}`)).items[0].id,
    ).toBe(groups.primary[0]);
    expect((await page('/tickets?search=%20%20')).items).toEqual(
      (await page('/tickets')).items,
    );
    await get(`/tickets?search=${'x'.repeat(121)}`).expect(400);
    expect((await page('/tickets?search=%27%20OR%201%3D1')).items).toHaveLength(
      0,
    );
  });

  it('continues after a boundary record disappears, with no ID lookup dependency', async () => {
    const path = `/tickets?search=${prefix}%20primary&limit=7`;
    const first = await page(path);
    const boundary = first.items.at(-1)!.id;
    await db.ticketWorkCycle.deleteMany({ where: { ticketId: boundary } });
    await db.ticket.delete({ where: { id: boundary } });
    try {
      const next = await page(`${path}&cursor=${first.nextCursor}`);
      expect(next.items.map((item) => item.id)).toEqual(
        groups.primary.slice(7, 14),
      );
    } finally {
      // No recreation is needed: subsequent cases use other records.
      groups.primary = groups.primary.filter((id) => id !== boundary);
    }
  });

  it.each(['employee', 'manager', 'agent', 'lead', 'member'])(
    '%s cannot find unauthorized tickets by reference or text',
    async (who) => {
      expect(
        (await page(`/tickets?search=${prefix}%20forbidden`, who)).items,
      ).toEqual([]);
      expect(
        (await page(`/tickets?search=${groups.forbidden[0]}`, who)).items,
      ).toEqual([]);
    },
  );

  it.each(['admin', 'superAdmin'])(
    '%s directory is bounded and does not grant operational access',
    async (who) => {
      const path = `/users?search=${prefix}&role=AGENT&status=ACTIVE&limit=19`;
      let result = await page(path, who);
      expect(result.items).toHaveLength(19);
      const ids = result.items.map((item) => item.id);
      while (result.hasMore) {
        result = await page(`${path}&cursor=${result.nextCursor}`, who);
        ids.push(...result.items.map((item) => item.id));
      }
      expect(ids.length).toBe(size + 64);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).not.toContain(users.inactive.id);
      expect(
        (
          await page(
            `/users?search=${users.inactive.username}&status=INACTIVE`,
            who,
          )
        ).items.map((item) => item.id),
      ).toEqual([users.inactive.id]);
      expect(
        (await page(`/users?search=${prefix}-agent%40test.invalid`, who))
          .items[0].id,
      ).toBe(users.agent.id);
      await get('/tickets', who).expect(403);
      await get(ticketPath(groups.primary[0], 'primary'), who).expect(403);
    },
  );

  it('paginates authorized subtasks and membership display', async () => {
    const first = await page(
      `/tickets/subtasks?currentWork=true&search=${prefix}&limit=13`,
      'collaborator',
    );
    expect(first.items).toHaveLength(13);
    expect(first.items[0]).not.toHaveProperty('ticket');
    expect(
      (
        await page(
          `/tickets/subtasks?currentWork=true&search=${prefix}&cursor=${first.nextCursor}`,
          'collaborator',
        )
      ).items,
    ).toHaveLength(25);
    const members = await page(
      `/organization/teams/${teamId}/members?search=${prefix}&limit=20`,
      'admin',
    );
    expect(members.items).toHaveLength(20);
    expect(members.hasMore).toBe(true);
    const next = await page(
      `/organization/teams/${teamId}/members?search=${prefix}&limit=20&cursor=${members.nextCursor}`,
      'admin',
    );
    expect(
      next.items.every(
        (item) => !members.items.some((old) => old.id === item.id),
      ),
    ).toBe(true);
    await get(`/organization/teams/${teamId}/members`, 'manager').expect(403);
  });

  it('bounds primary lookup, excludes inactive/wrong-team users and keeps GLOBAL routing', async () => {
    const result = await get(
      ticketPath(groups.primary[0], 'primary'),
      'manager',
    ).expect(200);
    expect(result.body as unknown[]).toHaveLength(20);
    for (const person of result.body as { id: number; username: string }[])
      expect(Object.keys(person).sort()).toEqual(['id', 'username']);
    expect(
      (
        await get(
          ticketPath(
            groups.primary[0],
            'primary',
            teamId,
            users.inactive.username,
          ),
          'manager',
        )
      ).body,
    ).toEqual([]);
    expect(
      (
        await get(
          ticketPath(
            groups.primary[0],
            'primary',
            teamId,
            users.collaborator.username,
          ),
          'manager',
        )
      ).body,
    ).toEqual([]);
    await get(
      ticketPath(groups.primary[0], 'primary', otherTeamId),
      'manager',
    ).expect(403);
    expect(
      (
        await get(
          ticketPath(groups.primary[0], 'primary', globalTeamId),
          'manager',
        )
      ).body,
    ).toEqual([
      { id: users.collaborator.id, username: users.collaborator.username },
    ]);
    await get(ticketPath(groups.primary[0], 'primary'), 'otherManager').expect(
      404,
    );
    await get(ticketPath(groups.primary[0], 'primary'), 'member').expect(404);
    await get(
      ticketPath(groups.primary[0], 'primary', otherTeamId),
      'lead',
    ).expect(403);
    expect(
      (
        await get(
          ticketPath(groups.primary[0], 'primary', teamId, ''),
          'manager',
        )
      ).body,
    ).toEqual([]);
  });

  it('keeps subtask-specific routing and manager-transfer authority', async () => {
    await get(
      ticketPath(groups.primary[0], 'subtask', otherTeamId),
      'manager',
    ).expect(200);
    await get(
      ticketPath(groups.primary[0], 'subtask', otherTeamId),
      'lead',
    ).expect(403);
    await get(ticketPath(groups.primary[0], 'manager'), 'agent').expect(403);
    await get(ticketPath(groups.intake[0], 'manager'), 'manager').expect(403);
    const task = await db.subtask.findFirstOrThrow({
      where: { ticketId: groups.collaboration[0] },
    });
    await get(
      `/ticket-workspace/subtasks/${task.id}/people?purpose=subtask&teamId=${teamId}&search=${prefix}`,
      'manager',
    ).expect(200);
    await get(
      `/ticket-workspace/subtasks/${task.id}/people?purpose=subtask&teamId=${teamId}&search=${prefix}`,
      'collaborator',
    ).expect(403);
  });

  it('organization selectors preserve membership, lead and role eligibility', async () => {
    for (const purpose of ['member', 'lead', 'manager']) {
      const response = await get(
        `/organization/teams/${teamId}/people?purpose=${purpose}&search=${prefix}`,
        'admin',
      ).expect(200);
      expect((response.body as unknown[]).length).toBeLessThanOrEqual(20);
      await get(
        `/organization/teams/${teamId}/people?purpose=${purpose}&search=${prefix}`,
        'agent',
      ).expect(403);
    }
    expect(
      (
        await get(
          `/organization/teams/${otherTeamId}/people?purpose=lead&search=${users.lead.username}`,
          'admin',
        )
      ).body,
    ).toEqual([]);
    expect(
      (
        await get(
          `/organization/teams/${teamId}/people?purpose=member&search=${users.agent.username}`,
          'admin',
        )
      ).body,
    ).toEqual([]);
  });

  it('validates directory filters, blank search and lookup input limits', async () => {
    expect((await page('/users?search=%20%20', 'admin')).items).toEqual(
      (await page('/users', 'admin')).items,
    );
    await get('/users?role=ROOT', 'admin').expect(400);
    await get('/users?status=DELETED', 'admin').expect(400);
    await get('/users?limit=101', 'admin').expect(400);
    await get(`/users?search=${'x'.repeat(121)}`, 'admin').expect(400);
    await get(
      ticketPath(groups.primary[0], 'primary', teamId, 'x'.repeat(121)),
      'manager',
    ).expect(400);
    expect(
      (
        await get(
          ticketPath(groups.primary[0], 'primary', teamId, '%_'),
          'manager',
        )
      ).body,
    ).toEqual([]);
    await get('/users', 'employee').expect(403);
  });

  it('directory continuation is independent of mutable display names', async () => {
    const first = await page(
      `/users?role=AGENT&status=ACTIVE&limit=7`,
      'admin',
    );
    const boundary = first.items.at(-1)!;
    await db.user.update({
      where: { id: boundary.id },
      data: { username: `${prefix}-renamed` },
    });
    const next = await page(
      `/users?role=AGENT&status=ACTIVE&limit=7&cursor=${first.nextCursor}`,
      'admin',
    );
    expect(next.items.every((item) => item.id < boundary.id)).toBe(true);
  });

  it('optionally records plans for actual ORM-generated list SQL', async () => {
    if (process.env.LIST_SCALE_PLANS !== 'true') return;
    await db.$executeRaw`ANALYZE "Ticket"`;
    await db.$executeRaw`ANALYZE "User"`;
    await db.$executeRaw`ANALYZE "Subtask"`;
    await db.$executeRaw`ANALYZE "TicketWorkCycle"`;
    queries.length = 0;
    await page(`/tickets?queue=mine&limit=25`, 'employee');
    await page('/tickets?queue=primary&limit=25', 'agent');
    await page('/tickets?queue=intake&limit=25', 'manager');
    await page('/tickets?queue=mine&limit=25', 'manager');
    await page('/users?role=AGENT&status=ACTIVE', 'admin');
    await page('/tickets?queue=collaboration&limit=25', 'collaborator');
    await page(`/users?role=AGENT&status=ACTIVE&search=${prefix}`, 'admin');
    const captured = queries.filter(
      (event) =>
        event.query.startsWith('SELECT') &&
        (event.query.includes('"Ticket"') || event.query.includes('"User"')),
    );
    const client = new Client({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    await client.connect();
    try {
      for (const event of captured) {
        // SQL comes only from Prisma query events, values stay bound parameters.
        const result = await client.query<{ 'QUERY PLAN': string }>(
          'EXPLAIN (ANALYZE, BUFFERS) ' + event.query,
          JSON.parse(event.params) as unknown[],
        );
        console.log(result.rows.map((row) => row['QUERY PLAN']).join('\n'));
      }
    } finally {
      await client.end();
    }
  });
});
