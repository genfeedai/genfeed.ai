-- Shared store of other creators' public posts and their outlier multiple
-- (#11641). Platform rows with no tenant column. Expand only: two new, empty
-- tables.

CREATE TABLE IF NOT EXISTS "outlier_creators" (
  "id" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "handle" TEXT NOT NULL,
  "displayName" TEXT,
  "followersCount" INTEGER,
  "nicheTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "status" TEXT NOT NULL DEFAULT 'active',
  "lastReadAt" TIMESTAMP(3),
  "medianViews" DOUBLE PRECISION,
  "sampleSize" INTEGER NOT NULL DEFAULT 0,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "outlier_creators_pkey" PRIMARY KEY ("id"),
  -- OutlierCreatorStatus in @genfeedai/contracts.
  CONSTRAINT "outlier_creators_status_check"
    CHECK ("status" IN ('active', 'unreadable', 'removed')),
  -- OUTLIER_LIBRARY_PLATFORMS in @genfeedai/contracts.
  CONSTRAINT "outlier_creators_platform_check"
    CHECK ("platform" IN ('youtube', 'instagram', 'tiktok'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "outlier_creators_platform_externalId_key"
  ON "outlier_creators" ("platform", "externalId");

CREATE INDEX IF NOT EXISTS "outlier_creators_platform_status_lastReadAt_idx"
  ON "outlier_creators" ("platform", "status", "lastReadAt");

CREATE TABLE IF NOT EXISTS "outlier_posts" (
  "id" TEXT NOT NULL,
  "creatorId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "publishedAt" TIMESTAMP(3) NOT NULL,
  "views" DOUBLE PRECISION NOT NULL,
  "likes" DOUBLE PRECISION,
  "comments" DOUBLE PRECISION,
  "countsReadAt" TIMESTAMP(3) NOT NULL,
  "medianViews" DOUBLE PRECISION NOT NULL,
  "sampleSize" INTEGER NOT NULL,
  "outlierRatio" DOUBLE PRECISION NOT NULL,
  "outlierTier" TEXT NOT NULL,
  "soundId" TEXT,
  "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "captionExcerpt" TEXT,
  "format" TEXT,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "outlier_posts_pkey" PRIMARY KEY ("id"),
  -- OutlierLibraryTier in @genfeedai/contracts.
  CONSTRAINT "outlier_posts_tier_check"
    CHECK ("outlierTier" IN ('outlier', 'breakout')),
  CONSTRAINT "outlier_posts_platform_check"
    CHECK ("platform" IN ('youtube', 'instagram', 'tiktok'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "outlier_posts_platform_externalId_key"
  ON "outlier_posts" ("platform", "externalId");

CREATE INDEX IF NOT EXISTS "outlier_posts_creatorId_isDeleted_idx"
  ON "outlier_posts" ("creatorId", "isDeleted");

CREATE INDEX IF NOT EXISTS "outlier_posts_list_idx"
  ON "outlier_posts" ("isDeleted", "platform", "outlierTier", "outlierRatio" DESC, "publishedAt" DESC);

ALTER TABLE "outlier_posts"
  DROP CONSTRAINT IF EXISTS "outlier_posts_creatorId_fkey",
  ADD CONSTRAINT "outlier_posts_creatorId_fkey"
    FOREIGN KEY ("creatorId") REFERENCES "outlier_creators"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
