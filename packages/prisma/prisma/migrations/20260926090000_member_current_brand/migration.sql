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

-- 2a. #5291: v0.1.76's BrandsService.remove had no last-brand guard, and
--     brand relocation can empty an org, so some organizations that still
--     have member rows (including soft-deleted members, and members of
--     soft-deleted orgs) have zero brand rows at all — not even a
--     soft-deleted one. Give each such organization a minimal placeholder
--     brand before the backfill below runs, so every member ends up with a
--     real, referenceable currentBrandId instead of aborting the migration.
--     `gen_random_uuid()` (same as 20260812220000's fallback id) keeps the id
--     a valid Genfeed entity id (packages/contracts's isEntityId only accepts
--     UUID/CUID/CUID2/ULID) — not a deterministic id, which this app's own
--     brand ids never are. Idempotency instead comes from the "org has no
--     brand rows at all" NOT EXISTS guard: a rerun only ever considers
--     organizations that still have none. The slug stays deterministic per
--     org (org id is unique, and Brand.slug is unique across all brands) so
--     a rerun can't collide on it either.
INSERT INTO "brands" (
  "id",
  "organizationId",
  "slug",
  "label",
  "fontFamily",
  "primaryColor",
  "secondaryColor",
  "backgroundColor",
  "referenceImages",
  "isSelected",
  "scope",
  "isActive",
  "isDefault",
  "isDeleted",
  "isHighlighted",
  "isFleetEnabled",
  "agentConfig",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  orgs."organizationId",
  'placeholder-' || orgs."organizationId",
  'Placeholder Brand',
  'MONTSERRAT_BLACK'::"FontFamily",
  '#000000',
  '#FFFFFF',
  'transparent',
  '[]'::JSONB,
  false,
  'USER'::"AssetScope",
  true,
  false,
  false,
  false,
  false,
  '{}'::JSONB,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT m."organizationId"
  FROM "members" m
  WHERE NOT EXISTS (
    SELECT 1 FROM "brands" b WHERE b."organizationId" = m."organizationId"
  )
) orgs;

-- 2b. Backfill from the isSelected data being retired: prefer a brand this
--     member's user owns and had marked isSelected (excluding soft-deleted
--     brands), else the organization's oldest non-deleted brand (this now
--     also matches the placeholder brand inserted in 2a for organizations
--     that had none), else — #5291 — the organization's oldest brand at all,
--     even a soft-deleted one, for organizations whose only brands are
--     soft-deleted. The FK only needs the row to exist; it does not require
--     the brand to be live.
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
  ),
  (
    SELECT b."id" FROM "brands" b
    WHERE b."organizationId" = m."organizationId"
    ORDER BY b."createdAt" ASC
    LIMIT 1
  )
)
WHERE m."currentBrandId" IS NULL;

-- 3. Fail loudly instead of deploying a broken invariant. 2a/2b above cover
--    every historical shape (no brands at all, only soft-deleted brands, or
--    a live brand) for any organization with a member row, so this should
--    never fire; keep it as a safety net in case a member row references an
--    organization that does not exist at all (a pre-existing FK integrity
--    issue out of scope for #5291/#5219).
DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count FROM "members" WHERE "currentBrandId" IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION
      'members_current_brand_backfill: % member row(s) belong to an organization with no brand row and no organization to placeholder-brand for; investigate before deploying #5219/#5291',
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
