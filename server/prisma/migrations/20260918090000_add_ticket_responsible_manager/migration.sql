-- Responsibility is explicit. Existing tickets intentionally remain managerless.
ALTER TABLE "Ticket" ADD COLUMN "assignedManagerId" INTEGER;

CREATE INDEX "Ticket_assignedManagerId_idx" ON "Ticket"("assignedManagerId");
CREATE INDEX "Ticket_status_assignedManagerId_idx" ON "Ticket"("status", "assignedManagerId");

ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_assignedManagerId_fkey"
FOREIGN KEY ("assignedManagerId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
