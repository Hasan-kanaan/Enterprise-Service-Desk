const hours = Number(process.env.AUTO_CLOSE_AFTER_HOURS ?? 72);
if (!Number.isFinite(hours) || hours <= 0 || hours > 87600) {
  throw new Error('AUTO_CLOSE_AFTER_HOURS must be positive and at most 87600');
}

export const AUTO_CLOSE_AFTER_MS = hours * 60 * 60 * 1000;

export function autoCloseAt(ticket: {
  status: string;
  resolvedAt: Date | null;
}) {
  return ticket.status === 'RESOLVED' && ticket.resolvedAt
    ? new Date(ticket.resolvedAt.getTime() + AUTO_CLOSE_AFTER_MS)
    : null;
}
