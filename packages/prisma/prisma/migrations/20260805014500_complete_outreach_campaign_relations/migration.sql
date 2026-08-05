BEGIN;

ALTER TABLE "outreach_campaigns"
ADD COLUMN "credentialId" TEXT;

-- Optional scalar references use NULL, never an empty string. Required
-- organization references are resolved below before any destructive cleanup.
UPDATE "outreach_campaigns"
SET "brandId" = NULLIF("brandId", ''),
    "userId" = NULLIF("userId", '')
WHERE "brandId" = '' OR "userId" = '';

-- Every supplied organization reference must identify the same canonical row.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "outreach_campaigns" AS campaign
    WHERE COALESCE(
      NULLIF(campaign."organizationId", ''),
      NULLIF(campaign."config"->>'organizationId', ''),
      NULLIF(campaign."config"->>'organization', '')
    ) IS NOT NULL
      AND (
        SELECT COUNT(*)
        FROM "organizations" AS candidate
        WHERE (
          NULLIF(campaign."organizationId", '') IS NULL
          OR NULLIF(campaign."organizationId", '')
            IN (candidate."id", candidate."mongoId")
        )
          AND (
            NULLIF(campaign."config"->>'organizationId', '') IS NULL
            OR NULLIF(campaign."config"->>'organizationId', '')
              IN (candidate."id", candidate."mongoId")
          )
          AND (
            NULLIF(campaign."config"->>'organization', '') IS NULL
            OR NULLIF(campaign."config"->>'organization', '')
              IN (candidate."id", candidate."mongoId")
          )
      ) <> 1
  ) THEN
    RAISE EXCEPTION
      'outreach_campaigns contains unresolved or conflicting organization references';
  END IF;
END $$;

WITH resolved_organizations AS (
  SELECT campaign."id" AS "campaignId", MIN(candidate."id") AS "organizationId"
  FROM "outreach_campaigns" AS campaign
  JOIN "organizations" AS candidate
    ON (
      NULLIF(campaign."organizationId", '') IS NULL
      OR NULLIF(campaign."organizationId", '')
        IN (candidate."id", candidate."mongoId")
    )
   AND (
      NULLIF(campaign."config"->>'organizationId', '') IS NULL
      OR NULLIF(campaign."config"->>'organizationId', '')
        IN (candidate."id", candidate."mongoId")
    )
   AND (
      NULLIF(campaign."config"->>'organization', '') IS NULL
      OR NULLIF(campaign."config"->>'organization', '')
        IN (candidate."id", candidate."mongoId")
    )
  WHERE COALESCE(
    NULLIF(campaign."organizationId", ''),
    NULLIF(campaign."config"->>'organizationId', ''),
    NULLIF(campaign."config"->>'organization', '')
  ) IS NOT NULL
  GROUP BY campaign."id"
  HAVING COUNT(*) = 1
)
UPDATE "outreach_campaigns" AS campaign
SET "organizationId" = resolved."organizationId"
FROM resolved_organizations AS resolved
WHERE campaign."id" = resolved."campaignId";

-- User references are optional, but supplied aliases may not disagree.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "outreach_campaigns" AS campaign
    WHERE COALESCE(
      NULLIF(campaign."userId", ''),
      NULLIF(campaign."config"->>'userId', ''),
      NULLIF(campaign."config"->>'user', '')
    ) IS NOT NULL
      AND (
        SELECT COUNT(*)
        FROM "users" AS candidate
        WHERE (
          NULLIF(campaign."userId", '') IS NULL
          OR NULLIF(campaign."userId", '')
            IN (candidate."id", candidate."mongoId")
        )
          AND (
            NULLIF(campaign."config"->>'userId', '') IS NULL
            OR NULLIF(campaign."config"->>'userId', '')
              IN (candidate."id", candidate."mongoId")
          )
          AND (
            NULLIF(campaign."config"->>'user', '') IS NULL
            OR NULLIF(campaign."config"->>'user', '')
              IN (candidate."id", candidate."mongoId")
          )
      ) <> 1
  ) THEN
    RAISE EXCEPTION
      'outreach_campaigns contains unresolved or conflicting user references';
  END IF;
END $$;

WITH resolved_users AS (
  SELECT campaign."id" AS "campaignId", MIN(candidate."id") AS "userId"
  FROM "outreach_campaigns" AS campaign
  JOIN "users" AS candidate
    ON (
      NULLIF(campaign."userId", '') IS NULL
      OR NULLIF(campaign."userId", '')
        IN (candidate."id", candidate."mongoId")
    )
   AND (
      NULLIF(campaign."config"->>'userId', '') IS NULL
      OR NULLIF(campaign."config"->>'userId', '')
        IN (candidate."id", candidate."mongoId")
    )
   AND (
      NULLIF(campaign."config"->>'user', '') IS NULL
      OR NULLIF(campaign."config"->>'user', '')
        IN (candidate."id", candidate."mongoId")
    )
  WHERE COALESCE(
    NULLIF(campaign."userId", ''),
    NULLIF(campaign."config"->>'userId', ''),
    NULLIF(campaign."config"->>'user', '')
  ) IS NOT NULL
  GROUP BY campaign."id"
  HAVING COUNT(*) = 1
)
UPDATE "outreach_campaigns" AS campaign
SET "userId" = resolved."userId"
FROM resolved_users AS resolved
WHERE campaign."id" = resolved."campaignId";

-- Resolve brand references only inside the campaign organization. Existing
-- scalar values take precedence, but every supplied alias must agree.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "outreach_campaigns" AS campaign
    WHERE COALESCE(
      NULLIF(campaign."brandId", ''),
      NULLIF(campaign."config"->>'brandId', ''),
      NULLIF(campaign."config"->>'brand', '')
    ) IS NOT NULL
      AND (
        SELECT COUNT(*)
        FROM "brands" AS candidate
        WHERE candidate."organizationId" = campaign."organizationId"
          AND (
            NULLIF(campaign."brandId", '') IS NULL
            OR NULLIF(campaign."brandId", '')
              IN (candidate."id", candidate."mongoId")
          )
          AND (
            NULLIF(campaign."config"->>'brandId', '') IS NULL
            OR NULLIF(campaign."config"->>'brandId', '')
              IN (candidate."id", candidate."mongoId")
          )
          AND (
            NULLIF(campaign."config"->>'brand', '') IS NULL
            OR NULLIF(campaign."config"->>'brand', '')
              IN (candidate."id", candidate."mongoId")
          )
      ) <> 1
  ) THEN
    RAISE EXCEPTION
      'outreach_campaigns contains unresolved, conflicting, or cross-organization brand references';
  END IF;
END $$;

WITH resolved_brands AS (
  SELECT campaign."id" AS "campaignId", MIN(candidate."id") AS "brandId"
  FROM "outreach_campaigns" AS campaign
  JOIN "brands" AS candidate
    ON candidate."organizationId" = campaign."organizationId"
   AND (
      NULLIF(campaign."brandId", '') IS NULL
      OR NULLIF(campaign."brandId", '')
        IN (candidate."id", candidate."mongoId")
    )
   AND (
      NULLIF(campaign."config"->>'brandId', '') IS NULL
      OR NULLIF(campaign."config"->>'brandId', '')
        IN (candidate."id", candidate."mongoId")
    )
   AND (
      NULLIF(campaign."config"->>'brand', '') IS NULL
      OR NULLIF(campaign."config"->>'brand', '')
        IN (candidate."id", candidate."mongoId")
    )
  WHERE COALESCE(
    NULLIF(campaign."brandId", ''),
    NULLIF(campaign."config"->>'brandId', ''),
    NULLIF(campaign."config"->>'brand', '')
  ) IS NOT NULL
  GROUP BY campaign."id"
  HAVING COUNT(*) = 1
)
UPDATE "outreach_campaigns" AS campaign
SET "brandId" = resolved."brandId"
FROM resolved_brands AS resolved
WHERE campaign."id" = resolved."campaignId";

-- Credential ownership must match the campaign organization and, when the
-- campaign is brand-scoped, that exact brand.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "outreach_campaigns" AS campaign
    WHERE COALESCE(
      NULLIF(campaign."config"->>'credentialId', ''),
      NULLIF(campaign."config"->>'credential', '')
    ) IS NOT NULL
      AND (
        SELECT COUNT(*)
        FROM "credentials" AS candidate
        WHERE candidate."organizationId" = campaign."organizationId"
          AND (
            campaign."brandId" IS NULL
            OR candidate."brandId" = campaign."brandId"
          )
          AND (
            NULLIF(campaign."config"->>'credentialId', '') IS NULL
            OR NULLIF(campaign."config"->>'credentialId', '')
              IN (candidate."id", candidate."mongoId")
          )
          AND (
            NULLIF(campaign."config"->>'credential', '') IS NULL
            OR NULLIF(campaign."config"->>'credential', '')
              IN (candidate."id", candidate."mongoId")
          )
      ) <> 1
  ) THEN
    RAISE EXCEPTION
      'outreach_campaigns contains unresolved, conflicting, or cross-tenant credential references';
  END IF;
END $$;

WITH resolved_credentials AS (
  SELECT campaign."id" AS "campaignId", MIN(candidate."id") AS "credentialId"
  FROM "outreach_campaigns" AS campaign
  JOIN "credentials" AS candidate
    ON candidate."organizationId" = campaign."organizationId"
   AND (campaign."brandId" IS NULL OR candidate."brandId" = campaign."brandId")
   AND (
      NULLIF(campaign."config"->>'credentialId', '') IS NULL
      OR NULLIF(campaign."config"->>'credentialId', '')
        IN (candidate."id", candidate."mongoId")
    )
   AND (
      NULLIF(campaign."config"->>'credential', '') IS NULL
      OR NULLIF(campaign."config"->>'credential', '')
        IN (candidate."id", candidate."mongoId")
    )
  WHERE COALESCE(
    NULLIF(campaign."config"->>'credentialId', ''),
    NULLIF(campaign."config"->>'credential', '')
  ) IS NOT NULL
  GROUP BY campaign."id"
  HAVING COUNT(*) = 1
)
UPDATE "outreach_campaigns" AS campaign
SET "credentialId" = resolved."credentialId"
FROM resolved_credentials AS resolved
WHERE campaign."id" = resolved."campaignId";

-- Defense in depth: no supplied alias may be removed unless its canonical
-- destination column was populated by the exact predicates validated above.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "outreach_campaigns" AS campaign
    WHERE COALESCE(
      NULLIF(campaign."organizationId", ''),
      NULLIF(campaign."config"->>'organizationId', ''),
      NULLIF(campaign."config"->>'organization', '')
    ) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "organizations" AS organization
        WHERE organization."id" = campaign."organizationId"
      )
  ) THEN
    RAISE EXCEPTION
      'outreach_campaigns organization references were not fully canonicalized';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "outreach_campaigns" AS campaign
    WHERE COALESCE(
      NULLIF(campaign."userId", ''),
      NULLIF(campaign."config"->>'userId', ''),
      NULLIF(campaign."config"->>'user', '')
    ) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "users" AS "user"
        WHERE "user"."id" = campaign."userId"
      )
  ) THEN
    RAISE EXCEPTION
      'outreach_campaigns user references were not fully canonicalized';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "outreach_campaigns" AS campaign
    WHERE COALESCE(
      NULLIF(campaign."brandId", ''),
      NULLIF(campaign."config"->>'brandId', ''),
      NULLIF(campaign."config"->>'brand', '')
    ) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "brands" AS brand
        WHERE brand."id" = campaign."brandId"
          AND brand."organizationId" = campaign."organizationId"
      )
  ) THEN
    RAISE EXCEPTION
      'outreach_campaigns brand references were not fully canonicalized';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "outreach_campaigns" AS campaign
    WHERE COALESCE(
      NULLIF(campaign."config"->>'credentialId', ''),
      NULLIF(campaign."config"->>'credential', '')
    ) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "credentials" AS credential
        WHERE credential."id" = campaign."credentialId"
          AND credential."organizationId" = campaign."organizationId"
          AND (
            campaign."brandId" IS NULL
            OR credential."brandId" = campaign."brandId"
          )
      )
  ) THEN
    RAISE EXCEPTION
      'outreach_campaigns credential references were not fully canonicalized';
  END IF;
END $$;

-- Cleanup happens only after every non-empty reference has resolved uniquely.
UPDATE "outreach_campaigns"
SET "config" = COALESCE("config", '{}'::jsonb) - ARRAY[
  'brand',
  'brandId',
  'credential',
  'credentialId',
  'organization',
  'organizationId',
  'user',
  'userId'
]
WHERE "config" ?| ARRAY[
  'brand',
  'brandId',
  'credential',
  'credentialId',
  'organization',
  'organizationId',
  'user',
  'userId'
];

ALTER TABLE "outreach_campaigns"
ADD CONSTRAINT "outreach_campaigns_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "brands"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "outreach_campaigns"
ADD CONSTRAINT "outreach_campaigns_credentialId_fkey"
FOREIGN KEY ("credentialId") REFERENCES "credentials"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "outreach_campaigns_brandId_isDeleted_idx"
ON "outreach_campaigns"("brandId", "isDeleted");

CREATE INDEX "outreach_campaigns_credentialId_isDeleted_idx"
ON "outreach_campaigns"("credentialId", "isDeleted");

COMMIT;
