-- Newest current trending sounds: the read list and the expiry sweep.
-- One statement, CONCURRENTLY: Prisma runs a single-statement migration outside
-- a transaction block.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "trending_sounds_current_idx" ON "trending_sounds" ("createdAt" DESC) WHERE "isCurrent" = true AND "isDeleted" = false;
