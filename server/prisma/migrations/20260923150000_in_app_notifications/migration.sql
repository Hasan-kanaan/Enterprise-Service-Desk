-- Additive only: existing tickets and messages produce no historical notifications.
CREATE TYPE "NotificationType" AS ENUM ('PRIMARY_AGENT_ASSIGNED', 'SUBTASK_ASSIGNED', 'REQUESTER_MESSAGE', 'SUPPORT_MESSAGE', 'WAITING_FOR_EMPLOYEE', 'RESOLVED', 'REOPENED', 'MANAGER_TRANSFERRED');

CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "recipientUserId" INTEGER NOT NULL,
    "type" "NotificationType" NOT NULL,
    "actorUserId" INTEGER,
    "ticketId" INTEGER,
    "subtaskId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Notification_recipientUserId_createdAt_id_idx" ON "Notification"("recipientUserId", "createdAt", "id");
CREATE INDEX "Notification_recipientUserId_readAt_idx" ON "Notification"("recipientUserId", "readAt");
CREATE INDEX "Notification_actorUserId_idx" ON "Notification"("actorUserId");
CREATE INDEX "Notification_ticketId_idx" ON "Notification"("ticketId");
CREATE INDEX "Notification_subtaskId_idx" ON "Notification"("subtaskId");

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_subtaskId_fkey" FOREIGN KEY ("subtaskId") REFERENCES "Subtask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
