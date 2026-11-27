CREATE TYPE "CompanyKnowledgeVersionStatus" AS ENUM (
    'UPLOADED',
    'PROCESSING',
    'READY_FOR_REVIEW',
    'PUBLISHED',
    'DEACTIVATED',
    'FAILED'
);

CREATE TABLE "CompanyKnowledgeDocument" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompanyKnowledgeDocument_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CompanyKnowledgeDocument_title_nonblank"
        CHECK (BTRIM("title") <> '')
);

CREATE TABLE "CompanyKnowledgeDocumentVersion" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "uploadedById" INTEGER NOT NULL,
    "originalName" VARCHAR(200) NOT NULL,
    "contentType" VARCHAR(100) NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "storageKey" UUID NOT NULL,
    "status" "CompanyKnowledgeVersionStatus" NOT NULL DEFAULT 'UPLOADED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompanyKnowledgeDocumentVersion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CompanyKnowledgeDocumentVersion_positive_version"
        CHECK ("versionNumber" > 0),
    CONSTRAINT "CompanyKnowledgeDocumentVersion_file_metadata"
        CHECK (
            "byteSize" BETWEEN 0 AND 52428800
            AND "originalName" <> ''
            AND "contentType" IN (
                'application/pdf',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'text/plain',
                'text/markdown'
            )
            AND "sha256" ~ '^[0-9a-f]{64}$'
        )
);

CREATE UNIQUE INDEX "CompanyKnowledgeDocumentVersion_storageKey_key"
    ON "CompanyKnowledgeDocumentVersion"("storageKey");
CREATE UNIQUE INDEX "CompanyKnowledgeDocumentVersion_documentId_versionNumber_key"
    ON "CompanyKnowledgeDocumentVersion"("documentId", "versionNumber");
CREATE INDEX "CompanyKnowledgeDocument_createdAt_id_idx"
    ON "CompanyKnowledgeDocument"("createdAt", "id");
CREATE INDEX "CompanyKnowledgeDocumentVersion_status_createdAt_id_idx"
    ON "CompanyKnowledgeDocumentVersion"("status", "createdAt", "id");
CREATE INDEX "CompanyKnowledgeDocumentVersion_uploadedById_idx"
    ON "CompanyKnowledgeDocumentVersion"("uploadedById");

ALTER TABLE "CompanyKnowledgeDocumentVersion"
    ADD CONSTRAINT "CompanyKnowledgeDocumentVersion_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "CompanyKnowledgeDocument"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyKnowledgeDocumentVersion"
    ADD CONSTRAINT "CompanyKnowledgeDocumentVersion_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
