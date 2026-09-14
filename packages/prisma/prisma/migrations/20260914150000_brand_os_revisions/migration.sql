ALTER TABLE "brands" ADD COLUMN "brandOsRevisionVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TYPE "BrandOsRevisionStatus" AS ENUM ('DRAFT', 'APPROVED', 'SUPERSEDED');
CREATE TABLE "brand_os_revisions" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "BrandOsRevisionStatus" NOT NULL DEFAULT 'DRAFT',
  "content" JSONB NOT NULL,
  "sourcePreviewTokenHash" TEXT,
  "exportSchemaVersion" TEXT NOT NULL DEFAULT '1',
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "brand_os_revisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "brand_os_revisions_version_positive" CHECK ("version" > 0),
  CONSTRAINT "brand_os_revisions_approval_metadata" CHECK (("status" = 'DRAFT' AND "approvedById" IS NULL AND "approvedAt" IS NULL) OR ("status" <> 'DRAFT' AND "approvedById" IS NOT NULL AND "approvedAt" IS NOT NULL))
);
CREATE UNIQUE INDEX "brand_os_revisions_organizationId_brandId_version_key" ON "brand_os_revisions"("organizationId", "brandId", "version");
CREATE UNIQUE INDEX "brand_os_revisions_sourcePreviewTokenHash_key" ON "brand_os_revisions"("sourcePreviewTokenHash");
CREATE INDEX "brand_os_revisions_organizationId_brandId_isDeleted_status_idx" ON "brand_os_revisions"("organizationId", "brandId", "isDeleted", "status");
CREATE UNIQUE INDEX "brand_os_revisions_one_approved" ON "brand_os_revisions"("organizationId", "brandId") WHERE "status" = 'APPROVED' AND "isDeleted" = false;
ALTER TABLE "brand_os_revisions" ADD CONSTRAINT "brand_os_revisions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "brand_os_revisions" ADD CONSTRAINT "brand_os_revisions_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "brand_os_revisions" ADD CONSTRAINT "brand_os_revisions_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "brand_os_publications" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "revisionId" TEXT NOT NULL,
  "publishedRevisionIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "publishedById" TEXT NOT NULL,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedById" TEXT,
  "revokedAt" TIMESTAMP(3),
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "brand_os_publications_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "brand_os_publications_organizationId_brandId_key" ON "brand_os_publications"("organizationId", "brandId");
CREATE INDEX "brand_os_publications_organizationId_brandId_isDeleted_idx" ON "brand_os_publications"("organizationId", "brandId", "isDeleted");
ALTER TABLE "brand_os_publications" ADD CONSTRAINT "brand_os_publications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "brand_os_publications" ADD CONSTRAINT "brand_os_publications_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "brand_os_publications" ADD CONSTRAINT "brand_os_publications_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "brand_os_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "brand_os_publications" ADD CONSTRAINT "brand_os_publications_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "brand_os_publications" ADD CONSTRAINT "brand_os_publications_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
