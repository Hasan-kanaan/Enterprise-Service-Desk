-- Replace filtering-only indexes with ordered queue indexes; no data changes.
CREATE INDEX "Ticket_requesterId_createdAt_id_idx" ON "Ticket"("requesterId", "createdAt", "id");
DROP INDEX "Ticket_requesterId_idx";
CREATE INDEX "Ticket_assignedManagerId_createdAt_id_idx" ON "Ticket"("assignedManagerId", "createdAt", "id");
DROP INDEX "Ticket_assignedManagerId_idx";
CREATE INDEX "Ticket_assignedTeamId_createdAt_id_idx" ON "Ticket"("assignedTeamId", "createdAt", "id");
DROP INDEX "Ticket_assignedTeamId_idx";
CREATE INDEX "Ticket_assignedAgentId_createdAt_id_idx" ON "Ticket"("assignedAgentId", "createdAt", "id");
DROP INDEX "Ticket_assignedAgentId_idx";
CREATE INDEX "Ticket_status_assignedManagerId_createdAt_id_idx" ON "Ticket"("status", "assignedManagerId", "createdAt", "id");
DROP INDEX "Ticket_status_assignedManagerId_idx";
CREATE INDEX "Ticket_createdAt_id_idx" ON "Ticket"("createdAt", "id");
CREATE INDEX "User_role_status_id_idx" ON "User"("role", "status", "id");
