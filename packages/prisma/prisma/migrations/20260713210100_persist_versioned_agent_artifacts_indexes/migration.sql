-- Keep the hot posts-table index build outside a transaction so normal writes
-- can continue while PostgreSQL builds it.

CREATE INDEX CONCURRENTLY "posts_reviewVersionPinId_idx"
ON "posts"("reviewVersionPinId");

CREATE INDEX CONCURRENTLY "content_drafts_approvedVersionPinId_idx"
ON "content_drafts"("approvedVersionPinId");

CREATE INDEX CONCURRENTLY "newsletters_approvedVersionPinId_idx"
ON "newsletters"("approvedVersionPinId");
