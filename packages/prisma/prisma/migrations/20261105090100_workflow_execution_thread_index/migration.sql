-- The thread workflow snapshot (`readThreadWorkflowSnapshot`) now filters on
-- the promoted `threadId` and `canonicalId` columns. This plain index replaces
-- `workflow_executions_thread_snapshot_idx`, which a later release drops once
-- no running release queries the JSON paths.
-- Build without blocking execution writes; keep this as the migration's only statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "workflow_executions_thread_idx"
  ON "workflow_executions" ("organizationId", "isDeleted", "threadId", "canonicalId", "createdAt" DESC, "id" DESC);
