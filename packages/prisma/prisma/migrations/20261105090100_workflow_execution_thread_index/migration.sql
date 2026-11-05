-- Agent thread lookups (`AgentThreadsService` latest-execution scan and
-- `readThreadWorkflowSnapshot`) now filter on the promoted `threadId` and
-- `canonicalId` columns. One plain index replaces the two JSONB expression
-- indexes that served them; those are dropped in the next migrations.
-- Build without blocking execution writes; keep this as the migration's only statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "workflow_executions_thread_idx"
  ON "workflow_executions" ("organizationId", "isDeleted", "threadId", "canonicalId", "createdAt" DESC, "id" DESC);
