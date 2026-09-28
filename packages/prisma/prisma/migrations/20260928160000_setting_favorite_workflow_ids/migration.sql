-- Per-user favorite workflows (#5510).
--
-- Mirrors `favoriteModelKeys`: a text array defaulting to empty. Existing rows
-- start with no favorites, so no backfill is needed. Ids are validated against
-- the caller's organization on write and pruned of deleted workflows on read.
ALTER TABLE "settings"
  ADD COLUMN "favoriteWorkflowIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
