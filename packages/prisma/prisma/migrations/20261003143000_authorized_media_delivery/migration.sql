-- Expand only: prepared media identity is independent of expiring grants.
CREATE TABLE "media_delivery_variants" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "ingredientId" TEXT NOT NULL,
  "sourceIdentity" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "sourceVersion" INTEGER NOT NULL,
  "policyVersion" INTEGER NOT NULL,
  "purpose" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'PENDING',
  "storageKey" TEXT,
  "failureCode" TEXT,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "media_delivery_variants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "media_delivery_variant_state" CHECK ("state" IN ('PENDING', 'READY', 'FAILED', 'UNSUPPORTED')),
  CONSTRAINT "media_delivery_variant_purpose" CHECK ("purpose" IN ('preview', 'public-share', 'public-og', 'public-social'))
);
CREATE UNIQUE INDEX "media_delivery_variant_identity" ON "media_delivery_variants" ("organizationId", "ingredientId", "sourceIdentity", "policyVersion", "purpose");
CREATE INDEX "media_delivery_variants_organizationId_ingredientId_isDeleted_idx" ON "media_delivery_variants" ("organizationId", "ingredientId", "isDeleted");
