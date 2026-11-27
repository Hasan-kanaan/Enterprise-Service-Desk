ALTER TABLE "CompanyKnowledgeDocumentVersion"
    ADD COLUMN "processingWorkerId" UUID,
    ADD COLUMN "processingLeaseToken" UUID,
    ADD COLUMN "processingLeaseExpiresAt" TIMESTAMP(3),
    ADD COLUMN "processingError" VARCHAR(500),
    ADD CONSTRAINT "CompanyKnowledgeDocumentVersion_processing_lease"
        CHECK (
            (
                "status" = 'PROCESSING'
                AND "processingWorkerId" IS NOT NULL
                AND "processingLeaseToken" IS NOT NULL
                AND "processingLeaseExpiresAt" IS NOT NULL
            )
            OR (
                "status" <> 'PROCESSING'
                AND "processingWorkerId" IS NULL
                AND "processingLeaseToken" IS NULL
                AND "processingLeaseExpiresAt" IS NULL
            )
        );

CREATE TABLE "CompanyKnowledgeExtractedText" (
    "id" SERIAL NOT NULL,
    "versionId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompanyKnowledgeExtractedText_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanyKnowledgeExtractedText_versionId_key"
    ON "CompanyKnowledgeExtractedText"("versionId");

ALTER TABLE "CompanyKnowledgeExtractedText"
    ADD CONSTRAINT "CompanyKnowledgeExtractedText_versionId_fkey"
    FOREIGN KEY ("versionId") REFERENCES "CompanyKnowledgeDocumentVersion"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
