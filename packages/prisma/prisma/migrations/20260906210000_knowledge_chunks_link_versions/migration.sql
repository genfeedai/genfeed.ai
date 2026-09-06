-- Knowledge ingestion writes retrievable chunks into context_entries. Each
-- chunk records the exact source version it was extracted from so retrieval
-- can enforce processing, eligibility, retention and visibility per version and
-- return a durable citation. A failed ingestion keeps a safe reason on the
-- version; the reason is cleared whenever the version leaves FAILED.

ALTER TABLE "knowledge_source_versions" ADD COLUMN "processingError" TEXT;

ALTER TABLE "knowledge_source_versions"
  ADD CONSTRAINT "knowledge_source_versions_processing_error_check"
  CHECK ("processingError" IS NULL OR "processingState" = 'FAILED');

ALTER TABLE "context_entries"
  ADD COLUMN "knowledgeSourceId" TEXT,
  ADD COLUMN "knowledgeSourceVersionId" TEXT;

ALTER TABLE "context_entries"
  ADD CONSTRAINT "context_entries_knowledge_link_check"
  CHECK (("knowledgeSourceId" IS NULL) = ("knowledgeSourceVersionId" IS NULL));

-- The composite key pins a chunk to one version of one source inside the
-- chunk's own organization; a version id from another tenant or source cannot
-- be linked even with direct database access.
ALTER TABLE "context_entries"
  ADD CONSTRAINT "context_entries_knowledge_version_fkey"
  FOREIGN KEY ("knowledgeSourceVersionId", "knowledgeSourceId", "organizationId")
  REFERENCES "knowledge_source_versions"("id", "sourceId", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "context_entries_org_knowledge_source_deleted_idx"
  ON "context_entries"("organizationId", "knowledgeSourceId", "isDeleted");
