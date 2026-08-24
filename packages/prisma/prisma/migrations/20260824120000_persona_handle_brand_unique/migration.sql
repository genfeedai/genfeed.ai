-- Brand-unique character handles among live personas (#3440).
-- Partial unique cannot be represented in schema.prisma — same pattern as
-- 20260811140000_enforce_single_billing_identity_per_org.
--
-- Legacy duplicate/empty handles must not fail the migration: keep the oldest
-- live row per (organizationId, brandId, handle) and null later duplicates.

UPDATE "personas"
SET "handle" = NULL, "updatedAt" = now()
WHERE "handle" IS NOT NULL AND btrim("handle") = '';

WITH ranked_handles AS (
  SELECT
    p."id",
    ROW_NUMBER() OVER (
      PARTITION BY p."organizationId", p."brandId", lower(p."handle")
      ORDER BY p."createdAt" ASC, p."id" ASC
    ) AS rank
  FROM "personas" p
  WHERE p."handle" IS NOT NULL
    AND p."isDeleted" = false
)
UPDATE "personas"
SET "handle" = NULL, "updatedAt" = now()
FROM ranked_handles
WHERE "personas"."id" = ranked_handles."id"
  AND ranked_handles.rank > 1;

UPDATE "personas"
SET "handle" = lower("handle"), "updatedAt" = now()
WHERE "handle" IS NOT NULL AND "handle" <> lower("handle");

CREATE UNIQUE INDEX "personas_org_brand_handle_live_key"
ON "personas" ("organizationId", "brandId", "handle")
WHERE "handle" IS NOT NULL AND "isDeleted" = false;

CREATE INDEX IF NOT EXISTS "personas_mention_suggest_idx"
ON "personas" ("organizationId", "brandId", "isDeleted", "status", "handle");
