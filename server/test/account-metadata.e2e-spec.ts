import { UsersService } from '../src/users/users.service';
import { MailProvider } from '../src/auth/mail.provider';
import { FakeMailProvider } from './fake-mail.provider';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureTestSecurity } from './security-test-app';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from './http-test';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { jwtConstants } from '../src/auth/auth.constants';
import {
  TicketStatus,
  UserRole,
  User,
  Team,
  Ticket,
} from '../generated/prisma/client';

describe('Account metadata (focused PostgreSQL and HTTP)', () => {
  let app: INestApplication<import('node:http').Server>;
  let db: PrismaService;
  let users: Record<string, User>;
  let teamA: Team, teamB: Team, teamC: Team;
  let owned: Ticket;
  let categoryId: number, regionId: number, departmentId: number;
  const sessionIds: Record<string, string> = {};
  const jwt = new JwtService({ secret: jwtConstants.secret });
  const token = (name: string) =>
    jwt.sign({
      sub: users[name].id,
      sid: sessionIds[name],
      sessionVersion: users[name].sessionVersion,
    });
  const get = <P extends string>(path: P, name: string) =>
    request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${token(name)}`);
  const patch = <P extends string>(path: P, name: string, body: object) =>
    request(app.getHttpServer())
      .patch(path)
      .set('Authorization', `Bearer ${token(name)}`)
      .send(body);
  const post = <P extends string>(path: P, name: string, body: object) =>
    request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${token(name)}`)
      .send(
        path === '/tickets' ? { clientRequestId: randomUUID(), ...body } : body,
      );

  beforeAll(async () => {
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
  });
  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    const prefix = randomUUID().slice(0, 8);
    users = {};
    const region = await db.region.create({
      data: { name: `region-${prefix}` },
    });
    const department = await db.department.create({
      data: { name: `department-${prefix}` },
    });
    regionId = region.id;
    departmentId = department.id;
    for (const [name, role] of Object.entries({
      employee: UserRole.EMPLOYEE,
      otherEmployee: UserRole.EMPLOYEE,
      manager: UserRole.MANAGER,
      otherManager: UserRole.MANAGER,
      thirdManager: UserRole.MANAGER,
      agent: UserRole.AGENT,
      otherAgent: UserRole.AGENT,
      member: UserRole.AGENT,
      lead: UserRole.AGENT,
      otherLead: UserRole.AGENT,
      admin: UserRole.ADMIN,
      superAdmin: UserRole.SUPER_ADMIN,
    })) {
      sessionIds[name] = randomUUID();
      users[name] = await db.user.create({
        data: {
          sessions: { create: { id: sessionIds[name] } },
          username: `${name}-${prefix}`,
          email: `${name}-${prefix}@test.invalid`,
          password: 'unused-test-hash',
          activatedAt: new Date(),
          role,
          regionId,
          departmentId,
        },
      });
    }
    teamA = await db.team.create({
      data: {
        name: `A-${prefix}`,
        scope: 'REGION',
        regionId,
        teamLeadId: users.lead.id,
      },
    });
    teamB = await db.team.create({
      data: {
        name: `B-${prefix}`,
        scope: 'GLOBAL',
        teamLeadId: users.otherLead.id,
      },
    });
    teamC = await db.team.create({
      data: { name: `Other-regional-${prefix}`, scope: 'REGION', regionId },
    });
    await db.teamMember.createMany({
      data: [
        ...['agent', 'member', 'lead'].map((name) => ({
          teamId: teamA.id,
          userId: users[name].id,
        })),
        ...['otherAgent', 'otherLead'].map((name) => ({
          teamId: teamB.id,
          userId: users[name].id,
        })),
      ],
    });
    // Organizational management restricts primary routing, not ticket visibility.
    await db.teamManager.createMany({
      data: [
        { teamId: teamA.id, managerId: users.manager.id },
        { teamId: teamB.id, managerId: users.otherManager.id },
        { teamId: teamC.id, managerId: users.otherManager.id },
      ],
    });
    categoryId = (
      await db.ticketCategory.create({ data: { name: `category-${prefix}` } })
    ).id;
    owned = await db.ticket.create({
      data: {
        workCycles: {
          create: {
            sequenceNumber: 1,
            type: 'ORIGINAL',
            startedAt: new Date(),
          },
        },
        title: 'Owned',
        description: 'Private parent information',
        requesterId: users.employee.id,
        categoryId,
        status: TicketStatus.IN_PROGRESS,
        assignedManagerId: users.manager.id,
        assignedTeamId: teamA.id,
        assignedAgentId: users.agent.id,
        allRegions: true,
        allDepartments: true,
      },
    });
    await db.subtask.create({
      data: {
        ticketId: owned.id,
        createdInCycleId: (
          await db.ticketWorkCycle.findFirstOrThrow({
            where: { ticketId: owned.id },
          })
        ).id,
        title: 'Delegated',
        description: 'Subtask work',
        assignedTeamId: teamB.id,
        assignedAgentId: users.otherAgent.id,
      },
    });
  });

  afterEach(async () => {
    if (!db || !users) return;
    // Delete only this test's explicit fixtures, never truncate shared data.
    const ids = Object.values(users).map((user) => user.id);
    await db.notification.deleteMany({
      where: {
        OR: [{ recipientUserId: { in: ids } }, { actorUserId: { in: ids } }],
      },
    });
    await db.ticketMessage.deleteMany({ where: { authorId: { in: ids } } });
    await db.ticketInternalNote.deleteMany({
      where: { authorId: { in: ids } },
    });
    await db.subtask.deleteMany({
      where: { ticket: { requesterId: { in: ids } } },
    });
    await db.ticket.deleteMany({ where: { requesterId: { in: ids } } });
    await db.team.deleteMany({
      where: { id: { in: [teamA.id, teamB.id, teamC.id] } },
    });
    await db.accountActionToken.deleteMany({
      where: { userId: { in: Object.values(users).map((user) => user.id) } },
    });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.ticketCategory.delete({ where: { id: categoryId } });
    await db.region.delete({ where: { id: regionId } });
    await db.department.delete({ where: { id: departmentId } });
  });

  const edit = (target: string, body: object, actor = 'admin') =>
    patch(`/users/${users[target].id}`, actor, body);
  const actor = (name = 'admin') => ({
    id: users[name].id,
    role: users[name].role,
    sessionVersion: users[name].sessionVersion,
    sid: sessionIds[name],
  });
  const current = (name = 'employee') =>
    db.user.findUniqueOrThrow({ where: { id: users[name].id } });

  it('enforces the full role matrix, including pending and inactive targets and ticket isolation', async () => {
    for (const admin of ['admin', 'superAdmin']) {
      for (const target of [
        'admin',
        'superAdmin',
        'manager',
        'agent',
        'employee',
      ]) {
        await edit(target, { phoneNumber: null }, admin).expect(
          target === 'superAdmin' || (target === 'admin' && admin === 'admin')
            ? 403
            : 200,
        );
      }
      expect(
        (await get('/tickets?queue=requests', admin).expect(200)).body.items,
      ).toEqual([]);
      await get('/ticket-options', admin).expect(200);
    }
    for (const role of ['manager', 'agent', 'employee'])
      await edit('employee', { phoneNumber: null }, role).expect(403);
    await request(app.getHttpServer())
      .patch(`/users/${users.employee.id}`)
      .send({ phoneNumber: null })
      .expect(401);
    await patch('/users/2147483647', 'admin', { phoneNumber: null }).expect(
      404,
    );
    await db.user.update({
      where: { id: users.employee.id },
      data: { status: 'INACTIVE', activatedAt: null, password: null },
    });
    await edit('employee', { phoneNumber: '+96170123456' }).expect(200);
  });

  it('rejects stale, revoked and inactive actors inside the transaction', async () => {
    const service = app.get(UsersService);
    const savedActor = actor();
    await db.user.update({
      where: { id: users.admin.id },
      data: { status: 'INACTIVE' },
    });
    await expect(
      service.updateMetadata(savedActor, users.employee.id, {
        phoneNumber: null,
      }),
    ).rejects.toMatchObject({ status: 401 });
    await db.user.update({
      where: { id: users.admin.id },
      data: { status: 'ACTIVE', sessionVersion: { increment: 1 } },
    });
    await expect(
      service.updateMetadata(savedActor, users.employee.id, {
        phoneNumber: null,
      }),
    ).rejects.toMatchObject({ status: 401 });
    await db.user.update({
      where: { id: users.admin.id },
      data: { sessionVersion: savedActor.sessionVersion },
    });
    await db.userSession.update({
      where: { id: savedActor.sid },
      data: { revokedAt: new Date() },
    });
    await expect(
      service.updateMetadata(savedActor, users.employee.id, {
        phoneNumber: null,
      }),
    ).rejects.toMatchObject({ status: 401 });
    await edit('employee', { phoneNumber: null }).expect(401);
  });

  it('validates only the four accepted fields and normalized username length', async () => {
    for (const body of [
      {},
      { username: null },
      { username: '  ab  ' },
      { username: 'a'.repeat(51) },
      { username: 123 },
      { phoneNumber: '' },
      { phoneNumber: '70123456' },
      { phoneNumber: 123 },
    ])
      await edit('employee', body).expect(400);
    for (const field of [
      'email',
      'role',
      'password',
      'status',
      'activatedAt',
      'emailVerifiedAt',
      'sessionVersion',
      'phoneVerifiedAt',
      'teamId',
    ])
      await edit('employee', { phoneNumber: null, [field]: 'invalid' }).expect(
        400,
      );
    for (const field of ['regionId', 'departmentId']) {
      for (const value of [0, -1, 1.5, '1', 2147483648])
        await edit('employee', { [field]: value }).expect(400);
      await edit('employee', { [field]: 2147483647 }).expect(404);
    }
    await edit('employee', { username: ` ${'a'.repeat(50)} ` }).expect(200);
  });

  it('normalizes username, handles uniqueness and preserves identity, sessions and tokens', async () => {
    const before = await current();
    await db.ticketWorkCycle.updateMany({
      where: { ticketId: owned.id },
      data: { startedById: before.id },
    });
    const refresh = await db.refreshToken.create({
      data: {
        userId: before.id,
        sessionId: sessionIds.employee,
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    const actionToken = await db.accountActionToken.create({
      data: {
        userId: before.id,
        type: 'PASSWORD_RESET',
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    const username = `renamed-${randomUUID().slice(0, 8)}`;
    const response = await edit('employee', {
      username: `  ${username.toUpperCase()}  `,
    }).expect(200);
    expect(response.body.username).toBe(username);
    expect(Object.keys(response.body).sort()).toEqual(
      [
        'id',
        'username',
        'displayName',
        'jobTitle',
        'email',
        'role',
        'status',
        'activatedAt',
        'phoneNumber',
        'region',
        'department',
      ].sort(),
    );
    const renamed = await current();
    await edit('employee', { username: username.toUpperCase() }).expect(200);
    expect(await current()).toEqual(renamed);
    await edit('employee', { username: users.agent.username }).expect(409);
    expect(await current()).toEqual({
      ...before,
      username,
      updatedAt: renamed.updatedAt,
    });
    expect(
      await db.refreshToken.findUnique({ where: { id: refresh.id } }),
    ).toEqual(refresh);
    expect(
      await db.accountActionToken.findUnique({ where: { id: actionToken.id } }),
    ).toEqual(actionToken);
    await get('/users/profile', 'employee').expect(200);
    const ticket = await get(`/tickets/${owned.id}/history`, 'employee').expect(
      200,
    );
    expect(JSON.stringify(ticket.body)).toContain(username);
  });

  it('normalizes phone, clears verification only on actual changes or explicit clearing, with no session side effects', async () => {
    const before = await current();
    await edit('employee', { phoneNumber: ' +961 (70) 123-456 ' }).expect(200);
    expect((await current()).phoneNumber).toBe('+96170123456');
    const verified = new Date();
    await db.user.update({
      where: { id: before.id },
      data: { phoneVerifiedAt: verified },
    });
    await edit('employee', { phoneNumber: '+961 70 123456' }).expect(200);
    expect((await current()).phoneVerifiedAt).toEqual(verified);
    await edit('employee', { phoneNumber: '+96170123457' }).expect(200);
    expect((await current()).phoneVerifiedAt).toBeNull();
    await db.user.update({
      where: { id: before.id },
      data: { phoneVerifiedAt: verified },
    });
    await edit('employee', { phoneNumber: null }).expect(200);
    const cleared = await current();
    expect(cleared).toEqual({ ...before, updatedAt: cleared.updatedAt });
    await get('/users/profile', 'employee').expect(200);
  });

  it('assigns active home organization, preserves archived references and permits explicit clearing and replacement', async () => {
    await edit('employee', { regionId: null, departmentId: null }).expect(200);
    await edit('employee', { regionId, departmentId }).expect(200);
    await db.region.update({
      where: { id: regionId },
      data: { archivedAt: new Date() },
    });
    await db.department.update({
      where: { id: departmentId },
      data: { archivedAt: new Date() },
    });
    await edit('employee', { phoneNumber: '+96170123456' }).expect(200);
    const retained = await edit('employee', { regionId, departmentId }).expect(
      200,
    );
    expect(retained.body.region?.archivedAt).toBeTruthy();
    expect(retained.body.department?.archivedAt).toBeTruthy();
    const directory = await get(
      `/users?search=${users.employee.username}`,
      'admin',
    ).expect(200);
    expect(directory.body.items[0].region?.archivedAt).toBeTruthy();
    await edit('employee', { regionId: null, departmentId: null }).expect(200);
    await edit('employee', { regionId }).expect(409);
    await edit('employee', { departmentId }).expect(409);
    await db.region.update({
      where: { id: regionId },
      data: { archivedAt: null },
    });
    await db.department.update({
      where: { id: departmentId },
      data: { archivedAt: null },
    });
    await edit('employee', { regionId, departmentId }).expect(200);
    expect((await current()).regionId).toBe(regionId);
    expect((await current()).departmentId).toBe(departmentId);
    const replacementRegion = await db.region.create({
      data: { name: randomUUID() },
    });
    const replacementDepartment = await db.department.create({
      data: { name: randomUUID() },
    });
    try {
      await db.region.update({
        where: { id: regionId },
        data: { archivedAt: new Date() },
      });
      await db.department.update({
        where: { id: departmentId },
        data: { archivedAt: new Date() },
      });
      await edit('employee', {
        regionId: replacementRegion.id,
        departmentId: replacementDepartment.id,
      }).expect(200);
      expect((await current()).regionId).toBe(replacementRegion.id);
      expect((await current()).departmentId).toBe(replacementDepartment.id);
      const before = await current();
      await edit('employee', { username: 'must-not-save', regionId }).expect(
        409,
      );
      expect(await current()).toEqual(before);
    } finally {
      await db.region.delete({ where: { id: replacementRegion.id } });
      await db.department.delete({ where: { id: replacementDepartment.id } });
    }
  });

  it('does not mutate operational work, memberships, responsibility, specialties, notifications or historical evidence', async () => {
    const specialty = await db.specialty.create({
      data: { name: randomUUID() },
    });
    await db.userSpecialty.create({
      data: { userId: users.agent.id, specialtyId: specialty.id },
    });
    await db.teamSpecialty.create({
      data: { teamId: teamA.id, specialtyId: specialty.id },
    });
    await db.ticketWorkCycle.updateMany({
      where: { ticketId: owned.id },
      data: {
        endedAt: new Date(),
        outcome: 'RESOLVED',
        endingAgentId: users.agent.id,
        endingManagerId: users.manager.id,
        endingTeamId: teamA.id,
      },
    });
    await db.ticketWorkCycle.create({
      data: {
        ticketId: owned.id,
        sequenceNumber: 2,
        type: 'REOPENED',
        startedAt: new Date(),
      },
    });
    await db.subtask.updateMany({
      where: { ticketId: owned.id },
      data: { status: 'COMPLETED', completedById: users.otherAgent.id },
    });
    const snapshot = async () => ({
      ticket: await db.ticket.findUnique({ where: { id: owned.id } }),
      cycles: await db.ticketWorkCycle.findMany({
        where: { ticketId: owned.id },
      }),
      subtasks: await db.subtask.findMany({ where: { ticketId: owned.id } }),
      teams: await db.team.findMany({
        where: { id: { in: [teamA.id, teamB.id, teamC.id] } },
        include: { members: true, managers: true, specialties: true },
      }),
      specialties: await db.userSpecialty.findMany({
        where: { userId: { in: Object.values(users).map((u) => u.id) } },
      }),
      notifications: await db.notification.findMany({
        where: { ticketId: owned.id },
      }),
    });
    try {
      const before = await snapshot();
      for (const name of ['employee', 'manager', 'agent', 'lead', 'otherAgent'])
        await edit(name, {
          username: `new-${users[name].username}`,
          regionId: null,
          departmentId: null,
          phoneNumber: '+96170123456',
        }).expect(200);
      expect(await snapshot()).toEqual(before);
      const history = await get(
        `/tickets/${owned.id}/history`,
        'manager',
      ).expect(200);
      expect(JSON.stringify(history.body)).toContain(
        `new-${users.agent.username}`,
      );
    } finally {
      await db.specialty.delete({ where: { id: specialty.id } });
    }
  });

  it.each(['region', 'department'] as const)(
    'serializes %s assignment against archival, rejecting stale new use',
    async (kind) => {
      // The archival path and metadata path share the destination row lock.
      const data = { name: `destination-${randomUUID()}` };
      const destination =
        kind === 'region'
          ? await db.region.create({ data })
          : await db.department.create({ data });
      const field = kind === 'region' ? 'regionId' : 'departmentId';
      const catalog = kind === 'region' ? 'regions' : 'departments';
      try {
        const results = await Promise.all([
          edit('employee', { [field]: destination.id }),
          post(
            `/organization/${catalog}/${destination.id}/archive`,
            'superAdmin',
            {},
          ),
        ]);
        expect([200, 409]).toContain(results[0].status);
        expect([201, 409]).toContain(results[1].status);
        expect(results.some((r) => r.status < 300)).toBe(true);
        if (results[1].status === 409)
          await post(
            `/organization/${catalog}/${destination.id}/archive`,
            'superAdmin',
            {},
          ).expect(201);
        // A committed earlier assignment may retain the newly archived record.
        if (results[0].status === 200)
          expect((await current())[field]).toBe(destination.id);
        await edit('otherEmployee', { [field]: destination.id }).expect(409);
        await edit('employee', { [field]: null }).expect(200);
      } finally {
        if (kind === 'region')
          await db.region.delete({ where: { id: destination.id } });
        else await db.department.delete({ where: { id: destination.id } });
      }
    },
  );
});
