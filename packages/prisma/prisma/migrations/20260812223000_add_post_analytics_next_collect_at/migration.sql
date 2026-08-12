-- Due-time checkpoint for the analytics refresh producer (#2514).
-- Existing published rows become due immediately so the first hourly run
-- after deploy collects once, then writes the next collect time.
ALTER TABLE "posts"
  ADD COLUMN "analyticsNextCollectAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "posts_analytics_due_idx"
  ON "posts" (
    "organizationId",
    "isDeleted",
    "targetExecutionState",
    "platform",
    "analyticsNextCollectAt",
    "id"
  );
