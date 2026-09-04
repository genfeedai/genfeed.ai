-- Persist provider-confirmed publication side effects atomically with the
-- post transition so activity and recurrence work can be retried safely.

CREATE TABLE IF NOT EXISTS "post_publish_finalizations" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "result" JSONB NOT NULL,
  "source" TEXT NOT NULL,
  "activityCompletedAt" TIMESTAMP(3),
  "recurrenceCompletedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "post_publish_finalizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "post_publish_finalizations_org_post_key"
  ON "post_publish_finalizations" ("organizationId", "postId");

CREATE INDEX IF NOT EXISTS "post_publish_finalizations_pending_idx"
  ON "post_publish_finalizations" ("completedAt", "updatedAt");

ALTER TABLE "post_publish_finalizations"
  DROP CONSTRAINT IF EXISTS "post_publish_finalizations_organizationId_fkey",
  ADD CONSTRAINT "post_publish_finalizations_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "post_publish_finalizations"
  DROP CONSTRAINT IF EXISTS "post_publish_finalizations_postId_fkey",
  ADD CONSTRAINT "post_publish_finalizations_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES "posts"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
