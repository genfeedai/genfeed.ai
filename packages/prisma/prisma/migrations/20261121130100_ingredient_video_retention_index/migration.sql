-- Video retention sweep: `WHERE category IN (VIDEO, VIDEO_EDIT) AND isDeleted = false
-- AND storageExpiredAt IS NULL AND createdAt < ? ORDER BY createdAt, id`. The partial
-- index holds only videos whose file still exists, so it shrinks as the sweep runs.
-- One concurrent build per migration avoids an implicit multi-statement transaction.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ingredients_video_retention_idx"
ON "ingredients" ("createdAt", "id")
WHERE "isDeleted" = false
  AND "storageExpiredAt" IS NULL
  AND "category" IN ('VIDEO', 'VIDEO_EDIT');
