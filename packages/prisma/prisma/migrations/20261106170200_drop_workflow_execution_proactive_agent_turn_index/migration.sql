-- Replaced by `workflow_executions_proactive_turn_brand_idx`, whose predicate
-- reads the promoted `source`, `canonicalId` and `strategyId` columns
-- (20261105090200, shipped in v0.2.26). No running release filters on the old
-- JSON predicate any more. Keep this as the migration's only statement.
DROP INDEX CONCURRENTLY IF EXISTS "workflow_executions_proactive_agent_turn_idx";
