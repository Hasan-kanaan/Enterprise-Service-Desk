import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MailProvider } from '../src/auth/mail.provider';
import { FakeMailProvider } from './fake-mail.provider';
import { configureTestSecurity } from './security-test-app';
import request from './http-test';
import { jwtConstants } from '../src/auth/auth.constants';
import { AnalyticsService } from '../src/analytics/analytics.service';
import { AnalyticsResponse } from '../src/analytics/analytics.dto';
import { analyticsSql } from '../src/analytics/analytics.query';
import { Prisma, TicketStatus, UserRole } from '../generated/prisma/client';

describe('Manager operational analytics (PostgreSQL / HTTP)', () => {
  let app: NestExpressApplication;
  let db: PrismaService;
  let service: AnalyticsService;
  let baseline: AnalyticsResponse;
  let data: AnalyticsResponse;
  const prefix = `analytics-${randomUUID()}`;
  const now = new Date('2040-06-15T12:00:00Z');
  const ago = (days: number) => new Date(now.getTime() - days * 86400000);
  const tokens: Record<string, string> = {};
  const users: Record<string, number> = {};
  let category: number,
    tag: number,
    region: number,
    department: number,
    team: number,
    specialty: number;
  const ids: number[] = [];
  // Exact recursive allowlist: extra fields fail even if they are not displayed
  // by React or do not match a known sensitive-field spelling.
  const exactKeys = (value: unknown, keys: string[]) => {
    expect(value).not.toBeNull();
    expect(typeof value).toBe('object');
    expect(Object.keys(value as object).sort()).toEqual([...keys].sort());
  };
  const assertPrivateContract = (body: AnalyticsResponse) => {
    exactKeys(body, [
      'range',
      'current',
      'period',
      'resolution',
      'trend',
      'aging',
      'groups',
      'teams',
      'expertise',
    ]);
    exactKeys(body.range, ['days', 'from', 'to', 'timezone']);
    exactKeys(body.current, [
      'open',
      'awaitingTeam',
      'awaitingAgent',
      'statuses',
    ]);
    for (const row of body.current.statuses)
      exactKeys(row, ['status', 'count']);
    exactKeys(body.period, [
      'created',
      'resolved',
      'closed',
      'reopenedTickets',
      'reopenEvents',
    ]);
    exactKeys(body.resolution, ['eligibleCycles', 'medianHours', 'p90Hours']);
    for (const row of body.trend)
      exactKeys(row, ['date', 'created', 'resolved', 'closed']);
    for (const row of body.aging) exactKeys(row, ['bucket', 'count']);
    exactKeys(body.groups, [
      'categories',
      'tags',
      'regions',
      'departments',
      'combinations',
    ]);
    for (const section of Object.values(body.groups)) {
      exactKeys(section, ['rows', 'totalGroups']);
      expect(section.rows.length).toBeLessThanOrEqual(50);
      for (const row of section.rows)
        exactKeys(row, ['name', 'archived', 'created', 'open', 'reopened']);
    }
    exactKeys(body.teams, ['rows', 'totalGroups']);
    for (const row of body.teams.rows)
      exactKeys(row, [
        'name',
        'scope',
        'region',
        'open',
        'awaitingAgent',
        'eligibleAgents',
        'ticketsPerAgent',
      ]);
    exactKeys(body.expertise, ['rows', 'totalGroups']);
    for (const row of body.expertise.rows)
      exactKeys(row, [
        'name',
        'teams',
        'eligibleAgents',
        'open',
        'blocked',
        'awaitingAgent',
      ]);
    const visit = (value: unknown) => {
      if (Array.isArray(value)) {
        for (const item of value) visit(item);
        return;
      }
      if (value && typeof value === 'object')
        for (const [key, item] of Object.entries(value)) {
          expect(key).not.toMatch(
            /^(id|.*Id|.*Ids|displayName|email|phone|phoneNumber|jobTitle|activatedAt|emailVerifiedAt|session.*|password.*|role|members|agents|users|manager|teamLead|requester|homeRegion|homeDepartment|userSpecialties|title|description|message.*|content|internalNotes?|attachments?|filename|fileName|storageKey|objectKey|bucket|resolutionSummary|startReason)$/i,
          );
          // 'bucket' is allowed only as the explicit aging label, checked above.
          visit(item);
        }
    };
    // Check aging separately because its non-storage bucket labels are public.
    const { aging, ...otherSections } = body;
    visit(otherSections);
    expect(aging.map((row) => row.bucket)).toEqual([
      'Under 1 day',
      '1–3 days',
      '3–7 days',
      '7–14 days',
      '14+ days',
    ]);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('PRIVATE');
    for (const role of Object.keys(users)) {
      expect(serialized).not.toContain(`${prefix}-${role}`);
      expect(serialized).not.toContain(tokens[role]);
    }
  };
  const get = (path: string, role = 'MANAGER') =>
    request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${tokens[role]}`);

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
    service = app.get(AnalyticsService);
    baseline = await service.overview({ days: '7' }, now);
    for (const role of [
      ...Object.values(UserRole),
      'other',
      'inactive',
      'pending',
    ]) {
      const sid = randomUUID();
      const u = await db.user.create({
        data: {
          displayName: `${prefix}-${role}`,
          email: `${prefix}-${role}@test.invalid`,
          role:
            role === 'other'
              ? 'MANAGER'
              : ['inactive', 'pending'].includes(role)
                ? 'AGENT'
                : (role as UserRole),
          status: role === 'inactive' ? 'INACTIVE' : 'ACTIVE',
          activatedAt: role === 'pending' ? null : new Date(),
          sessions: { create: { id: sid } },
        },
      });
      users[role] = u.id;
      tokens[role] = new JwtService({ secret: jwtConstants.secret }).sign({
        sub: u.id,
        sid,
        sessionVersion: 0,
      });
    }
    category = (
      await db.ticketCategory.create({
        data: { name: prefix, archivedAt: new Date() },
      })
    ).id;
    tag = (await db.ticketTag.create({ data: { name: prefix } })).id;
    region = (await db.region.create({ data: { name: prefix } })).id;
    department = (await db.department.create({ data: { name: prefix } })).id;
    specialty = (await db.specialty.create({ data: { name: prefix } })).id;
    team = (
      await db.team.create({
        data: {
          name: prefix,
          scope: 'REGION',
          regionId: region,
          managers: { create: { managerId: users.MANAGER } },
          members: {
            create: ['AGENT', 'inactive', 'pending', 'EMPLOYEE'].map(
              (role) => ({ userId: users[role] }),
            ),
          },
          specialties: { create: { specialtyId: specialty } },
        },
      })
    ).id;
    await db.userSpecialty.createMany({
      data: ['AGENT', 'inactive', 'pending'].map((role) => ({
        userId: users[role],
        specialtyId: specialty,
      })),
    });
    const statuses: TicketStatus[] = [
      'NEW',
      'ASSIGNED',
      'IN_PROGRESS',
      'WAITING_FOR_EMPLOYEE',
      'BLOCKED',
      'RESOLVED',
      'CLOSED',
      'CANCELLED',
      'CANCELLED',
      'CANCELLED',
    ];
    const ages = [0.5, 1, 3, 7, 14, 2, 4, 7, 0, 7.00001];
    for (let i = 0; i < statuses.length; i++) {
      const t = await db.ticket.create({
        data: {
          title: `${prefix}-PRIVATE-${i}`,
          description: 'PRIVATE DESCRIPTION',
          requesterId: users.EMPLOYEE,
          categoryId: category,
          status: statuses[i],
          createdAt: ago(ages[i]),
          allRegions: i % 2 === 0,
          allDepartments: i % 2 === 0,
          assignedManagerId: i === 0 ? null : users.other,
          assignedTeamId: i === 0 ? null : team,
          assignedAgentId: i === 2 ? users.AGENT : null,
          affectedRegions: i % 2 ? { create: { regionId: region } } : undefined,
          affectedDepartments:
            i % 2 ? { create: { departmentId: department } } : undefined,
          tags: { create: { tagId: tag } },
          workCycles: {
            create: {
              sequenceNumber: 1,
              type: 'ORIGINAL',
              startedAt: ago(ages[i]),
            },
          },
        },
      });
      ids.push(t.id);
    }
    // Reopen events survive later reopenings; current Ticket timestamps do not.
    await db.ticketWorkCycle.update({
      where: {
        ticketId_sequenceNumber: { ticketId: ids[2], sequenceNumber: 1 },
      },
      data: {
        startedAt: ago(6),
        endedAt: ago(5),
        closedAt: ago(4.5),
        outcome: 'CLOSED',
      },
    });
    await db.ticketWorkCycle.createMany({
      data: [
        {
          ticketId: ids[2],
          sequenceNumber: 2,
          type: 'REOPENED',
          startedAt: ago(4),
          endedAt: ago(2),
          outcome: 'RESOLVED',
        },
        {
          ticketId: ids[2],
          sequenceNumber: 3,
          type: 'REOPENED',
          startedAt: ago(1),
        },
      ],
    });
    await db.ticketWorkCycle.update({
      where: {
        ticketId_sequenceNumber: { ticketId: ids[5], sequenceNumber: 1 },
      },
      data: { startedAt: ago(2), endedAt: ago(1.5), outcome: 'RESOLVED' },
    });
    // Migrated closed row without resolution timestamp: count closure, never guess duration.
    await db.ticketWorkCycle.update({
      where: {
        ticketId_sequenceNumber: { ticketId: ids[6], sequenceNumber: 1 },
      },
      data: {
        outcome: 'CLOSED',
        closedAt: ago(1),
        ownershipSnapshotBasis: 'RECORDED_AT_MIGRATION',
      },
    });
    data = await service.overview({ days: '7' }, now);
  }, 60000);

  afterAll(async () => {
    if (db) {
      await db.ticketWorkCycle.deleteMany({
        where: { ticket: { category: { name: { startsWith: prefix } } } },
      });
      await db.ticket.deleteMany({
        where: { category: { name: { startsWith: prefix } } },
      });
      await db.team.deleteMany({ where: { name: { startsWith: prefix } } });
      await db.user.deleteMany({ where: { email: { startsWith: prefix } } });
      await db.specialty.deleteMany({
        where: { name: { startsWith: prefix } },
      });
      await db.ticketCategory.deleteMany({
        where: { name: { startsWith: prefix } },
      });
      await db.ticketTag.deleteMany({
        where: { name: { startsWith: prefix } },
      });
      await db.region.deleteMany({ where: { name: { startsWith: prefix } } });
      await db.department.deleteMany({
        where: { name: { startsWith: prefix } },
      });
    }
    await app?.close();
  });

  it('allows Manager aggregates and excludes every private projection', async () => {
    const realService = new AnalyticsService(db);
    jest
      .spyOn(service, 'overview')
      .mockImplementationOnce((query) => realService.overview(query, now));
    const response = await get('/analytics?days=7').expect(200);
    // Inspect bytes serialized by Nest, not the service return type alone.
    const body = JSON.parse(response.text) as AnalyticsResponse;
    assertPrivateContract(body);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(body.current.open).toBe(baseline.current.open + 5);
    expect(body.teams.rows.find((row) => row.name === prefix)).toMatchObject({
      eligibleAgents: 1,
      open: 4,
    });
    expect(
      body.expertise.rows.find((row) => row.name === prefix),
    ).toMatchObject({ eligibleAgents: 1, teams: 1 });
  });
  it.each(['EMPLOYEE', 'AGENT', 'ADMIN', 'SUPER_ADMIN'])(
    'denies %s',
    async (role) => {
      const response = await get('/analytics', role).expect(403);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(Object.keys(JSON.parse(response.text) as object).sort()).toEqual([
        'error',
        'message',
        'statusCode',
      ]);
    },
  );
  it('denies unauthenticated requests and arbitrary detail/filter parameters', async () => {
    await request(app.getHttpServer()).get('/analytics').expect(401);
    await get('/analytics?days=365').expect(400);
    await get(`/analytics?ticketId=${ids[2]}`).expect(400);
    await get('/analytics?days=7&days=90').expect(400);
  });
  it.each(['7', '30', '90'])(
    'accepts only the approved %s-day HTTP range',
    async (days) => {
      const response = await get(`/analytics?days=${days}`).expect(200);
      const body = JSON.parse(response.text) as AnalyticsResponse;
      expect(body.range.days).toBe(Number(days));
      assertPrivateContract(body);
    },
  );
  it.each([
    'days=hello',
    'days=7%20OR%201%3D1',
    'days=-7',
    'days=999999999999999999',
    'days=7.5',
    'days=7.0',
    'days=',
    'days=07',
    'days[]=7',
    'days[0]=7',
    'days=%5B7%5D',
    'days=7&days=7',
    'days=7&days=90',
    'days=30&userId=1',
    'days=30&groupBy=agentId',
    'days=30&include=members',
  ])('rejects malformed or discovery parameters: %s', async (query) => {
    const response = await get(`/analytics?${query}`).expect(400);
    expect(response.text).not.toContain('SELECT');
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('does not grant account, Team-member or individual Specialty directory access', async () => {
    for (const path of [
      '/users',
      '/organization/teams',
      `/organization/teams/${team}/members`,
      `/organization/teams/${team}/people?purpose=member`,
      `/organization/agents/${users.AGENT}/specialties`,
    ]) {
      await get(path).expect(403);
    }
  });
  it('rechecks the database role and account state rather than trusting an earlier Manager response', async () => {
    try {
      await get('/analytics').expect(200);
      await db.user.update({
        where: { id: users.MANAGER },
        data: { role: 'AGENT' },
      });
      await get('/analytics').expect(403);
      await db.user.update({
        where: { id: users.MANAGER },
        data: { role: 'MANAGER', status: 'INACTIVE' },
      });
      await get('/analytics').expect(401);
    } finally {
      await db.user.update({
        where: { id: users.MANAGER },
        data: { role: 'MANAGER', status: 'ACTIVE' },
      });
    }
    await request(app.getHttpServer())
      .get('/analytics')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);
  });
  it('retains existing backend detail/list authority even for managed Team tickets', async () => {
    await get(`/tickets/${ids[0]}`).expect(200); // shared intake
    await get(`/tickets/${ids[2]}`).expect(404); // managed Team grants no visibility
    await get(`/tickets/${ids[2]}`, 'other').expect(200);
    const result = await get(`/tickets?search=${prefix}`).expect(200);
    expect(JSON.stringify(result.body)).not.toContain(`${prefix}-PRIVATE-2`);
    await get(`/tickets/${ids[2]}/history`).expect(404);
  });
  it('counts exact statuses and creation range boundaries [from,to)', () => {
    expect(data.current.open - baseline.current.open).toBe(5);
    expect(data.current.awaitingTeam - baseline.current.awaitingTeam).toBe(1);
    expect(data.current.awaitingAgent - baseline.current.awaitingAgent).toBe(3);
    for (const row of data.current.statuses)
      expect(
        row.count -
          baseline.current.statuses.find((s) => s.status === row.status)!.count,
      ).toBe(1);
    expect(data.period).toEqual({
      created: 7,
      resolved: 3,
      closed: 2,
      reopenedTickets: 1,
      reopenEvents: 2,
    });
    expect(data.trend.reduce((sum, row) => sum + row.created, 0)).toBe(7);
    expect(data.trend.reduce((sum, row) => sum + row.resolved, 0)).toBe(3);
    expect(data.trend.reduce((sum, row) => sum + row.closed, 0)).toBe(2);
    expect(data.trend).toHaveLength(8);
  });
  it('counts catalog, tag, all-scope and explicit-scope groups without inventing home scopes', () => {
    for (const kind of ['categories', 'tags', 'combinations'] as const) {
      expect(
        data.groups[kind].rows.find((r) => r.name.includes(prefix)),
      ).toEqual({
        name: kind === 'combinations' ? `${prefix} + ${prefix}` : prefix,
        archived: kind !== 'tags',
        created: 7,
        open: 5,
        reopened: 1,
      });
    }
    for (const kind of ['regions', 'departments'] as const) {
      expect(data.groups[kind].rows.find((r) => r.name === prefix)).toEqual({
        name: prefix,
        archived: false,
        created: 4,
        open: 2,
        reopened: 0,
      });
      const label = kind === 'regions' ? 'All regions' : 'All departments';
      const current = data.groups[kind].rows.find((r) => r.name === label)!;
      const previous = baseline.groups[kind].rows.find((r) => r.name === label);
      expect(current.created - (previous?.created ?? 0)).toBe(3);
      expect(current.open - (previous?.open ?? 0)).toBe(3);
      expect(current.reopened - (previous?.reopened ?? 0)).toBe(1);
    }
  });
  it('uses exact aging boundaries and truthful cycle percentiles', () => {
    expect(data.aging.map((r, i) => r.count - baseline.aging[i].count)).toEqual(
      [1, 1, 1, 1, 1],
    );
    expect(data.resolution).toEqual({
      eligibleCycles: 3,
      medianHours: 24,
      p90Hours: 43.2,
    });
  });
  it('expands only period activity for 30/90 days and preserves current backlog', async () => {
    for (const days of ['30', '90']) {
      const wider = await service.overview({ days }, now);
      expect(wider.period).toEqual({ ...data.period, created: 9 });
      expect(wider.current).toEqual(data.current);
      expect(wider.aging).toEqual(data.aging);
      expect(wider.trend).toHaveLength(Number(days) + 1);
    }
  });
  it('counts all-scope tickets once even if retained explicit links exist', async () => {
    try {
      await db.ticketRegion.create({
        data: { ticketId: ids[0], regionId: region },
      });
      await db.ticketDepartment.create({
        data: { ticketId: ids[0], departmentId: department },
      });
      const retained = await service.overview({ days: '7' }, now);
      expect(retained.groups.regions).toEqual(data.groups.regions);
      expect(retained.groups.departments).toEqual(data.groups.departments);
    } finally {
      await db.ticketRegion.deleteMany({ where: { ticketId: ids[0] } });
      await db.ticketDepartment.deleteMany({ where: { ticketId: ids[0] } });
    }
  });
  it('counts only active activated Agent members and actual matching Specialties', () => {
    expect(data.teams.rows.find((r) => r.name === prefix)).toEqual({
      name: prefix,
      scope: 'REGION',
      region: prefix,
      open: 4,
      awaitingAgent: 3,
      eligibleAgents: 1,
      ticketsPerAgent: 4,
    });
    expect(data.expertise.rows.find((r) => r.name === prefix)).toEqual({
      name: prefix,
      teams: 1,
      eligibleAgents: 1,
      open: 4,
      blocked: 1,
      awaitingAgent: 3,
    });
  });
  it('returns null duration for an empty period, never fake percentages', async () => {
    const empty = await service.overview(
      { days: '7' },
      new Date('2000-01-01T00:00:00Z'),
    );
    expect(empty.period).toEqual({
      created: 0,
      resolved: 0,
      closed: 0,
      reopenedTickets: 0,
      reopenEvents: 0,
    });
    expect(empty.resolution).toEqual({
      eligibleCycles: 0,
      medianHours: null,
      p90Hours: null,
    });
    expect(empty.groups.tags.rows).toEqual([]);
  });
  it('uses lifecycle timestamp boundaries and excludes invalid durations', async () => {
    const where = {
      ticketId_sequenceNumber: { ticketId: ids[6], sequenceNumber: 1 },
    };
    try {
      await db.ticketWorkCycle.update({
        where,
        data: { endedAt: ago(7), closedAt: now },
      });
      const boundary = await service.overview({ days: '7' }, now);
      expect(boundary.period.resolved).toBe(4); // lower boundary included
      expect(boundary.period.closed).toBe(1); // upper boundary excluded
      expect(boundary.resolution).toEqual(data.resolution); // end before start excluded
      await db.ticketWorkCycle.update({
        where,
        data: { endedAt: now, closedAt: ago(7) },
      });
      const upper = await service.overview({ days: '7' }, now);
      expect(upper.period.resolved).toBe(3);
      expect(upper.period.closed).toBe(2);
    } finally {
      await db.ticketWorkCycle.update({
        where,
        data: { endedAt: null, closedAt: ago(1) },
      });
    }
  });
  it('reports missing specialist coverage and zero-capacity ratios truthfully', async () => {
    try {
      await db.user.update({
        where: { id: users.AGENT },
        data: { status: 'INACTIVE' },
      });
      const uncovered = await service.overview({ days: '7' }, now);
      expect(uncovered.teams.rows.find((r) => r.name === prefix)).toMatchObject(
        { eligibleAgents: 0, ticketsPerAgent: null, open: 4 },
      );
      expect(
        uncovered.expertise.rows.find((r) => r.name === prefix),
      ).toMatchObject({ eligibleAgents: 0, open: 4, blocked: 1 });
    } finally {
      await db.user.update({
        where: { id: users.AGENT },
        data: { status: 'ACTIVE' },
      });
    }
  });
  (process.env.ANALYTICS_BROWSER_REVIEW === '1' ? it : it.skip)(
    'inspects real serialized aggregates in the browser network flow',
    async () => {
      await app.listen(0, '127.0.0.1');
      const realService = new AnalyticsService(db);
      const spy = jest
        .spyOn(service, 'overview')
        .mockImplementation((query) => realService.overview(query, now));
      try {
        const browser = spawn(
          process.execPath,
          ['test/operations-flow.mjs', '--analytics'],
          {
            cwd: resolve(__dirname, '../../client'),
            windowsHide: true,
            env: {
              ...process.env,
              ANALYTICS_REVIEW_URL: await app.getUrl(),
              ANALYTICS_REVIEW_TOKEN: tokens.MANAGER,
            },
            stdio: ['ignore', 'pipe', 'pipe'],
          },
        );
        let output = '';
        browser.stdout.on('data', (chunk: Buffer) => {
          output += chunk.toString();
        });
        browser.stderr.resume();
        const timer = setTimeout(() => browser.kill(), 45000);
        const code = await new Promise<number | null>((accept, reject) => {
          browser.once('error', reject);
          browser.once('exit', accept);
        }).finally(() => clearTimeout(timer));
        // Keep aggregate payloads and test credentials out of logs, including failures.
        if (code !== 0)
          throw new Error(
            `Analytics browser review exited ${code}; output omitted to preserve payload privacy`,
          );
        expect(output).toContain('PASS: real analytics network payload');
        console.log(
          output
            .split('\n')
            .filter((line) => line.startsWith('PASS:'))
            .join('\n'),
        );
      } finally {
        spy.mockRestore();
      }
    },
    60000,
  );
  (process.env.ANALYTICS_SCALE === '1' ? it : it.skip)(
    'bounds the response and measures representative larger SQL work',
    async () => {
      await db.ticket.createMany({
        data: Array.from({ length: 12000 }, (_, i) => ({
          title: `${prefix}-scale`,
          description: 'Excluded',
          requesterId: users.EMPLOYEE,
          categoryId: category,
          status: i % 3 === 0 ? 'IN_PROGRESS' : 'CLOSED',
          assignedTeamId: team,
          assignedManagerId: users.other,
          createdAt: ago(i % 2 === 0 ? 2 : 400),
        })),
      });
      await db.$executeRaw`
      INSERT INTO "TicketWorkCycle" ("ticketId", "sequenceNumber", type, "startedAt", outcome, "endedAt", "closedAt")
      SELECT id, 1, 'ORIGINAL', "createdAt", CASE WHEN status = 'CLOSED' THEN 'CLOSED'::"TicketWorkCycleOutcome" ELSE NULL END,
        CASE WHEN status = 'CLOSED' THEN "createdAt" + interval '1 day' ELSE NULL END,
        CASE WHEN status = 'CLOSED' THEN "createdAt" + interval '1 day' ELSE NULL END
      FROM "Ticket" WHERE title = ${`${prefix}-scale`} AND "categoryId" = ${category}`;
      await db.$executeRaw`
      INSERT INTO "TicketTagOnTicket" ("ticketId", "tagId", "createdAt")
      SELECT id, ${tag}, "createdAt" FROM "Ticket" WHERE title = ${`${prefix}-scale`} AND "categoryId" = ${category}`;
      // More than the response cap in every catalog, including multi-scope joins.
      for (let i = 0; i < 60; i++) {
        const name = `${prefix}-${i}`;
        const c = await db.ticketCategory.create({ data: { name } });
        const g = await db.ticketTag.create({ data: { name } });
        const r = await db.region.create({ data: { name } });
        const d = await db.department.create({ data: { name } });
        const s = await db.specialty.create({ data: { name } });
        const t = await db.team.create({
          data: {
            name,
            scope: 'GLOBAL',
            specialties: { create: { specialtyId: s.id } },
          },
        });
        await db.ticket.create({
          data: {
            title: `${prefix}-catalog-scale`,
            description: 'Excluded',
            requesterId: users.EMPLOYEE,
            categoryId: c.id,
            status: 'BLOCKED',
            assignedTeamId: t.id,
            assignedManagerId: users.other,
            createdAt: ago(2),
            tags: { create: [{ tagId: g.id }, { tagId: tag }] },
            affectedRegions: {
              create: [{ regionId: r.id }, { regionId: region }],
            },
            affectedDepartments: {
              create: [{ departmentId: d.id }, { departmentId: department }],
            },
            workCycles: {
              create: {
                sequenceNumber: 1,
                type: 'ORIGINAL',
                startedAt: ago(2),
              },
            },
          },
        });
      }
      for (const table of [
        'Ticket',
        'TicketWorkCycle',
        'TicketTagOnTicket',
        'TicketCategory',
        'TicketTag',
        'TicketRegion',
        'TicketDepartment',
        'Region',
        'Department',
        'Team',
        'Specialty',
        'TeamSpecialty',
        'UserSpecialty',
        'TeamMember',
        'User',
      ]) {
        // Identifiers come exclusively from this fixed list, never request data.
        await db.$executeRaw(Prisma.sql`ANALYZE ${Prisma.raw(`"${table}"`)}`);
      }
      const sql = analyticsSql(ago(7), now);
      const plan = await db.$queryRaw(
        Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`,
      );
      console.log('ANALYTICS_PLAN', JSON.stringify(plan));
      const scale = await service.overview({ days: '7' }, now);
      expect(scale.period.created).toBe(data.period.created + 6060);
      expect(scale.current.open).toBe(data.current.open + 4060);
      expect(scale.period.resolved).toBe(data.period.resolved + 4000);
      expect(scale.period.closed).toBe(data.period.closed + 4000);
      expect(scale.trend).toHaveLength(8);
      for (const section of [
        ...Object.values(scale.groups),
        scale.teams,
        scale.expertise,
      ]) {
        expect(section.rows).toHaveLength(50);
        expect(section.totalGroups).toBeGreaterThan(50);
      }
      expect(
        scale.groups.tags.rows.find((r) => r.name === prefix),
      ).toMatchObject({ created: 6067, open: 4065, reopened: 1 });
      expect(
        scale.groups.regions.rows.find((r) => r.name === prefix),
      ).toMatchObject({ created: 64, open: 62, reopened: 0 });
      expect(
        scale.groups.departments.rows.find((r) => r.name === prefix),
      ).toMatchObject({ created: 64, open: 62, reopened: 0 });
      expect(JSON.stringify(scale).length).toBeLessThan(150000);
    },
    60000,
  );
});
