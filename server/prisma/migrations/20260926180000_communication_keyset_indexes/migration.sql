DROP INDEX "TicketMessage_ticketId_id_idx";
DROP INDEX "TicketInternalNote_ticketId_id_idx";
CREATE INDEX "TicketMessage_ticketId_createdAt_id_idx" ON "TicketMessage"("ticketId", "createdAt", "id");
CREATE INDEX "TicketInternalNote_ticketId_createdAt_id_idx" ON "TicketInternalNote"("ticketId", "createdAt", "id");
