-- The customer activity list and its counts filter proactive agent-turn runs by
-- brand. Replaces `workflow_executions_proactive_agent_turn_idx` (dropped by a
-- later release, once no running release reads it): the run is
-- now identified by the promoted columns, and the brand stays keyed on its
-- `result` JSON path (a `brandId` column would make the execution brand-keyed
-- for relocation, and these runs live on the shared system workflow). The
-- predicate must match `buildCustomerExecutionWhere` for Postgres to use it.
-- Build without blocking execution writes; keep this as the migration's only statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "workflow_executions_proactive_turn_brand_idx"
  ON "workflow_executions" ("organizationId", (result #> '{metadata,brandId}'::text[]), "createdAt" DESC)
  WHERE "isDeleted" = false
    AND "source" = 'proactive'
    AND "canonicalId" = 'agent.turn.execute'
    AND "strategyId" IS NOT NULL;
