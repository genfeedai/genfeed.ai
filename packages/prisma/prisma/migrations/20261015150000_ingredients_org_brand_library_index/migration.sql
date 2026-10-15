-- Supporting index for the brand Library list (GET /ingredients): offset
-- pages with their count, and keyset pages (paging=cursor).
--
-- Query shapes (IngredientsController.findAll):
--   WHERE "isDeleted" = false AND "organizationId" = $1 AND "brandId" = $2
--     AND "status" IN (...) [AND "category" = ...]
--   offset: ORDER BY "createdAt" DESC LIMIT 30 OFFSET n + COUNT(*)
--   keyset: AND "createdAt" <= $c AND ("createdAt" < $c OR "id" < $id)
--           ORDER BY "createdAt" DESC, "id" DESC LIMIT 31
--
-- No existing index leads with (organizationId, brandId), so the count did a
-- full sequential scan of this wide table. Synthetic benchmark (600k rows,
-- 300k in one org, Postgres 16): count 92 ms / 106,510 buffers → 16 ms / 650
-- buffers; page 1000 by offset 170 ms → 86 ms, by keyset 0.4 ms / 44 buffers.
-- "id" DESC matches the keyset order; the trailing status/category key
-- columns keep the count index-only.
--
-- Built CONCURRENTLY: ingredients is written continuously by generation, so
-- a blocking btree build would stall those writes. Prisma runs a migration
-- outside its transaction when the file holds only a bare CREATE INDEX
-- CONCURRENTLY statement (see 20260927120000_workflow_executions_stale_pending_sweep_index).
-- If the build fails it leaves an INVALID index of the same name; drop it
-- before retrying.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "ingredients_org_brand_library_idx"
  ON "ingredients" ("organizationId", "brandId", "isDeleted", "createdAt" DESC, "id" DESC, "status", "category");
