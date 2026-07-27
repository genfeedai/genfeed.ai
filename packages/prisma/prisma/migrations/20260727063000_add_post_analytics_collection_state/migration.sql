ALTER TABLE "posts"
  ADD COLUMN "analyticsCollectionState" TEXT NOT NULL DEFAULT 'unavailable',
  ADD COLUMN "analyticsCollectionAttemptKey" TEXT,
  ADD COLUMN "analyticsCollectionRequestedAt" TIMESTAMP(3),
  ADD COLUMN "analyticsCollectedAt" TIMESTAMP(3),
  ADD COLUMN "analyticsCollectionError" JSONB;
