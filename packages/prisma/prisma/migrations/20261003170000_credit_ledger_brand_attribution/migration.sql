-- Credit ledger brand attribution. The brand a charge belongs to used to live
-- only in free-form metadata that no deduct path wrote, so org usage reports
-- put almost every credit under "no brand". Nullable: org-level spend stays
-- brandless. Plain columns (no FK) because brands are soft-deleted and a
-- deleted brand's history must keep its label.
ALTER TABLE "credit_transactions" ADD COLUMN IF NOT EXISTS "brandId" TEXT;
ALTER TABLE "credit_reservations" ADD COLUMN IF NOT EXISTS "brandId" TEXT;
CREATE INDEX IF NOT EXISTS "credit_transactions_org_brand_deleted_created_at_idx"
  ON "credit_transactions" ("organizationId", "brandId", "isDeleted", "createdAt" DESC);

-- Best-effort backfill. Idempotent (only rows still missing a brand) and
-- tenant-safe (a brand is only ever copied onto a row of its own organization).
-- Deleted brands are kept as targets so their historical usage stays attributed.

-- 1. A brand recorded in ledger metadata that exists in the same organization.
UPDATE "credit_transactions" AS ct
SET "brandId" = b."id"
FROM "brands" AS b
WHERE ct."brandId" IS NULL
  AND ct."category" IN ('deduct', 'refund')
  AND NULLIF(ct."metadata"->>'brandId', '') = b."id"
  AND b."organizationId" = ct."organizationId";

-- 2. Media holds are keyed by the output ingredient; use its brand.
UPDATE "credit_reservations" AS cr
SET "brandId" = b."id"
FROM "ingredients" AS i
JOIN "brands" AS b ON b."id" = i."brandId"
WHERE cr."brandId" IS NULL
  AND cr."workloadType" = 'media-generation'
  AND i."id" = cr."workloadId"
  AND i."organizationId" = cr."organizationId"
  AND b."organizationId" = cr."organizationId";

-- 3. Settlement rows inherit the brand of the hold they settled.
UPDATE "credit_transactions" AS ct
SET "brandId" = cr."brandId"
FROM "credit_reservations" AS cr
WHERE ct."brandId" IS NULL
  AND ct."category" IN ('deduct', 'refund')
  AND ct."reservationId" = cr."id"
  AND cr."organizationId" = ct."organizationId"
  AND cr."brandId" IS NOT NULL;

-- 4. Rows that name the generated asset take the asset's brand.
UPDATE "credit_transactions" AS ct
SET "brandId" = b."id"
FROM "ingredients" AS i
JOIN "brands" AS b ON b."id" = i."brandId"
WHERE ct."brandId" IS NULL
  AND ct."category" IN ('deduct', 'refund')
  AND NULLIF(ct."metadata"->>'assetId', '') = i."id"
  AND i."organizationId" = ct."organizationId"
  AND b."organizationId" = ct."organizationId";
