-- Record provider-accepted publishes before the learning-fenced post
-- transition so a failed transition replays the receipt instead of publishing
-- to the provider a second time (#5882).

CREATE TABLE IF NOT EXISTS "post_provider_publish_receipts" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "workflowExecutionId" TEXT NOT NULL,
  "externalId" TEXT,
  "result" JSONB NOT NULL,
  "persistedAt" TIMESTAMP(3),
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "post_provider_publish_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "post_provider_publish_receipts_attempt_key"
  ON "post_provider_publish_receipts" ("organizationId", "postId", "workflowExecutionId");

CREATE INDEX IF NOT EXISTS "post_provider_publish_receipts_pending_idx"
  ON "post_provider_publish_receipts" ("organizationId", "postId", "persistedAt", "isDeleted");

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
