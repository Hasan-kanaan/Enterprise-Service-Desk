CREATE UNIQUE INDEX "Team_global_name_key"
ON "Team" ("name")
WHERE "regionId" IS NULL;
