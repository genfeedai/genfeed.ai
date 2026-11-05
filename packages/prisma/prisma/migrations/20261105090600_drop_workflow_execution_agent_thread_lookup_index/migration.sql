-- Replaced by `workflow_executions_thread_idx` on the promoted columns.
-- Drop without blocking execution writes; keep this as the migration's only statement.
DROP INDEX CONCURRENTLY IF EXISTS "workflow_executions_agent_thread_lookup_idx";
