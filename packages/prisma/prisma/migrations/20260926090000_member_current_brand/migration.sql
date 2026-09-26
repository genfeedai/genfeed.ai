-- #5219: replace the ambiguous Brand.isSelected flag with a required
-- per-member invariant, Member.currentBrandId, and give ApiKey an optional
-- default brand for MCP generation tools.
--
-- Member.currentBrandId is a single-column FK to Brand.id (matching the prior
-- lastUsedBrandId convention), NOT the compound (brandId, organizationId) FK
-- used by brand-owned content elsewhere in this schema — a member row must
-- never move orgs just because a brand's organizationId changes (brand
-- relocation), so it cannot share that cascade. Org consistency is enforced
-- in application code (BrandsService.selectBrandForUser, MembersService,
-- BrandRelocationService), not a DB CHECK.

-- 1. Add the new column nullable so it can be backfilled before the NOT NULL
--    constraint lands.
ALTER TABLE "members" ADD COLUMN "currentBrandId" TEXT;

-- 2. Backfill from the isSelected data being retired: prefer a brand this
--    member's user owns and had marked isSelected, else the organization's
--    oldest non-deleted brand. Both branches exclude soft-deleted brands.
UPDATE "members" m
SET "currentBrandId" = COALESCE(
  (
    SELECT b."id" FROM "brands" b
    WHERE b."organizationId" = m."organizationId"
      AND b."userId" = m."userId"
      AND b."isSelected" = true
      AND b."isDeleted" = false
    ORDER BY b."createdAt" ASC
    LIMIT 1
  ),
  (
    SELECT b."id" FROM "brands" b
    WHERE b."organizationId" = m."organizationId"
      AND b."isDeleted" = false
    ORDER BY b."createdAt" ASC
    LIMIT 1
  )
)
WHERE m."currentBrandId" IS NULL;

-- 3. Fail loudly instead of deploying a broken invariant: every organization
--    with a member row is expected to already have at least one non-deleted
--    brand (every signup/onboarding path creates one). If this fires, the
--    listed organizations need a brand created for them before this
--    migration can proceed.
DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count FROM "members" WHERE "currentBrandId" IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION
      'members_current_brand_backfill: % member row(s) belong to an organization with no non-deleted brand; create a brand for those organizations before deploying #5219',
      orphan_count;
  END IF;
END $$;

-- 4. Enforce the invariant at the DB level.
ALTER TABLE "members" ALTER COLUMN "currentBrandId" SET NOT NULL;
ALTER TABLE "members" ADD CONSTRAINT "members_currentBrandId_fkey" FOREIGN KEY ("currentBrandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "members_current_brand_org_idx" ON "members"("currentBrandId", "organizationId");

-- 5. Retire the old nullable "last used brand" pointer — its data has already
--    been folded into currentBrandId's backfill above (recomputed from
--    isSelected, not carried over verbatim, since isSelected was the
--    authoritative "current" signal and lastUsedBrandId was a secondary,
--    sometimes-stale UI hint).
ALTER TABLE "members" DROP CONSTRAINT "members_lastUsedBrandId_fkey";
ALTER TABLE "members" DROP COLUMN "lastUsedBrandId";

-- 6. Drop the retired Brand.isSelected column — no code reads it after this
--    change (green-field, no dual-read).
ALTER TABLE "brands" DROP COLUMN "isSelected";

-- 7. ApiKey gains an optional default brand for MCP generation tools,
--    validated to the key's own organization (application code) and never
--    cascading org changes onto the key (single-column FK, same reasoning as
--    Member.currentBrandId).
ALTER TABLE "api_keys" ADD COLUMN "defaultBrandId" TEXT;
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_defaultBrandId_fkey" FOREIGN KEY ("defaultBrandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "api_keys_defaultBrandId_idx" ON "api_keys"("defaultBrandId");
