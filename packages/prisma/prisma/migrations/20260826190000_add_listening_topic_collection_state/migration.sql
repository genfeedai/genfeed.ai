-- Durable, recoverable per-source collection state for listening topics (#1795).

ALTER TABLE "listening_topic_sources"
  ADD COLUMN "collectionState" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN "collectionCursor" TEXT,
  ADD COLUMN "lastCollectedAt" TIMESTAMP(3),
  ADD COLUMN "lastCollectionError" TEXT,
  ADD COLUMN "rateLimitedAt" TIMESTAMP(3);

ALTER TABLE "listening_topic_sources"
  ADD CONSTRAINT "listening_topic_sources_collection_state_check"
  CHECK ("collectionState" IN ('pending', 'success', 'empty', 'failed', 'rate_limited'));
