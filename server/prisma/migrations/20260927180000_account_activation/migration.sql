ALTER TABLE "User" ALTER COLUMN "password" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN "activatedAt" TIMESTAMP(3), ADD COLUMN "emailVerifiedAt" TIMESTAMP(3), ADD COLUMN "phoneNumber" VARCHAR(16), ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);
UPDATE "User" SET "activatedAt" = "createdAt" WHERE "password" IS NOT NULL;
CREATE TYPE "AccountActionType" AS ENUM ('ACCOUNT_ACTIVATION', 'PASSWORD_RESET');
CREATE TABLE "AccountActionToken" (
 "id" SERIAL PRIMARY KEY, "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "type" "AccountActionType" NOT NULL, "tokenHash" VARCHAR(64) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL,
 "usedAt" TIMESTAMP(3), "revokedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "AccountActionToken_tokenHash_key" ON "AccountActionToken"("tokenHash");
CREATE INDEX "AccountActionToken_userId_type_createdAt_idx" ON "AccountActionToken"("userId", "type", "createdAt");
