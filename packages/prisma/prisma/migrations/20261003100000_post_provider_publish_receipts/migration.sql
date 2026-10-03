-- Reserve each provider publish attempt for a post occurrence before the
-- provider call. A failed learning-fenced state transition replays the accepted
-- result, and concurrent deliveries of one occurrence never both publish (#5882).

CREATE TABLE IF NOT EXISTS "post_provider_publish_receipts" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "occurrenceKey" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "workflowExecutionId" TEXT NOT NULL,
  "attemptToken" TEXT NOT NULL,
  "attemptStartedAt" TIMESTAMP(3) NOT NULL,
  "externalId" TEXT,
  "result" JSONB,
  "persistedAt" TIMESTAMP(3),
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "post_provider_publish_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "post_provider_publish_receipts_occurrence_key"
  ON "post_provider_publish_receipts" ("organizationId", "postId", "occurrenceKey");

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
