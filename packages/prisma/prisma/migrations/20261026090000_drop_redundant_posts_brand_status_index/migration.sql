-- Prefix of posts_brand_deleted_status_created_at_idx (brandId, isDeleted, status,
-- createdAt DESC): every query the shorter index served the longer one serves.
-- Posts is the hottest write path, so each extra index costs on every insert.
-- Keep this as the migration's only statement.
DROP INDEX CONCURRENTLY IF EXISTS "posts_brandId_isDeleted_status_idx";
