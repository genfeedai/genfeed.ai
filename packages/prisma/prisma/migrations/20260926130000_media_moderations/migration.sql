-- Moderation classifier results per asset (#4880), next to the perception
-- record. One live row per ingredient; identical bytes reuse a result through
-- the (organizationId, assetHash, provider) index. Additive; no backfill.

CREATE TABLE "media_moderations" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "ingredientId" TEXT NOT NULL,
  "assetHash" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "isFlagged" BOOLEAN NOT NULL DEFAULT false,
  "flaggedCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "maxConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "verdict" JSONB NOT NULL,
  "candidateVerdict" JSONB NOT NULL,
  "inputs" JSONB NOT NULL DEFAULT '[]',
  "thresholds" JSONB NOT NULL DEFAULT '{}',
  "reusedFromId" TEXT,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "media_moderations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "media_moderations_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "media_moderations_ingredientId_fkey"
    FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "media_moderations_org_ingredient_key"
  ON "media_moderations"("organizationId", "ingredientId");

CREATE INDEX "media_moderations_org_hash_provider_deleted_idx"
  ON "media_moderations"("organizationId", "assetHash", "provider", "isDeleted");

CREATE INDEX "media_moderations_org_flagged_deleted_idx"
  ON "media_moderations"("organizationId", "isFlagged", "isDeleted");
