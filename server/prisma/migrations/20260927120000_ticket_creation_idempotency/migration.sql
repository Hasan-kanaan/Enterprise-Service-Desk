ALTER TABLE "Ticket" ADD COLUMN "clientRequestId" VARCHAR(128), ADD COLUMN "creationHash" VARCHAR(64);
CREATE UNIQUE INDEX "Ticket_requesterId_clientRequestId_key" ON "Ticket"("requesterId", "clientRequestId");
ALTER TABLE "User" ADD COLUMN "passwordChangeRequired" BOOLEAN NOT NULL DEFAULT false;
