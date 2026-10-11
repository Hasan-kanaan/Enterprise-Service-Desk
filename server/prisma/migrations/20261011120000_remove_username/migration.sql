-- All User foreign keys and historical attribution reference User.id.
-- Preserve valid display names; use the former name once for legacy missing values.
BEGIN;
UPDATE "User" SET "displayName" = COALESCE(NULLIF(BTRIM("username"), ''), 'Account')
WHERE "displayName" IS NULL OR BTRIM("displayName") = '';
ALTER TABLE "User" ALTER COLUMN "displayName" SET NOT NULL;
ALTER TABLE "User" ADD CONSTRAINT "User_displayName_nonblank" CHECK (BTRIM("displayName") <> '');
DROP INDEX "User_username_key";
ALTER TABLE "User" DROP COLUMN "username";
COMMIT;
