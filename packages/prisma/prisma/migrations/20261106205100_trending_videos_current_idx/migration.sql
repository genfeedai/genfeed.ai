-- Newest current trending videos: the read lists and the expiry sweep.
-- One statement, CONCURRENTLY: Prisma runs a single-statement migration outside
-- a transaction block.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "trending_videos_current_idx" ON "trending_videos" ("createdAt" DESC) WHERE "isCurrent" = true AND "isDeleted" = false;
