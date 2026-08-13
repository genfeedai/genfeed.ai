-- Durable claim / fail timestamps for the retrieval hot-path embedding
-- backfill (#2457). Concurrent requests claim a bounded batch instead of
-- all calling the embedding provider for the same pending rows. Empty
-- content and provider failures set embeddingFailedAt so they never retry
-- on every retrieval.
--
-- The tenant btree is a cheap prefilter for both the claim sweep and the
-- similarity query's organizationId + contextBaseId predicates. HNSW stays
-- vector-only; recall for small tenants is recovered with
-- hnsw.iterative_scan (transaction-local) in ContextsService, not by stuffing
-- organizationId into the HNSW key.

ALTER TABLE "context_entries"
  ADD COLUMN "embeddingClaimedAt" TIMESTAMP(3),
  ADD COLUMN "embeddingFailedAt" TIMESTAMP(3);

CREATE INDEX "context_entries_org_base_deleted_idx"
  ON "context_entries" ("organizationId", "contextBaseId", "isDeleted");
