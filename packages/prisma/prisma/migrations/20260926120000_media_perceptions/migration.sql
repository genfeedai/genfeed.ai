-- Media perception artefacts per asset (#4879). One live row per ingredient,
-- keyed by the SHA-256 of the asset bytes so identical bytes are perceived
-- once per organization. Additive; no backfill — the workers sweep perceives
-- recently completed assets on its own schedule.

CREATE TABLE "media_perceptions" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "ingredientId" TEXT NOT NULL,
  "assetHash" TEXT NOT NULL,
  "schemaVersion" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "durationSeconds" DOUBLE PRECISION,
  "frames" JSONB NOT NULL DEFAULT '[]',
  "framesStatus" TEXT NOT NULL,
  "ocr" JSONB NOT NULL DEFAULT '[]',
  "ocrStatus" TEXT NOT NULL,
  "transcript" JSONB,
  "transcriptStatus" TEXT NOT NULL,
  "description" JSONB,
  "descriptionStatus" TEXT NOT NULL,
  "descriptionModel" TEXT,
  "diagnostics" JSONB NOT NULL DEFAULT '[]',
  "audioUrl" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3),
  "reusedFromId" TEXT,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "media_perceptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "media_perceptions_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "media_perceptions_ingredientId_fkey"
    FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "media_perceptions_org_ingredient_key"
  ON "media_perceptions"("organizationId", "ingredientId");

CREATE INDEX "media_perceptions_org_hash_deleted_idx"
  ON "media_perceptions"("organizationId", "assetHash", "isDeleted");

CREATE INDEX "media_perceptions_deleted_next_attempt_idx"
  ON "media_perceptions"("isDeleted", "nextAttemptAt");
