import { Prisma } from '../../generated/prisma/client';
import { autoCloseAt } from './auto-close.config';

const person = {
  select: { id: true, username: true, displayName: true },
} as const;
export const cycleInclude = {
  startedBy: person,
  endedBy: person,
  closedBy: person,
  endingManager: person,
  endingAgent: person,
  endingTeam: { select: { id: true, name: true } },
} satisfies Prisma.TicketWorkCycleInclude;

type Cycle = Prisma.TicketWorkCycleGetPayload<{ include: typeof cycleInclude }>;
type Owners = {
  assignedManager: { id: number; username: string } | null;
  assignedAgent: { id: number; username: string } | null;
  assignedTeam: { id: number; name: string } | null;
};

export function mapCycle(cycle: Cycle, isCurrent: boolean, ticket: Owners) {
  const ended = cycle.outcome !== null;
  return {
    id: cycle.id,
    sequenceNumber: cycle.sequenceNumber,
    type: cycle.type,
    isCurrent,
    isEnded: ended,
    startedAt: cycle.startedAt,
    startedBy: cycle.startedBy,
    startReason: cycle.startReason,
    startDisposition: cycle.startDisposition,
    outcome: cycle.outcome,
    endedAt: cycle.endedAt,
    endedBy: cycle.endedBy,
    closedAt: cycle.closedAt,
    closedBy: cycle.closedBy,
    closeSource: cycle.closeSource,
    resolutionSummary: cycle.resolutionSummary,
    ownership: {
      basis: ended ? cycle.ownershipSnapshotBasis : 'CURRENT',
      capturedAt: ended ? cycle.ownershipCapturedAt : null,
      manager: ended ? cycle.endingManager : ticket.assignedManager,
      team: ended ? cycle.endingTeam : ticket.assignedTeam,
      agent: ended ? cycle.endingAgent : ticket.assignedAgent,
    },
  };
}

export function mapTicket(
  ticket: Prisma.TicketGetPayload<{
    include: {
      workCycles: { include: typeof cycleInclude };
      assignedManager: {
        select: { id: true; username: true; displayName: true; status: true };
      };
      assignedAgent: {
        select: { id: true; username: true; displayName: true; status: true };
      };
      assignedTeam: { select: { id: true; name: true } };
      category: { select: { id: true; name: true } };
      tags: { include: { tag: { select: { id: true; name: true } } } };
      affectedRegions: {
        include: { region: { select: { id: true; name: true } } };
      };
      affectedDepartments: {
        include: { department: { select: { id: true; name: true } } };
      };
    };
  }>,
) {
  const {
    workCycles,
    assignedManager,
    assignedTeam,
    assignedAgent,
    tags,
    affectedRegions,
    affectedDepartments,
    creationHash,
    clientRequestId,
    ...scalars
  } = ticket;
  void creationHash;
  void clientRequestId;
  return {
    ...scalars,
    autoCloseAt: autoCloseAt(ticket),
    tagIds: tags.map((tag) => tag.tagId),
    tags: tags.map((link) => link.tag),
    affectedRegionIds: affectedRegions.map((item) => item.regionId),
    affectedDepartmentIds: affectedDepartments.map((item) => item.departmentId),
    affectedRegions: affectedRegions.map((item) => item.region),
    affectedDepartments: affectedDepartments.map((item) => item.department),
    ownership: {
      manager: assignedManager,
      team: assignedTeam,
      agent: assignedAgent,
    },
    currentCycle: workCycles[0] ? mapCycle(workCycles[0], true, ticket) : null,
  };
}
