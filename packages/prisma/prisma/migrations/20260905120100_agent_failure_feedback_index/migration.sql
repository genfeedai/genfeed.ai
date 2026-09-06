CREATE INDEX CONCURRENTLY IF NOT EXISTS "workflow_executions_failure_feed_idx"
  ON "workflow_executions" ("status", "isDeleted", "failureReason", "completedAt" DESC, "id");
