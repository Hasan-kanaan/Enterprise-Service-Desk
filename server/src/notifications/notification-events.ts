import {
  NotificationType,
  Prisma,
  UserRole,
} from '../../generated/prisma/client';

type Database = Prisma.TransactionClient;
type Event = {
  type: NotificationType;
  actorUserId: number;
  ticketId: number;
  subtaskId?: number;
};

// Called only by the actual mutation branch, using its existing transaction.
// No event log, retries, historical backfill, or notification-derived authority.
export async function notify(
  db: Database,
  recipients: Array<number | null>,
  event: Event,
) {
  const ids = [
    ...new Set(recipients.filter((id): id is number => id !== null)),
  ];
  if (!ids.length) return;
  await db.$queryRaw(
    Prisma.sql`SELECT id FROM "User" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR SHARE`,
  );
  const active = await db.user.findMany({
    where: {
      id: { in: ids },
      status: 'ACTIVE',
      role: { in: ['EMPLOYEE', 'MANAGER', 'AGENT'] },
    },
    select: { id: true },
  });
  if (active.length)
    await db.notification.createMany({
      data: active.map(({ id }) => ({ ...event, recipientUserId: id })),
    });
}

export async function supportRecipients(
  db: Database,
  ticketId: number,
  includeCollaborators: boolean,
): Promise<number[]> {
  // Ticket/subtask mutations already hold the parent lock. Lead changes use the
  // Team row, so also lock it before observing that relationship.
  await db.$queryRaw`SELECT id FROM "Team" WHERE id = (SELECT "assignedTeamId" FROM "Ticket" WHERE id = ${ticketId}) FOR SHARE`;
  const ticket = await db.ticket.findUniqueOrThrow({
    where: { id: ticketId },
    select: {
      assignedManagerId: true,
      assignedAgentId: true,
      assignedTeam: { select: { teamLeadId: true } },
      workCycles: {
        orderBy: { sequenceNumber: 'desc' },
        take: 1,
        select: { id: true, outcome: true },
      },
    },
  });
  const cycle = ticket.workCycles[0];
  const collaborators =
    includeCollaborators && cycle?.outcome === null
      ? await db.subtask.findMany({
          where: {
            ticketId,
            createdInCycleId: cycle.id,
            assignedAgentId: { not: null },
          },
          select: { assignedAgentId: true },
        })
      : [];
  const agentIds = [
    ticket.assignedAgentId,
    ticket.assignedTeam?.teamLeadId,
    ...collaborators.map((s) => s.assignedAgentId),
  ].filter((id): id is number => id != null);
  const people = await db.user.findMany({
    where: {
      status: 'ACTIVE',
      OR: [
        { id: ticket.assignedManagerId ?? -1, role: UserRole.MANAGER },
        { id: { in: agentIds }, role: UserRole.AGENT },
      ],
    },
    select: { id: true },
  });
  return people.map((p) => p.id);
}
