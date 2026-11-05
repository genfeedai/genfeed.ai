-- Proactive dispatch failure handling looks an execution up by `dispatchId`
-- inside the strategy lock. Only proactive dispatches carry one, so a partial
-- index stays small.
-- Build without blocking execution writes; keep this as the migration's only statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "workflow_executions_dispatch_id_idx"
  ON "workflow_executions" ("organizationId", "dispatchId")
  WHERE "dispatchId" IS NOT NULL;
