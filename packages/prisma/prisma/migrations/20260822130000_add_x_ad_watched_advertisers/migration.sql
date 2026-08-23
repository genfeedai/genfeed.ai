-- Org/brand-scoped watchlist of competitor X advertisers polled through the
-- X Ads (DSA transparency) repository. #3395.

ALTER TABLE "ad_performance"
  ADD COLUMN IF NOT EXISTS "researchSource" TEXT,
  ADD COLUMN IF NOT EXISTS "researchSnapshotKey" TEXT,
  ADD COLUMN IF NOT EXISTS "researchSnapshotId" TEXT,
  ADD COLUMN IF NOT EXISTS "researchFreshnessState" TEXT,
  ADD COLUMN IF NOT EXISTS "researchObservedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "ad_performance_research_snapshot_visibility_idx"
  ON "ad_performance" (
    "organizationId",
    "researchSource",
    "researchFreshnessState",
    "researchSnapshotKey",
    "isDeleted"
  );

CREATE TABLE IF NOT EXISTS "x_ad_watched_advertisers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "credentialId" TEXT,
    "advertiserHandle" TEXT NOT NULL,
    "advertiserName" TEXT,
    "externalAdvertiserId" TEXT,
    "freshnessState" TEXT NOT NULL DEFAULT 'unavailable',
    "lastAttemptedAt" TIMESTAMP(3),
    "lastSuccessfulAt" TIMESTAMP(3),
    "lastIngestionStatus" TEXT,
    "lastIngestionErrorCode" TEXT,
    "lastSnapshotId" TEXT,
    "lastSnapshotRecordCount" INTEGER,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "x_ad_watched_advertisers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "x_ad_watched_advertisers_handle_check"
      CHECK (
        "advertiserHandle" = lower("advertiserHandle")
        AND "advertiserHandle" ~ '^[a-z0-9_]{1,15}$'
      ),
    CONSTRAINT "x_ad_watched_advertisers_freshness_check"
      CHECK ("freshnessState" IN ('fresh', 'empty', 'stale', 'unavailable')),
    CONSTRAINT "x_ad_watched_advertisers_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "x_ad_watched_advertisers_brandId_organizationId_fkey"
      FOREIGN KEY ("brandId", "organizationId") REFERENCES "brands"("id", "organizationId")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "x_ad_watched_advertisers_credentialId_fkey"
      FOREIGN KEY ("credentialId") REFERENCES "credentials"("id")
      ON DELETE SET NULL ON UPDATE CASCADE
);

-- Prisma cannot represent the nullable-brand predicates. Keep one durable row
-- per exact brand scope (including the organization-level NULL fallback)
-- without letting a same-org create revive or reassign another brand's row.
CREATE UNIQUE INDEX IF NOT EXISTS "x_ad_watched_advertisers_org_brand_handle_key"
  ON "x_ad_watched_advertisers" ("organizationId", "brandId", "advertiserHandle")
  WHERE "brandId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "x_ad_watched_advertisers_org_unbranded_handle_key"
  ON "x_ad_watched_advertisers" ("organizationId", "advertiserHandle")
  WHERE "brandId" IS NULL;

CREATE INDEX IF NOT EXISTS "x_ad_watched_advertisers_org_deleted_created_at_idx"
  ON "x_ad_watched_advertisers" ("organizationId", "isDeleted", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "x_ad_watched_advertisers_org_brand_deleted_idx"
  ON "x_ad_watched_advertisers" ("organizationId", "brandId", "isDeleted");

CREATE INDEX IF NOT EXISTS "x_ad_watched_advertisers_deleted_last_attempted_idx"
  ON "x_ad_watched_advertisers" ("isDeleted", "lastAttemptedAt");
