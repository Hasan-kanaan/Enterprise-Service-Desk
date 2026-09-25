ALTER TABLE "TicketMessage" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "TicketInternalNote" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE TABLE "Attachment" (
 "id" SERIAL PRIMARY KEY,
 "ticketId" INTEGER REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "messageId" INTEGER REFERENCES "TicketMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "internalNoteId" INTEGER REFERENCES "TicketInternalNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "uploaderId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "filename" VARCHAR(200) NOT NULL,
 "contentType" VARCHAR(100) NOT NULL,
 "byteSize" INTEGER NOT NULL,
 "storageKey" UUID NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "deletedAt" TIMESTAMP(3),
 CONSTRAINT "Attachment_exactly_one_parent" CHECK (num_nonnulls("ticketId", "messageId", "internalNoteId") = 1),
 CONSTRAINT "Attachment_ticket_immutable" CHECK ("ticketId" IS NULL OR "deletedAt" IS NULL),
 CONSTRAINT "Attachment_size" CHECK ("byteSize" >= 0 AND "byteSize" <= 10485760)
);
CREATE UNIQUE INDEX "Attachment_storageKey_key" ON "Attachment"("storageKey");
CREATE INDEX "Attachment_ticketId_idx" ON "Attachment"("ticketId");
CREATE INDEX "Attachment_messageId_idx" ON "Attachment"("messageId");
CREATE INDEX "Attachment_internalNoteId_idx" ON "Attachment"("internalNoteId");
CREATE INDEX "Attachment_uploaderId_idx" ON "Attachment"("uploaderId");
