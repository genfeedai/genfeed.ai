-- The customer activity list and its counts filter proactive agent-turn runs by
-- brand through the result JSON. Without a matching index every proactive run
-- of the organization was read and detoasted before the page could be ordered
-- or counted. Index only those runs, keyed the way the query reads them. Build
-- without blocking execution writes; keep this as the migration's only statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "workflow_executions_proactive_agent_turn_idx"
  ON "workflow_executions" ("organizationId", (result #> '{metadata,brandId}'::text[]), "createdAt" DESC)
  WHERE "isDeleted" = false
    AND (result #> '{metadata,source}'::text[]) = '"proactive"'::jsonb
    AND (result #> '{metadata,canonicalId}'::text[]) = '"agent.turn.execute"'::jsonb
    AND (result #> '{metadata,strategyId}'::text[]) IS NOT NULL
    AND (result #> '{metadata,strategyId}'::text[]) <> 'null'::jsonb;
