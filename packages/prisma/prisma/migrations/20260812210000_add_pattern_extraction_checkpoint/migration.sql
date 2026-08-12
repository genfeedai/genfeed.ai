-- Durable (measuredAt, sourceId) checkpoint for incremental pattern extraction (#2513).
-- One daily scan pages only new/changed AdPerformance + ContentPerformance rows.
-- Does not alter ad_performance — #2511 owns that model.

CREATE TABLE IF NOT EXISTS "pattern_extraction_checkpoints" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL,
    "sourceId" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "lastRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pattern_extraction_checkpoints_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "pattern_extraction_checkpoints_source_key"
  ON "pattern_extraction_checkpoints" ("source");
