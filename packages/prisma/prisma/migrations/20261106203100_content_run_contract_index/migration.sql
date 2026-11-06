-- Storyboard and remix lists read a brand's runs of one contract, newest
-- first. Build without blocking run writes; keep this as the migration's only
-- statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "content_runs_contract_idx"
  ON "content_runs" ("organizationId", "brandId", "contract", "updatedAt" DESC)
  WHERE "isDeleted" = false AND "contract" IS NOT NULL;
