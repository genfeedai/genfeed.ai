-- Owner lease for an in-flight research collection. A duplicate caller must
-- not finish the row, or release its reservation, while this lease is active.
-- An empty actor-run list is not evidence the start was rejected.

ALTER TABLE "research_collection_jobs"
  ADD COLUMN "leaseToken" TEXT,
  ADD COLUMN "leaseExpiresAt" TIMESTAMP(3);
