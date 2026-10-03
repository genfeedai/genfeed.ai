-- Record each provider publish attempt for a post occurrence before the
-- provider call, so a failed learning-fenced state transition replays the
-- accepted result and an unresolved attempt is never published twice (#5882).

CREATE TABLE IF NOT EXISTS "post_provider_publish_receipts" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "workflowExecutionId" TEXT NOT NULL,
  "occurrenceKey" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "externalId" TEXT,
  "result" JSONB,
  "persistedAt" TIMESTAMP(3),
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "post_provider_publish_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "post_provider_publish_receipts_attempt_key"
  ON "post_provider_publish_receipts" ("organizationId", "postId", "workflowExecutionId");

CREATE INDEX IF NOT EXISTS "post_provider_publish_receipts_occurrence_idx"
  ON "post_provider_publish_receipts" ("organizationId", "postId", "occurrenceKey", "isDeleted");

ALTER TABLE "post_provider_publish_receipts"
  DROP CONSTRAINT IF EXISTS "post_provider_publish_receipts_organizationId_fkey",
  ADD CONSTRAINT "post_provider_publish_receipts_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "post_provider_publish_receipts"
  DROP CONSTRAINT IF EXISTS "post_provider_publish_receipts_postId_fkey",
  ADD CONSTRAINT "post_provider_publish_receipts_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES "posts"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
