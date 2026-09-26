CREATE TYPE "TicketCloseSource" AS ENUM ('MANUAL', 'AUTO_TIMEOUT');

-- Unknown historical sources remain NULL; do not infer actors or backfill.
ALTER TABLE "TicketWorkCycle" ADD COLUMN "closeSource" "TicketCloseSource";

CREATE INDEX "Ticket_status_resolvedAt_idx" ON "Ticket"("status", "resolvedAt");
