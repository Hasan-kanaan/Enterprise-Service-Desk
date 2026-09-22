import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

// The existing pg dependency is used only for executing historical SQL before
// the generated client schema exists. Everything is rolled back in a private schema.
const { Client } = require('pg');

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
        .filter((name) => /^\d/.test(name))
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
        await client.query('SELECT * FROM "Ticket" ORDER BY id')
      ).rows;
      const beforeTasks = (
        await client.query('SELECT * FROM "Subtask" ORDER BY id')
      ).rows;
      await client.query(
        readFileSync(join(root, migrations.at(-1)!, 'migration.sql'), 'utf8'),
      );
      const cycles = (
        await client.query(
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
      const tasks = (await client.query('SELECT * FROM "Subtask" ORDER BY id'))
        .rows;
      tasks.forEach((task: any, index: number) => {
        const { createdInCycleId, completedById, ...original } = task;
        expect(original).toEqual(beforeTasks[index]);
        expect(completedById).toBeNull();
        expect(createdInCycleId).toBe(cycles[index].id);
      });
      expect(
        (
          await client.query('SELECT status, "sessionVersion" FROM "User"')
        ).rows.every(
          (user: any) => user.status === 'ACTIVE' && user.sessionVersion === 0,
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
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });
});
