-- CreateTable
CREATE TABLE "TicketTag" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TicketTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TicketTagOnTicket" (
    "ticketId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketTagOnTicket_pkey" PRIMARY KEY ("ticketId", "tagId")
);

CREATE TABLE "TicketSuggestedTag" (
    "ticketId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketSuggestedTag_pkey" PRIMARY KEY ("ticketId", "tagId")
);

-- CreateIndex
CREATE UNIQUE INDEX "TicketTag_name_key" ON "TicketTag"("name");
CREATE INDEX "TicketTagOnTicket_tagId_idx" ON "TicketTagOnTicket"("tagId");
CREATE INDEX "TicketSuggestedTag_tagId_idx" ON "TicketSuggestedTag"("tagId");

-- AddForeignKey
ALTER TABLE "TicketTagOnTicket" ADD CONSTRAINT "TicketTagOnTicket_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketTagOnTicket" ADD CONSTRAINT "TicketTagOnTicket_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "TicketTag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TicketSuggestedTag" ADD CONSTRAINT "TicketSuggestedTag_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketSuggestedTag" ADD CONSTRAINT "TicketSuggestedTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "TicketTag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;