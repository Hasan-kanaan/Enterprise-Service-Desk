-- Additive expression indexes supplement Prisma's ordinary unique keys.
-- Preserve display names, IDs and archived-name reservation. No data repair.
BEGIN;
LOCK TABLE "Region", "Department", "Specialty", "TicketCategory", "TicketTag", "Team" IN SHARE MODE;

DO $$
DECLARE
  catalog text;
  collision text;
BEGIN
  FOREACH catalog IN ARRAY ARRAY['Region', 'Department', 'Specialty', 'TicketCategory', 'TicketTag'] LOOP
    EXECUTE format('SELECT lower(btrim(name)) FROM %I GROUP BY lower(btrim(name)) HAVING count(*) > 1 LIMIT 1', catalog) INTO collision;
    IF collision IS NOT NULL THEN
      RAISE EXCEPTION 'Case-insensitive name collision in %: %. Resolve duplicate names explicitly before retrying this migration.', catalog, collision;
    END IF;
  END LOOP;
  SELECT lower(btrim(name)) INTO collision FROM "Team"
    GROUP BY "regionId", lower(btrim(name)) HAVING count(*) > 1 LIMIT 1;
  IF collision IS NOT NULL THEN
    RAISE EXCEPTION 'Case-insensitive Team name collision within the same region/global coverage: %. Resolve duplicates explicitly before retrying this migration.', collision;
  END IF;
END $$;

CREATE UNIQUE INDEX "Region_name_ci_key" ON "Region" (lower(btrim(name)));
CREATE UNIQUE INDEX "Department_name_ci_key" ON "Department" (lower(btrim(name)));
CREATE UNIQUE INDEX "Specialty_name_ci_key" ON "Specialty" (lower(btrim(name)));
CREATE UNIQUE INDEX "TicketCategory_name_ci_key" ON "TicketCategory" (lower(btrim(name)));
CREATE UNIQUE INDEX "TicketTag_name_ci_key" ON "TicketTag" (lower(btrim(name)));
CREATE UNIQUE INDEX "Team_name_regionId_ci_key" ON "Team" (lower(btrim(name)), "regionId");
CREATE UNIQUE INDEX "Team_global_name_ci_key" ON "Team" (lower(btrim(name))) WHERE "regionId" IS NULL;
COMMIT;
