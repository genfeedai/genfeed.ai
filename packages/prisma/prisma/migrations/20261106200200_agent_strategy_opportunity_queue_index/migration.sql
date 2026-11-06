-- The autopilot and the opportunity list read a strategy's opportunities by
-- status. Build without blocking opportunity writes; keep this as the
-- migration's only statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_strategy_opportunities_queue_idx"
  ON "agent_strategy_opportunities" ("organizationId", "strategyId", "status")
  WHERE "isDeleted" = false;
