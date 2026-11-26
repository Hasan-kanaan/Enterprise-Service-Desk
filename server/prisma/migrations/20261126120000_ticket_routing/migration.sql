CREATE TYPE "TicketRoutingStrategy" AS ENUM ('EQUAL_ROUND_ROBIN', 'LEAST_ACTIVE_TICKETS');

CREATE TABLE "TicketRoutingConfiguration" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "strategy" "TicketRoutingStrategy" NOT NULL DEFAULT 'EQUAL_ROUND_ROBIN',
    "lastAssignedManagerId" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketRoutingConfiguration_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TicketRoutingConfiguration_singleton_id_check" CHECK ("id" = 1)
);

INSERT INTO "TicketRoutingConfiguration" ("id", "enabled", "strategy")
VALUES (1, false, 'EQUAL_ROUND_ROBIN');

CREATE TABLE "TicketCategorySpecialty" (
    "categoryId" INTEGER NOT NULL,
    "specialtyId" INTEGER NOT NULL,
    CONSTRAINT "TicketCategorySpecialty_pkey" PRIMARY KEY ("categoryId", "specialtyId")
);

CREATE INDEX "TicketCategorySpecialty_specialtyId_idx"
ON "TicketCategorySpecialty"("specialtyId");

ALTER TABLE "TicketCategorySpecialty"
ADD CONSTRAINT "TicketCategorySpecialty_categoryId_fkey"
FOREIGN KEY ("categoryId") REFERENCES "TicketCategory"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TicketCategorySpecialty"
ADD CONSTRAINT "TicketCategorySpecialty_specialtyId_fkey"
FOREIGN KEY ("specialtyId") REFERENCES "Specialty"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
