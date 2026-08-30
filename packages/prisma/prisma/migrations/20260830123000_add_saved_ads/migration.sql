CREATE TABLE "saved_ads" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "sourceAdId" TEXT NOT NULL,
    "sourceRecordId" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'all',
    "credentialId" TEXT,
    "adAccountId" TEXT,
    "loginCustomerId" TEXT,
    "advertiserId" TEXT,
    "advertiserName" TEXT,
    "title" TEXT NOT NULL,
    "headline" TEXT,
    "body" TEXT,
    "cta" TEXT,
    "explanation" TEXT NOT NULL,
    "landingPageUrl" TEXT,
    "previewUrl" TEXT,
    "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "videoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metrics" JSONB NOT NULL DEFAULT '{}',
    "patternSummary" JSONB NOT NULL DEFAULT '[]',
    "usagePolicy" TEXT NOT NULL DEFAULT 'remix_allowed',
    "firstSeenAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "saved_ads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "saved_ads_scope_source_key" ON "saved_ads"("organizationId", "brandId", "platform", "sourceAdId");
CREATE INDEX "saved_ads_scope_created_idx" ON "saved_ads"("organizationId", "brandId", "isDeleted", "createdAt" DESC, "id" DESC);
ALTER TABLE "saved_ads" ADD CONSTRAINT "saved_ads_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "saved_ads" ADD CONSTRAINT "saved_ads_brandId_organizationId_fkey" FOREIGN KEY ("brandId", "organizationId") REFERENCES "brands"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "saved_ads" ADD CONSTRAINT "saved_ads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
