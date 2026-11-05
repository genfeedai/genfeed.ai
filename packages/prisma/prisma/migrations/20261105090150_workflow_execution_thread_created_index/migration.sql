-- The thread list reads the newest executions of a set of threads
-- (`AgentThreadsService.findExecutionsByThreadIds`), filtered by thread only and
-- ordered by `createdAt`. `workflow_executions_thread_idx` puts `canonicalId`
-- before `createdAt` for the snapshot poll, so it cannot return one thread's
-- rows in time order; this index can, keyed on the promoted column. It replaces
-- `workflow_executions_agent_thread_lookup_idx`, which a later release drops.
-- Build without blocking execution writes; keep this as the migration's only statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "workflow_executions_thread_created_idx"
  ON "workflow_executions" ("organizationId", "isDeleted", "threadId", "createdAt" DESC, "id" DESC);
