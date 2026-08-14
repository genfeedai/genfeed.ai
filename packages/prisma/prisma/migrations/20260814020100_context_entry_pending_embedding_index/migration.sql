-- Partial index for the pending-embedding claim sweep (#2457).
--
-- Query shape: ContextsService.rebuildMissingEntryEmbeddings claims rows via
--   WHERE organizationId = $org
--     AND contextBaseId IN (...)
--     AND isDeleted = false
--     AND embedding IS NULL
--     AND embeddingFailedAt IS NULL
--   ORDER BY createdAt ASC
--   LIMIT 50
--   FOR UPDATE SKIP LOCKED
--
-- Built CONCURRENTLY: context_entries is read on the generation hot path, so
-- a blocking btree build would stall retrieval. Prisma can execute a
-- migration outside its transaction when the file contains only bare
-- CREATE INDEX CONCURRENTLY statements (see
-- 20260811170000_agent_messages_cursor_index_id_desc).
--
-- `IF NOT EXISTS` makes the build a no-op if already applied. If the build
-- fails it leaves an INVALID index of the same name — drop it before retrying.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "context_entries_pending_embedding_claim_idx"
  ON "context_entries" ("organizationId", "contextBaseId", "createdAt")
  WHERE "isDeleted" = false
    AND "embedding" IS NULL
    AND "embeddingFailedAt" IS NULL;
