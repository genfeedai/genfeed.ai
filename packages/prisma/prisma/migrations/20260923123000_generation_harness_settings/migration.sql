ALTER TABLE "ingredients" ADD COLUMN "generationHarness" JSONB;
CREATE TABLE "generation_harness_settings" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "brandId" TEXT,
  "scopeKey" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "generation_harness_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "generation_harness_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "generation_harness_settings_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "generation_harness_settings_organizationId_scopeKey_key" ON "generation_harness_settings"("organizationId", "scopeKey");
CREATE INDEX "generation_harness_settings_organizationId_isDeleted_idx" ON "generation_harness_settings"("organizationId", "isDeleted");
