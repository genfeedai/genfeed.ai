-- Add three hot-path indexes surfaced by the complexity/scalability audit:
--   * link_clicks         — had NO indexes at all. CTA analytics filters
--                           WHERE "linkId" IN (...) then groups by day
--                           (tracked-links.service.ts getContentCTAStats).
--   * credit_transactions — usage-metrics reads filter
--                           WHERE organizationId, isDeleted, category
--                           ORDER BY createdAt DESC, but both existing
--                           indexes are source-leading, not organization-leading
--                           (credit-transactions.service.ts getUsageMetrics /
--                           getLastPurchaseBaseline).
--   * members              — the Better Auth identity resolver filters
--                           WHERE userId, isActive, isDeleted on every request,
--                           but both existing composite indexes lead with
--                           organizationId (better-auth-identity-resolver.service.ts
--                           resolveFromDatabase).
--
-- Built CONCURRENTLY: all three tables are continuously written (click tracking,
-- credit deductions, membership changes), so a plain CREATE INDEX would take an
-- ACCESS EXCLUSIVE lock for the whole build and stall live writes. CONCURRENTLY
-- keeps reads/writes running.
--
-- CONCURRENTLY must run OUTSIDE a transaction block. Prisma only skips wrapping
-- a migration in a transaction when the file contains just bare CONCURRENTLY
-- index builds — so this file carries ONLY bare CONCURRENTLY builds, no DML,
-- matching the precedent 20260710120000_add_missing_fk_scoped_indexes.
--
-- `IF NOT EXISTS` makes each build a no-op where the index already exists. If a
-- build fails it leaves an INVALID index of the same name — DROP it and re-deploy;
-- do not blindly re-run.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "link_clicks_link_id_timestamp_idx"
  ON "link_clicks" ("linkId", "timestamp" DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "credit_transactions_org_deleted_category_created_at_idx"
  ON "credit_transactions" ("organizationId", "isDeleted", "category", "createdAt" DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "members_user_active_deleted_idx"
  ON "members" ("userId", "isActive", "isDeleted");
