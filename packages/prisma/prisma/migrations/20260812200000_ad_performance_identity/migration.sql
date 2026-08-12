-- Promote AdPerformance identity fields out of JSON so ingestion can upsert
-- on (organizationId, identityKey) and list/filter/sort in SQL (#2511).
--
-- identityKey format MUST match buildAdPerformanceIdentityKey():
--   v1|{adPlatform}|{dateISO}|{granularity}|{account}|{campaign}|{adset}|{ad}
-- dateISO is the UTC instant as YYYY-MM-DDTHH24:MI:SS.MSZ.

ALTER TABLE "ad_performance"
ADD COLUMN "date" TIMESTAMP(3),
ADD COLUMN "granularity" TEXT,
ADD COLUMN "externalAccountId" TEXT,
ADD COLUMN "externalCampaignId" TEXT,
ADD COLUMN "externalAdSetId" TEXT,
ADD COLUMN "externalAdId" TEXT,
ADD COLUMN "identityKey" TEXT;

UPDATE "ad_performance"
SET
  "date" = CASE
    WHEN jsonb_typeof("data"->'date') = 'number'
      AND ("data"->>'date') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
      CASE
        WHEN ("data"->>'date')::DOUBLE PRECISION > 1000000000000
          THEN to_timestamp(("data"->>'date')::DOUBLE PRECISION / 1000.0) AT TIME ZONE 'UTC'
        ELSE to_timestamp(("data"->>'date')::DOUBLE PRECISION) AT TIME ZONE 'UTC'
      END
    WHEN "data"->>'date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' THEN
      ("data"->>'date')::TIMESTAMPTZ AT TIME ZONE 'UTC'
    WHEN "data"->>'date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
      (("data"->>'date') || 'T00:00:00.000Z')::TIMESTAMPTZ AT TIME ZONE 'UTC'
    ELSE NULL
  END,
  "granularity" = NULLIF("data"->>'granularity', ''),
  "externalAccountId" = NULLIF("data"->>'externalAccountId', ''),
  "externalCampaignId" = NULLIF("data"->>'externalCampaignId', ''),
  "externalAdSetId" = COALESCE(
    NULLIF("data"->>'externalAdSetId', ''),
    NULLIF("data"->>'externalAdGroupId', '')
  ),
  "externalAdId" = NULLIF("data"->>'externalAdId', '');

UPDATE "ad_performance"
SET "identityKey" =
  'v1|' ||
  COALESCE("adPlatform", '') || '|' ||
  COALESCE(to_char("date", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), '') || '|' ||
  COALESCE("granularity", '') || '|' ||
  COALESCE("externalAccountId", '') || '|' ||
  COALESCE("externalCampaignId", '') || '|' ||
  COALESCE("externalAdSetId", '') || '|' ||
  COALESCE("externalAdId", '');

UPDATE "ad_performance"
SET "identityKey" = 'v1|||||||'
WHERE "identityKey" IS NULL;

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "organizationId", "identityKey"
      ORDER BY "updatedAt" DESC, "id" DESC
    ) AS rank
  FROM "ad_performance"
)
UPDATE "ad_performance" AS ap
SET
  "identityKey" = ap."identityKey" || '|dup:' || ap."id",
  "isDeleted" = true,
  "updatedAt" = CURRENT_TIMESTAMP
FROM ranked
WHERE ap."id" = ranked."id"
  AND ranked.rank > 1;

ALTER TABLE "ad_performance"
ALTER COLUMN "identityKey" SET NOT NULL;

CREATE UNIQUE INDEX "ad_performance_organizationId_identityKey_key"
ON "ad_performance"("organizationId", "identityKey");

CREATE INDEX "ad_performance_org_deleted_date_idx"
ON "ad_performance"("organizationId", "isDeleted", "date" DESC);

CREATE INDEX "ad_performance_org_deleted_platform_granularity_date_idx"
ON "ad_performance"("organizationId", "isDeleted", "adPlatform", "granularity", "date" DESC);

CREATE INDEX "ad_performance_credential_deleted_date_idx"
ON "ad_performance"("credentialId", "isDeleted", "date" DESC);
