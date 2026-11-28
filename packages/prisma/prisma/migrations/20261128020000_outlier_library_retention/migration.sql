-- Retention of the outlier library (#11644). Expand only: one defaulted column
-- and one index on the empty-to-small outlier_posts table.

ALTER TABLE "outlier_posts"
  ADD COLUMN IF NOT EXISTS "missedReads" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "outlier_posts_isDeleted_countsReadAt_idx"
  ON "outlier_posts" ("isDeleted", "countsReadAt");
