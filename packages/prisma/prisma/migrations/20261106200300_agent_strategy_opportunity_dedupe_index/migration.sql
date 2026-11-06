-- New opportunities are deduped by strategy, source type and topic before
-- insert. `topic` is free text with no length bound, so it stays out of the
-- key (a long one would fail the insert); the strategy and source type narrow
-- the candidates enough. Build without blocking opportunity writes; keep this
-- as the migration's only statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_strategy_opportunities_dedupe_idx"
  ON "agent_strategy_opportunities" ("organizationId", "strategyId", "sourceType")
  WHERE "isDeleted" = false;
