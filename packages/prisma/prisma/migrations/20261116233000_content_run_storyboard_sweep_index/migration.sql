-- The storyboard journal sweep reads recently touched storyboard runs across
-- organizations; the contract index leads with the organization, so it cannot
-- serve that scan. Build without blocking run writes; keep this as the
-- migration's only statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "content_runs_storyboard_sweep_idx"
  ON "content_runs" ("updatedAt" DESC)
  WHERE "isDeleted" = false AND "contract" = 'storyboard-run';
