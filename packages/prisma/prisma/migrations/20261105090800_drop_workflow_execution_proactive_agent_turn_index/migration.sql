-- Replaced by `workflow_executions_proactive_turn_brand_idx` on the promoted columns.
-- Drop without blocking execution writes; keep this as the migration's only statement.
DROP INDEX CONCURRENTLY IF EXISTS "workflow_executions_proactive_agent_turn_idx";
