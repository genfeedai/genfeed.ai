-- Enable pgvector before declaring vector-backed columns or indexes. This is
-- intentionally part of migration history so shadow, CI, self-hosted, and
-- managed databases receive the same extension contract.
CREATE EXTENSION IF NOT EXISTS vector;

-- Existing rows remain NULL and are lazily re-embedded on their first
-- retrieval. The stale CLIP payload is removed from JSON immediately so data
-- remains content/metadata-only and cannot be mistaken for a usable vector.
ALTER TABLE "context_entries"
ADD COLUMN "embedding" vector(1024);

UPDATE "context_entries"
SET "data" = "data" - 'embedding'
WHERE "data" ? 'embedding';

CREATE INDEX "context_entries_embedding_hnsw_idx"
ON "context_entries"
USING hnsw ("embedding" vector_cosine_ops)
WHERE "isDeleted" = false AND "embedding" IS NOT NULL;
