import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

// The existing pg dependency is used only for executing historical SQL before
// the generated client schema exists. Everything is rolled back in a private schema.
import { Client } from 'pg';
import type {
  Ticket,
  Subtask,
  TicketWorkCycle,
} from '../generated/prisma/client';

describe('Work-cycle migration from the nine-migration schema', () => {
  it('backfills exactly one truthful ORIGINAL cycle and enforces same-ticket subtask references', async () => {
    const client = new Client({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    await client.connect();
    const schema = `migration_${randomUUID().replaceAll('-', '')}`;
    try {
      await client.query('BEGIN');
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET LOCAL search_path TO "${schema}"`);
      const root = join(__dirname, '../prisma/migrations');
      const migrations = readdirSync(root)
        .filter(
          (name) =>
            /^\d/.test(name) &&
            name <= '20260918120000_user_lifecycle_work_cycles',
        )
        .sort();
      for (const name of migrations.slice(0, -1))
        await client.query(
          readFileSync(join(root, name, 'migration.sql'), 'utf8'),
        );
      await client.query(`INSERT INTO "User" (id, username, email, password, role, "updatedAt") VALUES
        (1, 'employee', 'employee@test.invalid', 'hash', 'EMPLOYEE', NOW()),
        (2, 'manager', 'manager@test.invalid', 'hash', 'MANAGER', NOW()),
        (3, 'agent', 'agent@test.invalid', 'hash', 'AGENT', NOW())`);
      await client.query(
        `INSERT INTO "TicketCategory" (id, name, "updatedAt") VALUES (1, 'VPN', NOW())`,
      );
      await client.query(
        `INSERT INTO "Team" (id, name, scope, "updatedAt") VALUES (1, 'Support', 'GLOBAL', NOW())`,
      );
      await client.query(`INSERT INTO "Ticket" (id, title, description, "requesterId", "categoryId", status, "assignedManagerId", "assignedTeamId", "assignedAgentId", "createdAt", "updatedAt", "resolvedAt", "closedAt") VALUES
        (1, 'Active', 'known', 1, 1, 'IN_PROGRESS', 2, 1, 3, '2026-01-01', '2026-01-02', NULL, NULL),
        (2, 'Resolved', 'known', 1, 1, 'RESOLVED', 2, 1, 3, '2026-02-01', '2026-02-02', '2026-02-02', NULL),
        (3, 'Closed', 'known', 1, 1, 'CLOSED', NULL, NULL, NULL, '2026-03-01', '2026-03-03', NULL, '2026-03-03'),
        (4, 'Closed complete', 'known', 1, 1, 'CLOSED', 2, 1, 3, '2026-04-01', '2026-04-03', '2026-04-02', '2026-04-03')`);
      await client.query(`INSERT INTO "Subtask" (id, "ticketId", title, description, status, "assignedAgentId", "completedAt", "updatedAt") VALUES
        (1, 1, 'Open', 'work', 'TODO', 3, NULL, NOW()),
        (2, 2, 'Done', 'work', 'COMPLETED', 3, '2026-02-02', NOW()),
        (3, 3, 'Unfinished historical work', 'work', 'TODO', NULL, NULL, NOW())`);
      const beforeTickets = (
        await client.query<Ticket>('SELECT * FROM "Ticket" ORDER BY id')
      ).rows;
      const beforeTasks = (
        await client.query<Subtask>('SELECT * FROM "Subtask" ORDER BY id')
      ).rows;
      await client.query(
        readFileSync(join(root, migrations.at(-1)!, 'migration.sql'), 'utf8'),
      );
      const cycles = (
        await client.query<TicketWorkCycle>(
          'SELECT * FROM "TicketWorkCycle" ORDER BY "ticketId"',
        )
      ).rows;
      expect(cycles).toHaveLength(4);
      for (const cycle of cycles) {
        expect(cycle).toMatchObject({
          sequenceNumber: 1,
          type: 'ORIGINAL',
          startedById: null,
          endedById: null,
          closedById: null,
          startReason: null,
          resolutionSummary: null,
        });
        expect(cycle.startedAt).toEqual(
          beforeTickets[cycle.ticketId - 1].createdAt,
        );
      }
      expect(cycles[0]).toMatchObject({
        outcome: null,
        endedAt: null,
        endingManagerId: null,
        ownershipSnapshotBasis: null,
      });
      expect(cycles[1]).toMatchObject({
        outcome: 'RESOLVED',
        endingManagerId: 2,
        endingTeamId: 1,
        endingAgentId: 3,
        ownershipSnapshotBasis: 'RECORDED_AT_MIGRATION',
      });
      expect(cycles[1].endedAt).toEqual(beforeTickets[1].resolvedAt);
      expect(cycles[2]).toMatchObject({
        outcome: 'CLOSED',
        endedAt: null,
        endingManagerId: null,
        endingTeamId: null,
        endingAgentId: null,
      });
      expect(cycles[2].closedAt).toEqual(beforeTickets[2].closedAt);
      expect(cycles[3].endedAt).toEqual(beforeTickets[3].resolvedAt);
      expect(cycles[3].closedAt).toEqual(beforeTickets[3].closedAt);
      expect(
        (await client.query('SELECT * FROM "Ticket" ORDER BY id')).rows,
      ).toEqual(beforeTickets);
      const tasks = (
        await client.query<Subtask>('SELECT * FROM "Subtask" ORDER BY id')
      ).rows;
      tasks.forEach((task, index) => {
        const { createdInCycleId, completedById, ...original } = task;
        expect(original).toEqual(beforeTasks[index]);
        expect(completedById).toBeNull();
        expect(createdInCycleId).toBe(cycles[index].id);
      });
      expect(
        (
          await client.query<{ status: string; sessionVersion: number }>(
            'SELECT status, "sessionVersion" FROM "User"',
          )
        ).rows.every(
          (user) => user.status === 'ACTIVE' && user.sessionVersion === 0,
        ),
      ).toBe(true);
      await client.query('SAVEPOINT invalid_reference');
      await expect(
        client.query(
          'UPDATE "Subtask" SET "createdInCycleId" = $1 WHERE id = 1',
          [cycles[1].id],
        ),
      ).rejects.toMatchObject({ code: '23503' });
      await client.query('ROLLBACK TO SAVEPOINT invalid_reference');
      await expect(
        client.query(
          'UPDATE "Subtask" SET "createdInCycleId" = NULL WHERE id = 1',
        ),
      ).rejects.toMatchObject({ code: '23502' });
      await client.query('ROLLBACK TO SAVEPOINT invalid_reference');
      await client.query(
        readFileSync(
          join(root, '20260923120000_ticket_communication', 'migration.sql'),
          'utf8',
        ),
      );
      for (const table of ['TicketMessage', 'TicketInternalNote']) {
        expect(
          (
            await client.query<{ count: number }>(
              `SELECT count(*)::int AS count FROM "${table}"`,
            )
          ).rows[0].count,
        ).toBe(0);
        await client.query('SAVEPOINT communication_reference');
        await expect(
          client.query(
            `INSERT INTO "${table}" ("ticketId", "createdInCycleId", "authorId", content, "clientRequestId", "creationHash") VALUES (1, $1, 1, 'Invalid cycle', $2, $3)`,
            [cycles[1].id, randomUUID(), 'a'.repeat(64)],
          ),
        ).rejects.toMatchObject({ code: '23503' });
        await client.query('ROLLBACK TO SAVEPOINT communication_reference');
      }
      await client.query(
        readFileSync(
          join(root, '20260923150000_in_app_notifications', 'migration.sql'),
          'utf8',
        ),
      );
      expect(
        (
          await client.query<{ count: number }>(
            'SELECT count(*)::int AS count FROM "Notification"',
          )
        ).rows[0].count,
      ).toBe(0);
      // No content columns or historical notification fabrication.
      expect(
        (await client.query('SELECT * FROM "Ticket" ORDER BY id')).rows,
      ).toEqual(beforeTickets);
      await client.query(`INSERT INTO "User" (id, username, email, password, role, "updatedAt") VALUES
        (4, 'notification-actor', 'actor@test.invalid', 'hash', 'MANAGER', NOW()),
        (5, 'notification-recipient', 'recipient@test.invalid', 'hash', 'AGENT', NOW())`);
      await client.query(
        `INSERT INTO "Notification" ("recipientUserId", "actorUserId", "ticketId", "subtaskId", type) VALUES (5, 4, 1, 1, 'SUBTASK_ASSIGNED')`,
      );
      for (const [table, id] of [
        ['User', 4],
        ['User', 5],
        ['Subtask', 1],
      ] as const) {
        await client.query('SAVEPOINT notification_reference');
        await expect(
          client.query(`DELETE FROM "${table}" WHERE id = $1`, [id]),
        ).rejects.toMatchObject({ code: '23503' });
        await client.query('ROLLBACK TO SAVEPOINT notification_reference');
      }
      for (const table of ['TicketMessage', 'TicketInternalNote']) {
        await client.query(
          `INSERT INTO "${table}" ("ticketId", "createdInCycleId", "authorId", content, "clientRequestId", "creationHash") VALUES (1, $1, 1, 'Existing content', $2, $3)`,
          [cycles[0].id, randomUUID(), 'a'.repeat(64)],
        );
      }
      await client.query(
        readFileSync(
          join(
            root,
            '20260925120000_attachments_soft_deletion',
            'migration.sql',
          ),
          'utf8',
        ),
      );
      expect(
        (
          await client.query<{ count: number }>(
            'SELECT count(*)::int AS count FROM "Attachment"',
          )
        ).rows[0].count,
      ).toBe(0);
      for (const table of ['TicketMessage', 'TicketInternalNote']) {
        expect(
          (await client.query(`SELECT content, "deletedAt" FROM "${table}"`))
            .rows,
        ).toEqual([{ content: 'Existing content', deletedAt: null }]);
      }
      for (const parents of [
        'NULL, NULL, NULL',
        '1, 1, NULL',
        '99999, NULL, NULL',
      ]) {
        await client.query('SAVEPOINT attachment_constraint');
        await expect(
          client.query(
            `INSERT INTO "Attachment" ("ticketId", "messageId", "internalNoteId", "uploaderId", filename, "contentType", "byteSize", "storageKey") VALUES (${parents}, 1, 'file.txt', 'text/plain', 1, $1)`,
            [randomUUID()],
          ),
        ).rejects.toBeDefined();
        await client.query('ROLLBACK TO SAVEPOINT attachment_constraint');
      }
      await client.query(
        `INSERT INTO "Attachment" ("ticketId", "uploaderId", filename, "contentType", "byteSize", "storageKey") VALUES (1, 1, 'file.txt', 'text/plain', 1, $1)`,
        [randomUUID()],
      );
      await client.query('SAVEPOINT immutable_ticket_attachment');
      await expect(
        client.query('UPDATE "Attachment" SET "deletedAt" = NOW()'),
      ).rejects.toMatchObject({ code: '23514' });
      await client.query('ROLLBACK TO SAVEPOINT immutable_ticket_attachment');
      const migrationClient = client;
      for (const name of [
        '20260925160000_work_history_indexes',
        '20260925180000_ticket_auto_close',
      ]) {
        const before = await migrationClient.query<Record<string, unknown>>(
          'SELECT * FROM "TicketWorkCycle" ORDER BY id',
        );
        await migrationClient.query(
          readFileSync(join(root, name, 'migration.sql'), 'utf8'),
        );
        if (name.endsWith('ticket_auto_close')) {
          const after = await migrationClient.query<Record<string, unknown>>(
            'SELECT * FROM "TicketWorkCycle" ORDER BY id',
          );
          expect(after.rows).toEqual(
            before.rows.map((cycle) => ({ ...cycle, closeSource: null })),
          );
        }
      }
      expect(
        (await migrationClient.query('SELECT * FROM "Ticket" ORDER BY id'))
          .rows,
      ).toEqual(beforeTickets);
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });
});
