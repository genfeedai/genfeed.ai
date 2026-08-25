-- Generalize the X-only competitor watchlist into a platform-agnostic paid
-- creative research pool spanning Meta Ad Library, TikTok Creative Center,
-- Google Ads Transparency Center (which also covers YouTube video ads), and the
-- X DSA Ads Repository. #3537.

ALTER TABLE "x_ad_watched_advertisers" RENAME TO "ad_watched_advertisers";

ALTER TABLE "ad_watched_advertisers"
  ADD COLUMN IF NOT EXISTS "platform" TEXT NOT NULL DEFAULT 'x';

-- The pre-rename rows were all X advertisers.
UPDATE "ad_watched_advertisers" SET "platform" = 'x' WHERE "platform" IS NULL;

ALTER INDEX IF EXISTS "x_ad_watched_advertisers_pkey"
  RENAME TO "ad_watched_advertisers_pkey";

ALTER TABLE "ad_watched_advertisers"
  RENAME CONSTRAINT "x_ad_watched_advertisers_organizationId_fkey"
  TO "ad_watched_advertisers_organizationId_fkey";
ALTER TABLE "ad_watched_advertisers"
  RENAME CONSTRAINT "x_ad_watched_advertisers_brandId_organizationId_fkey"
  TO "ad_watched_advertisers_brandId_organizationId_fkey";
ALTER TABLE "ad_watched_advertisers"
  RENAME CONSTRAINT "x_ad_watched_advertisers_credentialId_fkey"
  TO "ad_watched_advertisers_credentialId_fkey";
ALTER TABLE "ad_watched_advertisers"
  RENAME CONSTRAINT "x_ad_watched_advertisers_freshness_check"
  TO "ad_watched_advertisers_freshness_check";

-- The old handle CHECK encoded X's 15-character screen-name rule. Meta page
-- slugs, TikTok handles, and Google advertiser ids are longer and may contain
-- dots or dashes, so the durable constraint keeps only the normalization
-- invariant (lowercase, no whitespace) and the per-platform shape is enforced
-- in application code where the platform is known.
ALTER TABLE "ad_watched_advertisers"
  DROP CONSTRAINT IF EXISTS "x_ad_watched_advertisers_handle_check";

ALTER TABLE "ad_watched_advertisers"
  ADD CONSTRAINT "ad_watched_advertisers_handle_check"
  CHECK (
    "advertiserHandle" = lower("advertiserHandle")
    AND "advertiserHandle" ~ '^[a-z0-9._-]{1,64}$'
  );

ALTER TABLE "ad_watched_advertisers"
  ADD CONSTRAINT "ad_watched_advertisers_platform_check"
  CHECK ("platform" IN ('meta', 'google', 'youtube', 'tiktok', 'x'));

-- Uniqueness is now per platform. Prisma still cannot represent the nullable
-- brand predicates, so both partial indexes stay raw.
DROP INDEX IF EXISTS "x_ad_watched_advertisers_org_brand_handle_key";
DROP INDEX IF EXISTS "x_ad_watched_advertisers_org_unbranded_handle_key";
DROP INDEX IF EXISTS "x_ad_watched_advertisers_org_deleted_created_at_idx";
DROP INDEX IF EXISTS "x_ad_watched_advertisers_org_brand_deleted_idx";
DROP INDEX IF EXISTS "x_ad_watched_advertisers_deleted_last_attempted_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "ad_watched_advertisers_org_brand_platform_handle_key"
  ON "ad_watched_advertisers" ("organizationId", "brandId", "platform", "advertiserHandle")
  WHERE "brandId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "ad_watched_advertisers_org_unbranded_platform_handle_key"
  ON "ad_watched_advertisers" ("organizationId", "platform", "advertiserHandle")
  WHERE "brandId" IS NULL;

CREATE INDEX IF NOT EXISTS "ad_watched_advertisers_org_deleted_created_at_idx"
  ON "ad_watched_advertisers" ("organizationId", "isDeleted", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "ad_watched_advertisers_org_brand_platform_deleted_idx"
  ON "ad_watched_advertisers" ("organizationId", "brandId", "platform", "isDeleted");

CREATE INDEX IF NOT EXISTS "ad_watched_advertisers_deleted_platform_last_attempted_idx"
  ON "ad_watched_advertisers" ("isDeleted", "platform", "lastAttemptedAt");
