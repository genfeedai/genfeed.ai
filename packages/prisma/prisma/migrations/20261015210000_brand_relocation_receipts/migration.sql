CREATE TABLE "brand_relocations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "brandId" TEXT NOT NULL REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "organizationId" TEXT NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "destinationOrganizationId" TEXT NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'processing' CHECK ("status" IN ('processing', 'done', 'failed')),
  "payload" JSONB NOT NULL,
  "summary" JSONB,
  "error" TEXT,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "brand_relocations_organizationId_userId_createdAt_idx" ON "brand_relocations" ("organizationId", "userId", "createdAt");
CREATE INDEX "brand_relocations_brandId_createdAt_idx" ON "brand_relocations" ("brandId", "createdAt");
CREATE UNIQUE INDEX "brand_relocations_one_processing_brand" ON "brand_relocations" ("brandId") WHERE "status" = 'processing' AND "isDeleted" = false;
CREATE INDEX "brand_relocations_status_isDeleted_createdAt_idx" ON "brand_relocations" ("status", "isDeleted", "createdAt");
