-- Support deterministic, tenant-scoped reference resolution by semantic role.
--
-- Partial indexes are raw-SQL-only in Prisma. This migration intentionally
-- contains only the bare concurrent index build because Prisma 7 wraps regular
-- schema migrations in a transaction and PostgreSQL rejects CREATE INDEX
-- CONCURRENTLY inside one.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "assets_brand_reference_category_idx"
  ON "assets" (
    "parentOrgId",
    "parentBrandId",
    "referenceCategory",
    "updatedAt" DESC,
    "id" ASC
  )
  WHERE "isDeleted" = false
    AND "parentType" = 'BRAND'::"AssetParent"
    AND "category" = 'REFERENCE'::"AssetCategory";
