-- Brand-scoped cross-social source collection for Research > Following.
-- Stores followed accounts/sources and normalized source posts collected from
-- the existing social monitor fetchers.

CREATE TABLE "social_sources" (
  "id" TEXT NOT NULL,
  "mongoId" TEXT,
  "organizationId" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "credentialId" TEXT,
  "platform" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL DEFAULT 'account',
  "externalId" TEXT,
  "handle" TEXT NOT NULL,
  "displayName" TEXT,
  "avatarUrl" TEXT,
  "profileUrl" TEXT,
  "bio" TEXT,
  "followersCount" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastSyncedAt" TIMESTAMP(3),
  "lastSyncStatus" TEXT,
  "lastSyncError" TEXT,
  "lastPostExternalId" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "social_sources_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "source_posts" (
  "id" TEXT NOT NULL,
  "mongoId" TEXT,
  "organizationId" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "userId" TEXT,
  "sourceId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "text" TEXT,
  "authorId" TEXT,
  "authorHandle" TEXT,
  "authorDisplayName" TEXT,
  "authorAvatarUrl" TEXT,
  "authorFollowersCount" INTEGER,
  "sourceUrl" TEXT,
  "mediaUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "thumbnailUrl" TEXT,
  "metrics" JSONB NOT NULL DEFAULT '{}',
  "hashtags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "publishedAt" TIMESTAMP(3),
  "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "raw" JSONB NOT NULL DEFAULT '{}',
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "source_posts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "social_sources_mongoId_key" ON "social_sources"("mongoId");
CREATE UNIQUE INDEX "social_sources_brand_platform_type_handle_deleted_key"
  ON "social_sources"("brandId", "platform", "sourceType", "handle")
  WHERE "isDeleted" = false;
CREATE INDEX "social_sources_brand_active_idx" ON "social_sources"("organizationId", "brandId", "isDeleted", "isActive", "platform");
CREATE INDEX "social_sources_org_created_idx" ON "social_sources"("organizationId", "isDeleted", "createdAt" DESC);

CREATE UNIQUE INDEX "source_posts_mongoId_key" ON "source_posts"("mongoId");
CREATE UNIQUE INDEX "source_posts_source_external_key" ON "source_posts"("sourceId", "externalId");
CREATE INDEX "source_posts_brand_feed_idx" ON "source_posts"("organizationId", "brandId", "platform", "isDeleted", "publishedAt" DESC);
CREATE INDEX "source_posts_brand_collected_idx" ON "source_posts"("organizationId", "brandId", "isDeleted", "collectedAt" DESC);
CREATE INDEX "source_posts_source_published_idx" ON "source_posts"("sourceId", "isDeleted", "publishedAt" DESC);

ALTER TABLE "social_sources" ADD CONSTRAINT "social_sources_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "social_sources" ADD CONSTRAINT "social_sources_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "social_sources" ADD CONSTRAINT "social_sources_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "social_sources" ADD CONSTRAINT "social_sources_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "credentials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "source_posts" ADD CONSTRAINT "source_posts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "source_posts" ADD CONSTRAINT "source_posts_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "source_posts" ADD CONSTRAINT "source_posts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "source_posts" ADD CONSTRAINT "source_posts_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "social_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
