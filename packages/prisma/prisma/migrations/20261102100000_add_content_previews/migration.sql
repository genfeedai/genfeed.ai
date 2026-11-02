-- Public, token-gated, read-only preview of prepared warm-up content (#8788).
-- Only the SHA-256 hash of the token is stored. Counters hold counts and timestamps only.
CREATE TABLE "content_previews" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "warmupAccountId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "items" JSONB NOT NULL DEFAULT '[]',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "firstViewedAt" TIMESTAMP(3),
    "lastViewedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "ctaClickCount" INTEGER NOT NULL DEFAULT 0,
    "claimedAt" TIMESTAMP(3),
    "claimedByUserId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_previews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "content_previews_tokenHash_key" ON "content_previews"("tokenHash");

-- CreateIndex
CREATE INDEX "content_previews_warmup_idx" ON "content_previews"("warmupAccountId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "content_previews_org_deleted_idx" ON "content_previews"("organizationId", "isDeleted");

-- AddForeignKey
ALTER TABLE "content_previews" ADD CONSTRAINT "content_previews_warmupAccountId_fkey" FOREIGN KEY ("warmupAccountId") REFERENCES "warmup_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_previews" ADD CONSTRAINT "content_previews_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_previews" ADD CONSTRAINT "content_previews_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;
