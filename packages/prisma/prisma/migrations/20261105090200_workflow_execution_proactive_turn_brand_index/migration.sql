-- The customer activity list and its counts filter proactive agent-turn runs by
-- brand. Same shape as `workflow_executions_proactive_agent_turn_idx`, keyed on
-- the promoted columns instead of `result` JSON paths. The predicate must match
-- `buildCustomerExecutionWhere` for Postgres to use this index.
-- Build without blocking execution writes; keep this as the migration's only statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "workflow_executions_proactive_turn_brand_idx"
  ON "workflow_executions" ("organizationId", "brandId", "createdAt" DESC)
  WHERE "isDeleted" = false
    AND "source" = 'proactive'
    AND "canonicalId" = 'agent.turn.execute'
    AND "strategyId" IS NOT NULL;
