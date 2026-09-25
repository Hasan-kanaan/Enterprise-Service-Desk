-- Lookup retained personal evidence without scanning unrelated historical work.
CREATE INDEX "TicketWorkCycle_endingManagerId_endedAt_id_idx" ON "TicketWorkCycle"("endingManagerId", "endedAt", "id");
CREATE INDEX "TicketWorkCycle_endingAgentId_endedAt_id_idx" ON "TicketWorkCycle"("endingAgentId", "endedAt", "id");
CREATE INDEX "TicketWorkCycle_endedById_endedAt_id_idx" ON "TicketWorkCycle"("endedById", "endedAt", "id");
CREATE INDEX "TicketWorkCycle_closedById_closedAt_id_idx" ON "TicketWorkCycle"("closedById", "closedAt", "id");
CREATE INDEX "TicketWorkCycle_startedById_endedAt_id_idx" ON "TicketWorkCycle"("startedById", "endedAt", "id");
CREATE INDEX "Subtask_completedById_completedAt_id_idx" ON "Subtask"("completedById", "completedAt", "id");
