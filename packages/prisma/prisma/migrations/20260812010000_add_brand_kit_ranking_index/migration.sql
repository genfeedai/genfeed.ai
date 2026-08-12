-- Support the cold-bootstrap brand-kit resolver's single ranked Asset read.
--
-- Query shape:
--   WHERE "parentOrgId" = $1
--     AND "parentBrandId" = ANY($2)
--     AND "category" = ANY($3)
--     AND "isDeleted" = false
--     AND "parentType" = 'BRAND'
--   PARTITION BY "parentBrandId", "category"
--   ORDER BY "updatedAt" DESC, "id" ASC
--
-- The existing (parentOrgId, parentBrandId, updatedAt DESC) index stops before
-- category and the deterministic id tie-breaker. The desktop-sync
-- (parentOrgId, updatedAt, id) index does not preserve brand/category ranking.
-- A full index with isDeleted and parentType as keys would also retain every
-- non-brand/deleted row. This partial index keeps only the live BRAND working
-- set and uses the smallest key sequence that matches the scope, window
-- partition, and deterministic ranking order. Projected payload columns stay
-- out of the index to avoid write amplification for an index-only scan that is
-- not required by the bounded bootstrap read.
--
-- Partial indexes are raw-SQL-only in Prisma. schema.prisma documents this
-- index beside Asset instead of declaring a redundant full @@index.
--
-- Built CONCURRENTLY because assets takes continuous upload/import writes.
-- This migration intentionally contains only the bare concurrent index build.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "assets_brand_kit_ranking_idx"
  ON "assets" ("parentOrgId", "parentBrandId", "category", "updatedAt" DESC, "id" ASC)
  WHERE "isDeleted" = false AND "parentType" = 'BRAND'::"AssetParent";
