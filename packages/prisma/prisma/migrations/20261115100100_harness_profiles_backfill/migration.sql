-- Copy harness profiles from `profiles.data` into `harness_profiles` (#10191).
--
-- Data-change protocol: a one-time rewrite of existing tenant rows, so a data
-- migration. Each harness profile (`data.profileType = 'harness'`) whose brand
-- exists in the same organization becomes one `harness_profiles` row that keeps
-- its id (receipts and plan provenance already name that id) and one revision
-- 1 with source MIGRATION. Soft-deleted rows are copied too, with `isDeleted`
-- kept. The source rows in `profiles` are left untouched, so nothing is lost
-- and the copy can be compared by hand.
--
-- A profile whose `data.brandId` does not match a brand of its organization
-- cannot take the foreign key. It stays in `profiles`; the notice below counts
-- it so the number is visible in the deploy log.
--
-- Re-running is safe: rows already copied are skipped by id. The block fails
-- the migration when the copied count does not equal the eligible count.

DO $$
DECLARE
  harness_total INTEGER;
  eligible INTEGER;
  already_copied INTEGER;
  inserted_profiles INTEGER;
  inserted_revisions INTEGER;
  copied INTEGER;
BEGIN
  SELECT count(*) INTO harness_total
  FROM "profiles" p
  WHERE p."data"->>'profileType' = 'harness';

  CREATE TEMP TABLE harness_profile_backfill ON COMMIT DROP AS
  SELECT p."id", p."organizationId", p."createdById", p."isDeleted",
         p."createdAt", p."updatedAt", p."data", b."id" AS "brandId"
  FROM "profiles" p
  JOIN "brands" b
    ON b."id" = p."data"->>'brandId'
   AND b."organizationId" = p."organizationId"
  WHERE p."data"->>'profileType' = 'harness';

  SELECT count(*) INTO eligible FROM harness_profile_backfill;
  SELECT count(*) INTO already_copied
  FROM harness_profile_backfill s
  JOIN "harness_profiles" h ON h."id" = s."id";

  INSERT INTO "harness_profiles" (
    "id", "organizationId", "brandId", "label", "description", "scope",
    "status", "isDefault", "content", "currentVersion", "createdById",
    "isDeleted", "createdAt", "updatedAt"
  )
  SELECT
    s."id",
    s."organizationId",
    s."brandId",
    COALESCE(NULLIF(btrim(s."data"->>'label'), ''), 'Harness profile'),
    NULLIF(s."data"->>'description', ''),
    CASE WHEN s."data"->>'scope' IN ('brand', 'channel', 'company', 'founder')
      THEN s."data"->>'scope' ELSE 'brand' END,
    CASE WHEN s."data"->>'status' = 'draft' THEN 'draft' ELSE 'active' END,
    COALESCE((s."data"->>'isDefault')::boolean, false),
    s."data" - 'brandId' - 'profileType' - 'label' - 'description' - 'scope'
      - 'status' - 'isDefault',
    1,
    s."createdById",
    s."isDeleted",
    s."createdAt",
    s."updatedAt"
  FROM harness_profile_backfill s
  ON CONFLICT ("id") DO NOTHING;
  GET DIAGNOSTICS inserted_profiles = ROW_COUNT;

  INSERT INTO "harness_profile_revisions" (
    "id", "organizationId", "brandId", "harnessProfileId", "version",
    "snapshot", "source", "actorLabel", "isDeleted", "createdAt"
  )
  SELECT
    'hpr_' || h."id" || '_1',
    h."organizationId",
    h."brandId",
    h."id",
    1,
    jsonb_build_object(
      'label', h."label",
      'description', h."description",
      'scope', h."scope",
      'status', h."status",
      'isDefault', h."isDefault",
      'content', h."content"
    ),
    'MIGRATION',
    'profiles.data backfill',
    false,
    h."createdAt"
  FROM "harness_profiles" h
  JOIN harness_profile_backfill s ON s."id" = h."id"
  ON CONFLICT ("harnessProfileId", "version") DO NOTHING;
  GET DIAGNOSTICS inserted_revisions = ROW_COUNT;

  SELECT count(*) INTO copied
  FROM harness_profile_backfill s
  JOIN "harness_profiles" h ON h."id" = s."id"
  WHERE EXISTS (
    SELECT 1 FROM "harness_profile_revisions" r
    WHERE r."harnessProfileId" = h."id"
  );

  RAISE NOTICE
    'harness profile backfill: % in profiles, % eligible (brand found), % not migrated (no matching brand), % already copied, % profiles and % revisions written, % present after',
    harness_total, eligible, harness_total - eligible, already_copied,
    inserted_profiles, inserted_revisions, copied;

  IF copied <> eligible THEN
    RAISE EXCEPTION
      'harness profile backfill lost rows: % eligible, % present after',
      eligible, copied;
  END IF;
END
$$;
