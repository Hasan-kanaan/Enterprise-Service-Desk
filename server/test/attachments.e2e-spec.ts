import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AttachmentStorage } from '../src/tickets/attachment-storage';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { jwtConstants } from '../src/auth/auth.constants';
import { User, UserRole } from '../generated/prisma/client';

describe('Attachments and author soft deletion (PostgreSQL and HTTP)', () => {
  let app: INestApplication, db: PrismaService;
  let storageDir: string;
  const previousStorage = process.env.ATTACHMENT_STORAGE_DIR;
  let users: Record<string, User>;
  let ticketId: number, subtaskId: number, teamId: number, otherTeamId: number;
  let cycleId: number, oldCycleId: number, categoryId: number;
  const jwt = new JwtService({ secret: jwtConstants.secret });
  const token = (name: string) =>
    jwt.sign({ sub: users[name].id, role: users[name].role });
  const get = (path: string, who: string) =>
    request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${token(who)}`);
  const patch = (path: string, who: string, body = {}) =>
    request(app.getHttpServer())
      .patch(path)
      .set('Authorization', `Bearer ${token(who)}`)
      .send(body);
  const post = (path: string, who: string, body: object) =>
    request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${token(who)}`)
      .send(body);
  const rows = () =>
    db.notification.findMany({ where: { ticketId }, orderBy: { id: 'asc' } });
  const message = (who = 'employee', key = randomUUID(), kind = 'messages') =>
    post(`/tickets/${ticketId}/${kind}`, who, {
      content: 'Sensitive content must not appear in notifications',
      expectedCycleId: cycleId,
      clientRequestId: key,
    });
  const assign = (name: string | null) =>
    patch(`/tickets/${ticketId}/assignment`, 'manager', {
      agentId: name ? users[name].id : null,
    });
  const status = (value: string) =>
    patch(`/tickets/${ticketId}/status`, 'manager', { status: value });
  const reopen = (who: string) =>
    post(`/tickets/${ticketId}/reopen`, who, {
      reason: 'Private reopening reason',
    });

  beforeAll(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'eds-attachments-test-'));
    process.env.ATTACHMENT_STORAGE_DIR = storageDir;
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    db = app.get(PrismaService);
  });
  afterAll(async () => {
    await app?.close();
    await rm(storageDir, { recursive: true, force: true });
    if (previousStorage === undefined)
      delete process.env.ATTACHMENT_STORAGE_DIR;
    else process.env.ATTACHMENT_STORAGE_DIR = previousStorage;
  });
  beforeEach(async () => {
    users = {};
    const prefix = randomUUID();
    for (const [name, role] of Object.entries({
      employee: 'EMPLOYEE',
      outsider: 'EMPLOYEE',
      manager: 'MANAGER',
      nextManager: 'MANAGER',
      agent: 'AGENT',
      second: 'AGENT',
      lead: 'AGENT',
      collaborator: 'AGENT',
      historical: 'AGENT',
      inactive: 'AGENT',
      admin: 'ADMIN',
      superAdmin: 'SUPER_ADMIN',
    })) {
      users[name] = await db.user.create({
        data: {
          username: `${name}-${prefix}`.slice(0, 50),
          email: `${name}-${prefix}@test.invalid`,
          password: 'unused',
          role: role as UserRole,
          status: name === 'inactive' ? 'INACTIVE' : 'ACTIVE',
        },
      });
    }
    teamId = (
      await db.team.create({
        data: {
          name: `primary-${prefix}`,
          scope: 'GLOBAL',
          teamLeadId: users.lead.id,
        },
      })
    ).id;
    otherTeamId = (
      await db.team.create({
        data: { name: `other-${prefix}`, scope: 'GLOBAL' },
      })
    ).id;
    await db.teamMember.createMany({
      data: [
        ...['agent', 'second', 'lead'].map((name) => ({
          teamId,
          userId: users[name].id,
        })),
        ...['collaborator', 'historical', 'inactive'].map((name) => ({
          teamId: otherTeamId,
          userId: users[name].id,
        })),
      ],
    });
    categoryId = (await db.ticketCategory.create({ data: { name: prefix } }))
      .id;
    ticketId = (
      await db.ticket.create({
        data: {
          title: 'Secret ticket title',
          description: 'Secret description',
          requesterId: users.employee.id,
          categoryId,
          status: 'IN_PROGRESS',
          assignedManagerId: users.manager.id,
          assignedTeamId: teamId,
          assignedAgentId: users.agent.id,
          allRegions: true,
          allDepartments: true,
          workCycles: {
            create: [
              {
                sequenceNumber: 1,
                type: 'ORIGINAL',
                startedAt: new Date(),
                endedAt: new Date(),
                outcome: 'RESOLVED',
              },
              { sequenceNumber: 2, type: 'REOPENED', startedAt: new Date() },
            ],
          },
        },
      })
    ).id;
    const cycles = await db.ticketWorkCycle.findMany({
      where: { ticketId },
      orderBy: { sequenceNumber: 'asc' },
    });
    [oldCycleId, cycleId] = cycles.map((c) => c.id);
    subtaskId = (
      await db.subtask.create({
        data: {
          ticketId,
          createdInCycleId: cycleId,
          title: 'Secret task',
          description: '',
          assignedTeamId: otherTeamId,
          assignedAgentId: users.collaborator.id,
        },
      })
    ).id;
    await db.subtask.create({
      data: {
        ticketId,
        createdInCycleId: oldCycleId,
        title: 'Old',
        description: '',
        assignedTeamId: otherTeamId,
        assignedAgentId: users.historical.id,
      },
    });
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    const ids = Object.values(users).map((u) => u.id);
    await db.attachment.deleteMany({ where: { uploaderId: { in: ids } } });
    await db.notification.deleteMany({
      where: { recipientUserId: { in: ids } },
    });
    await db.ticketMessage.deleteMany({ where: { ticketId } });
    await db.ticketInternalNote.deleteMany({ where: { ticketId } });
    await db.subtask.deleteMany({ where: { ticketId } });
    await db.ticket.deleteMany({ where: { requesterId: { in: ids } } });
    await db.team.deleteMany({ where: { id: { in: [teamId, otherTeamId] } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.ticketCategory.delete({ where: { id: categoryId } });
    await rm(storageDir, { recursive: true, force: true });
  });
  const upload = (
    who = 'employee',
    kind = 'messages',
    key = randomUUID(),
    filename = 'report.txt',
    bytes = Buffer.from('service desk report'),
  ) =>
    request(app.getHttpServer())
      .post(`/tickets/${ticketId}/${kind}`)
      .set('Authorization', `Bearer ${token(who)}`)
      .field(
        'payload',
        JSON.stringify({
          content: 'Private original content',
          expectedCycleId: cycleId,
          clientRequestId: key,
        }),
      )
      .attach('files', bytes, filename);
  const download = (id: number, who = 'employee') =>
    get(`/tickets/attachments/${id}/download`, who);
  const remove = (
    record: number,
    who = 'employee',
    kind = 'messages',
    file?: number,
    cycle = cycleId,
  ) =>
    request(app.getHttpServer())
      .delete(
        `/tickets/${ticketId}/${kind}/${record}${file ? `/attachments/${file}` : ''}`,
      )
      .set('Authorization', `Bearer ${token(who)}`)
      .send({ expectedCycleId: cycle });

  it('creates immutable original ticket files atomically with private metadata and current authorization', async () => {
    const body = {
      title: 'Files',
      description: 'Original',
      categoryId,
      allRegions: true,
      allDepartments: true,
      affectedRegionIds: [],
      affectedDepartmentIds: [],
    };
    const created = await request(app.getHttpServer())
      .post('/tickets')
      .set('Authorization', `Bearer ${token('employee')}`)
      .field('payload', JSON.stringify(body))
      .attach('files', Buffer.from('original'), 'original.log')
      .expect(201);
    const list = await get(
      `/tickets/${created.body.id}/attachments`,
      'employee',
    ).expect(200);
    expect(list.body).toHaveLength(1);
    const file = list.body[0];
    expect(file).toMatchObject({
      filename: 'original.log',
      byteSize: 8,
      deletedAt: null,
    });
    expect(file.storageKey).toBeUndefined();
    expect((await download(file.id).expect(200)).text).toBe('original');
    for (const who of ['outsider', 'agent', 'admin', 'superAdmin'])
      expect((await download(file.id, who)).status).toBe(
        who.includes('Admin') || who === 'admin' ? 403 : 404,
      );
    await download(file.id, 'manager').expect(200); // Existing shared NEW intake visibility.
    for (const method of ['delete', 'patch', 'post'] as const)
      await request(app.getHttpServer())
        [method](`/tickets/${created.body.id}/attachments/${file.id}`)
        .set('Authorization', `Bearer ${token('employee')}`)
        .send({})
        .expect(404);
    await post(
      `/tickets/${created.body.id}/attachments`,
      'employee',
      {},
    ).expect(404);
    await patch(`/tickets/${created.body.id}`, 'employee', {
      attachments: [],
    }).expect(400);
    const response = await download(file.id);
    expect(response.headers['content-disposition']).toMatch(/^attachment;/);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['cache-control']).toContain('no-store');
    await request(app.getHttpServer())
      .get(`/tickets/attachments/${file.id}/download`)
      .expect(401);
    const stored = await db.attachment.findUniqueOrThrow({
      where: { id: file.id },
    });
    await request(app.getHttpServer())
      .get(`/.attachments/${stored.storageKey}`)
      .expect(404);
    await request(app.getHttpServer()).get(`/${stored.storageKey}`).expect(404);
  });

  it('enforces current message attachment visibility including collaborator completion and access loss', async () => {
    const message = (await upload().expect(201)).body;
    const file = message.attachments[0];
    for (const who of ['employee', 'manager', 'agent', 'lead', 'collaborator'])
      await download(file.id, who).expect(200);
    for (const who of ['second', 'historical', 'outsider', 'nextManager'])
      await download(file.id, who).expect(404);
    for (const who of ['admin', 'superAdmin'])
      await download(file.id, who).expect(403);
    await db.subtask.update({
      where: { id: subtaskId },
      data: { status: 'COMPLETED' },
    });
    await download(file.id, 'collaborator').expect(200);
    await db.subtask.update({
      where: { id: subtaskId },
      data: { assignedAgentId: users.second.id },
    });
    await download(file.id, 'collaborator').expect(404);
    await download(file.id, 'second').expect(200);
    await assign(null).expect(200);
    await download(file.id, 'agent').expect(404);
    const support = (await upload('manager').expect(201)).body;
    await download(support.attachments[0].id, 'employee').expect(200);
  });

  it.each(['messages', 'internal-notes'])(
    'allows only the authorized author to delete %s attachments without notifications',
    async (kind) => {
      const record = (await upload('agent', kind).expect(201)).body;
      const file = record.attachments[0];
      const before = await rows();
      for (const who of ['manager', 'lead', 'collaborator'])
        await remove(record.id, who, kind, file.id).expect(403);
      for (const who of ['admin', 'superAdmin'])
        await remove(record.id, who, kind, file.id).expect(403);
      if (kind === 'internal-notes') {
        await download(file.id, 'employee').expect(404);
        await remove(record.id, 'employee', kind, file.id).expect(403);
        for (const who of ['manager', 'agent', 'lead', 'collaborator'])
          await download(file.id, who).expect(200);
      }
      await remove(record.id, 'agent', kind, file.id).expect(200);
      await remove(record.id, 'agent', kind, file.id).expect(200);
      for (const who of ['agent', 'manager', 'employee'])
        await download(file.id, who).expect(404);
      const tombstone = (await get(`/tickets/${ticketId}/${kind}`, 'agent'))
        .body.records[0].attachments[0];
      expect(tombstone.deletedAt).toBeTruthy();
      expect(tombstone.filename).toBeNull();
      expect(tombstone.storageKey).toBeUndefined();
      const edited = await patch(
        `/tickets/${ticketId}/${kind}/${record.id}`,
        'agent',
        { content: 'Edited after file deletion', expectedCycleId: cycleId },
      ).expect(200);
      expect(edited.body.attachments[0].filename).toBeNull();
      expect(await rows()).toEqual(before);
      expect(
        (await db.attachment.findUniqueOrThrow({ where: { id: file.id } }))
          .deletedAt,
      ).not.toBeNull();
    },
  );

  it.each(['messages', 'internal-notes'])(
    'soft deletes %s and consumes its creation key permanently',
    async (kind) => {
      const key = randomUUID();
      const record = (await upload('agent', kind, key).expect(201)).body;
      const before = await rows();
      for (const who of [
        'manager',
        'lead',
        'collaborator',
        'employee',
        'admin',
        'superAdmin',
      ])
        await remove(record.id, who, kind).expect(403);
      const first = await remove(record.id, 'agent', kind).expect(200);
      expect(first.body.content).toBeNull();
      expect(first.body.author.id).toBe(users.agent.id);
      expect(first.body.createdAt).toBe(record.createdAt);
      expect(first.body.deletedAt).toBeTruthy();
      expect(
        (await remove(record.id, 'agent', kind).expect(200)).body.deletedAt,
      ).toBe(first.body.deletedAt);
      await patch(`/tickets/${ticketId}/${kind}/${record.id}`, 'agent', {
        content: 'restore',
        expectedCycleId: cycleId,
      }).expect(409);
      await remove(record.id, 'agent', kind, record.attachments[0].id).expect(
        409,
      );
      const replay = await upload('agent', kind, key).expect(201);
      expect(replay.body.id).toBe(record.id);
      expect(replay.body.content).toBeNull();
      expect(replay.body.deletedAt).toBe(first.body.deletedAt);
      expect(replay.body.attachments[0].filename).toBeNull();
      expect(
        await db.attachment.count({ where: { uploaderId: users.agent.id } }),
      ).toBe(1);
      expect(await readdir(storageDir)).toHaveLength(1);
      await download(record.attachments[0].id, 'manager').expect(404);
      const stream = (await get(`/tickets/${ticketId}/${kind}`, 'agent')).body;
      expect(JSON.stringify(stream)).not.toContain('Private original content');
      expect(stream.records[0]).toMatchObject({
        canEdit: false,
        canDelete: false,
      });
      expect(await rows()).toEqual(before);
      await upload('agent', kind, key, 'different.txt').expect(409);
      expect(await readdir(storageDir)).toHaveLength(1);
    },
  );

  it('keeps WAITING reply transition and unread notifications after requester deletion', async () => {
    await db.ticket.update({
      where: { id: ticketId },
      data: { status: 'WAITING_FOR_EMPLOYEE' },
    });
    const record = (await upload().expect(201)).body;
    const before = await rows();
    expect(before.length).toBeGreaterThan(0);
    await remove(record.id).expect(200);
    expect(
      (await db.ticket.findUniqueOrThrow({ where: { id: ticketId } })).status,
    ).toBe('IN_PROGRESS');
    expect(await rows()).toEqual(before);
  });

  it.each(['RESOLVED', 'CLOSED', 'CANCELLED'])(
    'freezes communication and attachment deletion in %s',
    async (terminal) => {
      const record = (await upload().expect(201)).body;
      const note = (await upload('agent', 'internal-notes').expect(201)).body;
      await db.ticket.update({
        where: { id: ticketId },
        data: { status: terminal as any },
      });
      await db.ticketWorkCycle.update({
        where: { id: cycleId },
        data: { outcome: terminal as any, endedAt: new Date() },
      });
      for (const [item, who, kind] of [
        [record, 'employee', 'messages'],
        [note, 'agent', 'internal-notes'],
      ] as const) {
        await remove(item.id, who, kind).expect(409);
        await remove(item.id, who, kind, item.attachments[0].id).expect(409);
        await download(item.attachments[0].id, who).expect(200);
        await upload(who, kind).expect(409);
        await patch(`/tickets/${ticketId}/${kind}/${item.id}`, who, {
          content: 'changed',
          expectedCycleId: cycleId,
        }).expect(409);
      }
      await download(record.attachments[0].id, 'collaborator').expect(404);
      if (terminal !== 'CANCELLED') {
        await reopen('employee').expect(201);
        cycleId = (
          await db.ticketWorkCycle.findFirstOrThrow({
            where: { ticketId },
            orderBy: { sequenceNumber: 'desc' },
          })
        ).id;
        await remove(record.id).expect(409);
        await remove(
          record.id,
          'employee',
          'messages',
          record.attachments[0].id,
        ).expect(409);
        await remove(note.id, 'agent', 'internal-notes').expect(409);
        await remove(
          note.id,
          'agent',
          'internal-notes',
          note.attachments[0].id,
        ).expect(409);
        await upload().expect(201);
      }
    },
  );

  it('rejects deletion after current author access disappears', async () => {
    const record = (await upload('collaborator').expect(201)).body;
    await db.subtask.update({
      where: { id: subtaskId },
      data: { assignedAgentId: null },
    });
    await remove(record.id, 'collaborator').expect(404);
    await remove(
      record.id,
      'collaborator',
      'messages',
      record.attachments[0].id,
    ).expect(404);
    await download(record.attachments[0].id, 'collaborator').expect(404);
  });

  it('rejects file limits, unsupported/mismatched content and unauthorized multipart DTO fields', async () => {
    for (const filename of [
      'program.exe',
      'page.html',
      'script.js',
      'archive.zip',
      'fake.png',
      'bad.json',
    ])
      await upload('employee', 'messages', randomUUID(), filename).expect(400);
    await upload(
      'employee',
      'messages',
      randomUUID(),
      'large.txt',
      Buffer.alloc(10 * 1024 * 1024 + 1, 65),
    ).expect(413);
    let call = request(app.getHttpServer())
      .post(`/tickets/${ticketId}/messages`)
      .set('Authorization', `Bearer ${token('employee')}`)
      .field(
        'payload',
        JSON.stringify({
          content: 'x',
          expectedCycleId: cycleId,
          clientRequestId: randomUUID(),
        }),
      );
    for (let i = 0; i < 6; i++)
      call = call.attach('files', Buffer.from('x'), `file${i}.txt`);
    expect([400, 413]).toContain((await call).status);
    await post(`/tickets/${ticketId}/messages`, 'employee', {
      content: 'x',
      expectedCycleId: cycleId,
      clientRequestId: randomUUID(),
      attachments: [],
    }).expect(400);
    expect(await db.ticketMessage.count({ where: { ticketId } })).toBe(0);
    expect(
      await db.attachment.count({ where: { uploaderId: users.employee.id } }),
    ).toBe(0);
  });

  it('fails the parent when storage fails and cleans new files when the database fails', async () => {
    const storage = app.get(AttachmentStorage);
    jest
      .spyOn(storage, 'put')
      .mockRejectedValueOnce(new Error('Injected storage failure'));
    await upload().expect(500);
    expect(await db.ticketMessage.count({ where: { ticketId } })).toBe(0);
    expect(
      await db.attachment.count({ where: { uploaderId: users.employee.id } }),
    ).toBe(0);
    jest
      .spyOn(db, '$transaction')
      .mockRejectedValueOnce(new Error('Injected database failure'));
    await upload().expect(500);
    expect(await readdir(storageDir).catch(() => [])).toHaveLength(0);
    expect(await rows()).toHaveLength(0);
    const body = {
      title: 'Rollback',
      description: 'x',
      categoryId,
      allRegions: true,
      allDepartments: true,
      affectedRegionIds: [],
      affectedDepartmentIds: [],
    };
    jest
      .spyOn(db, '$transaction')
      .mockRejectedValueOnce(new Error('Injected ticket database failure'));
    await request(app.getHttpServer())
      .post('/tickets')
      .set('Authorization', `Bearer ${token('employee')}`)
      .field('payload', JSON.stringify(body))
      .attach('files', Buffer.from('x'), 'file.txt')
      .expect(500);
    expect(
      await db.ticket.count({ where: { requesterId: users.employee.id } }),
    ).toBe(1);
    expect(await readdir(storageDir)).toHaveLength(0);
  });
  it('rolls back attachment metadata, content, notifications and files when a later domain write fails', async () => {
    await db.ticket.update({
      where: { id: ticketId },
      data: { status: 'WAITING_FOR_EMPLOYEE' },
    });
    const name = `fail_attachment_${ticketId}`;
    await db.$executeRawUnsafe(
      `CREATE FUNCTION "${name}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = ${ticketId} AND NEW.status = 'IN_PROGRESS' THEN RAISE EXCEPTION 'attachment rollback'; END IF; RETURN NEW; END $$`,
    );
    await db.$executeRawUnsafe(
      `CREATE TRIGGER "${name}" BEFORE UPDATE ON "Ticket" FOR EACH ROW EXECUTE FUNCTION "${name}"()`,
    );
    try {
      await upload().expect(500);
      expect(await db.ticketMessage.count({ where: { ticketId } })).toBe(0);
      expect(
        await db.attachment.count({ where: { uploaderId: users.employee.id } }),
      ).toBe(0);
      expect(await rows()).toHaveLength(0);
      expect(await readdir(storageDir)).toHaveLength(0);
      expect(
        (await db.ticket.findUniqueOrThrow({ where: { id: ticketId } })).status,
      ).toBe('WAITING_FOR_EMPLOYEE');
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER "${name}" ON "Ticket"`);
      await db.$executeRawUnsafe(`DROP FUNCTION "${name}"()`);
    }
  });

  it('deduplicates concurrent multipart creation without leaving spare binaries', async () => {
    const key = randomUUID();
    const results = await Promise.all([
      upload('employee', 'messages', key),
      upload('employee', 'messages', key),
    ]);
    expect(results.some((result) => result.status === 201)).toBe(true);
    expect(results.every((result) => [201, 409].includes(result.status))).toBe(
      true,
    );
    await upload('employee', 'messages', key).expect(201);
    expect(await db.ticketMessage.count({ where: { ticketId } })).toBe(1);
    expect(
      await db.attachment.count({ where: { uploaderId: users.employee.id } }),
    ).toBe(1);
    expect(await readdir(storageDir)).toHaveLength(1);
  });

  it.each(['resolution', 'reassignment', 'deactivation', 'lead-removal'])(
    'rejects deletion waiting behind %s',
    async (change) => {
      const who = change === 'lead-removal' ? 'lead' : 'collaborator';
      const record = (await upload(who).expect(201)).body;
      let release!: () => void, ready!: () => void;
      const locked = new Promise<void>((resolve) => {
        ready = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const blocker = db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${ticketId} FOR UPDATE`;
          ready();
          await gate;
          if (change === 'resolution') {
            await tx.ticket.update({
              where: { id: ticketId },
              data: { status: 'RESOLVED' },
            });
            await tx.ticketWorkCycle.update({
              where: { id: cycleId },
              data: { outcome: 'RESOLVED', endedAt: new Date() },
            });
          } else if (change === 'reassignment')
            await tx.subtask.update({
              where: { id: subtaskId },
              data: { assignedAgentId: null },
            });
          else if (change === 'deactivation')
            await tx.user.update({
              where: { id: users[who].id },
              data: { status: 'INACTIVE', sessionVersion: { increment: 1 } },
            });
          else
            await tx.team.update({
              where: { id: teamId },
              data: { teamLeadId: null },
            });
        },
        { timeout: 15000 },
      );
      await locked;
      const pending = remove(
        record.id,
        who,
        'messages',
        change === 'resolution' ? undefined : record.attachments[0].id,
      ).then((response) => response);
      try {
        let blocked = false;
        for (let i = 0; i < 100; i++) {
          const rows = await db.$queryRaw<
            Array<{ count: bigint }>
          >`SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%Ticket%'`;
          if (Number(rows[0].count) > 0) {
            blocked = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        expect(blocked).toBe(true);
      } finally {
        release();
        await blocker;
      }
      expect([401, 404, 409]).toContain((await pending).status);
      expect(
        (await db.ticketMessage.findUniqueOrThrow({ where: { id: record.id } }))
          .deletedAt,
      ).toBeNull();
      expect(
        (
          await db.attachment.findUniqueOrThrow({
            where: { id: record.attachments[0].id },
          })
        ).deletedAt,
      ).toBeNull();
    },
  );
  it('accepts exactly five files and the inclusive 10 MB boundary', async () => {
    let call = request(app.getHttpServer()).post(`/tickets/${ticketId}/messages`).set('Authorization', `Bearer ${token('employee')}`).field('payload', JSON.stringify({ content: 'Limits', expectedCycleId: cycleId, clientRequestId: randomUUID() }));
    for (let i = 0; i < 5; i++) call = call.attach('files', i === 0 ? Buffer.alloc(10485760, 65) : Buffer.from('small'), `file${i}.txt`);
    const result = await call.expect(201);
    expect(result.body.attachments).toHaveLength(5);
    expect(result.body.attachments[0].byteSize).toBe(10485760);
    expect(await readdir(storageDir)).toHaveLength(5);
    await download(result.body.attachments[0].id).expect(200);
  });
});
