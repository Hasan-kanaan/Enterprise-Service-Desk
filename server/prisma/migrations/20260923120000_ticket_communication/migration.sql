-- CreateTable
CREATE TABLE "TicketMessage" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "createdInCycleId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "content" VARCHAR(4000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),
    "clientRequestId" UUID NOT NULL,
    "creationHash" CHAR(64) NOT NULL,

    CONSTRAINT "TicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketInternalNote" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "createdInCycleId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "content" VARCHAR(4000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),
    "clientRequestId" UUID NOT NULL,
    "creationHash" CHAR(64) NOT NULL,

    CONSTRAINT "TicketInternalNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketMessage_ticketId_id_idx" ON "TicketMessage"("ticketId", "id");

-- CreateIndex
CREATE INDEX "TicketMessage_createdInCycleId_ticketId_idx" ON "TicketMessage"("createdInCycleId", "ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketMessage_authorId_clientRequestId_key" ON "TicketMessage"("authorId", "clientRequestId");

-- CreateIndex
CREATE INDEX "TicketInternalNote_ticketId_id_idx" ON "TicketInternalNote"("ticketId", "id");

-- CreateIndex
CREATE INDEX "TicketInternalNote_createdInCycleId_ticketId_idx" ON "TicketInternalNote"("createdInCycleId", "ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketInternalNote_authorId_clientRequestId_key" ON "TicketInternalNote"("authorId", "clientRequestId");

-- AddForeignKey
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_createdInCycleId_ticketId_fkey" FOREIGN KEY ("createdInCycleId", "ticketId") REFERENCES "TicketWorkCycle"("id", "ticketId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketInternalNote" ADD CONSTRAINT "TicketInternalNote_createdInCycleId_ticketId_fkey" FOREIGN KEY ("createdInCycleId", "ticketId") REFERENCES "TicketWorkCycle"("id", "ticketId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketInternalNote" ADD CONSTRAINT "TicketInternalNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

