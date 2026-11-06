-- Refresh dedupe: finds the stored row for each fetched sound by its sound id.
-- One statement, CONCURRENTLY: Prisma runs a single-statement migration outside
-- a transaction block.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "trending_sounds_lookup_idx" ON "trending_sounds" ("lookupKey") WHERE "isDeleted" = false;
