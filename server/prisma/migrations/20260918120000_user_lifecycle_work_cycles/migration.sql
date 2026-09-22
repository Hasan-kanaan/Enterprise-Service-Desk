-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "TicketWorkCycleType" AS ENUM ('ORIGINAL', 'REOPENED');

-- CreateEnum
CREATE TYPE "TicketWorkCycleOutcome" AS ENUM ('RESOLVED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CycleStartDisposition" AS ENUM ('CONTINUE', 'RETURN_TO_INTAKE');

-- CreateEnum
CREATE TYPE "OwnershipSnapshotBasis" AS ENUM ('END_OF_WORK', 'RECORDED_AT_MIGRATION');

-- AlterEnum
ALTER TYPE "TicketStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "Subtask" ADD COLUMN     "completedById" INTEGER,
ADD COLUMN     "createdInCycleId" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "TicketWorkCycle" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "type" "TicketWorkCycleType" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "startedById" INTEGER,
    "startReason" VARCHAR(2000),
    "startDisposition" "CycleStartDisposition",
    "outcome" "TicketWorkCycleOutcome",
    "endedAt" TIMESTAMP(3),
    "endedById" INTEGER,
    "closedAt" TIMESTAMP(3),
    "closedById" INTEGER,
    "resolutionSummary" VARCHAR(4000),
    "endingManagerId" INTEGER,
    "endingTeamId" INTEGER,
    "endingAgentId" INTEGER,
    "ownershipSnapshotBasis" "OwnershipSnapshotBasis",
    "ownershipCapturedAt" TIMESTAMP(3),

    CONSTRAINT "TicketWorkCycle_pkey" PRIMARY KEY ("id")
);

-- Existing rows represent one known attempt, not reconstructed event history.
INSERT INTO "TicketWorkCycle" (
  "ticketId", "sequenceNumber", "type", "startedAt", "outcome", "endedAt", "closedAt",
  "endingManagerId", "endingTeamId", "endingAgentId", "ownershipSnapshotBasis", "ownershipCapturedAt"
)
SELECT "id", 1, 'ORIGINAL', "createdAt",
  CASE WHEN "status"::text IN ('RESOLVED', 'CLOSED') THEN "status"::text::"TicketWorkCycleOutcome" ELSE NULL END,
  "resolvedAt", "closedAt",
  CASE WHEN "status"::text IN ('RESOLVED', 'CLOSED') THEN "assignedManagerId" ELSE NULL END,
  CASE WHEN "status"::text IN ('RESOLVED', 'CLOSED') THEN "assignedTeamId" ELSE NULL END,
  CASE WHEN "status"::text IN ('RESOLVED', 'CLOSED') THEN "assignedAgentId" ELSE NULL END,
  CASE WHEN "status"::text IN ('RESOLVED', 'CLOSED') THEN 'RECORDED_AT_MIGRATION'::"OwnershipSnapshotBasis" ELSE NULL END,
  CASE WHEN "status"::text IN ('RESOLVED', 'CLOSED') THEN CURRENT_TIMESTAMP ELSE NULL END
FROM "Ticket";

UPDATE "Subtask" s SET "createdInCycleId" = c."id"
FROM "TicketWorkCycle" c WHERE c."ticketId" = s."ticketId" AND c."sequenceNumber" = 1;
ALTER TABLE "Subtask" ALTER COLUMN "createdInCycleId" SET NOT NULL;
ALTER TABLE "TicketWorkCycle" ADD CONSTRAINT "TicketWorkCycle_positive_sequence" CHECK ("sequenceNumber" > 0);

-- CreateIndex
CREATE UNIQUE INDEX "TicketWorkCycle_ticketId_sequenceNumber_key" ON "TicketWorkCycle"("ticketId", "sequenceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TicketWorkCycle_id_ticketId_key" ON "TicketWorkCycle"("id", "ticketId");

-- CreateIndex
CREATE INDEX "Subtask_createdInCycleId_ticketId_idx" ON "Subtask"("createdInCycleId", "ticketId");

-- AddForeignKey
ALTER TABLE "Subtask" ADD CONSTRAINT "Subtask_createdInCycleId_ticketId_fkey" FOREIGN KEY ("createdInCycleId", "ticketId") REFERENCES "TicketWorkCycle"("id", "ticketId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subtask" ADD CONSTRAINT "Subtask_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketWorkCycle" ADD CONSTRAINT "TicketWorkCycle_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketWorkCycle" ADD CONSTRAINT "TicketWorkCycle_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketWorkCycle" ADD CONSTRAINT "TicketWorkCycle_endedById_fkey" FOREIGN KEY ("endedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketWorkCycle" ADD CONSTRAINT "TicketWorkCycle_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketWorkCycle" ADD CONSTRAINT "TicketWorkCycle_endingManagerId_fkey" FOREIGN KEY ("endingManagerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketWorkCycle" ADD CONSTRAINT "TicketWorkCycle_endingAgentId_fkey" FOREIGN KEY ("endingAgentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketWorkCycle" ADD CONSTRAINT "TicketWorkCycle_endingTeamId_fkey" FOREIGN KEY ("endingTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

