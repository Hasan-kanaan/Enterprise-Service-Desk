CREATE TABLE "UserSession" (
 "id" UUID NOT NULL, "userId" INTEGER NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "revokedAt" TIMESTAMP(3), "deviceLabel" VARCHAR(100),
 CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "RefreshToken" ADD COLUMN "sessionId" UUID;
CREATE INDEX "UserSession_userId_revokedAt_createdAt_idx" ON "UserSession"("userId", "revokedAt", "createdAt");
CREATE INDEX "RefreshToken_sessionId_revokedAt_expiresAt_idx" ON "RefreshToken"("sessionId", "revokedAt", "expiresAt");
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "UserSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Legacy rows remain historical records, without invented device/session facts.
UPDATE "RefreshToken" SET "revokedAt" = CURRENT_TIMESTAMP WHERE "revokedAt" IS NULL;
