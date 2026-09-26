-- Typed text decisions on perception output (#4882). One row per ingredient
-- and subject (`asset`, or `caption:<sha256>`). Additive; no backfill.

CREATE TABLE "media_text_decisions" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "ingredientId" TEXT NOT NULL,
  "assetHash" TEXT NOT NULL,
  "subjectKey" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "decisions" JSONB NOT NULL DEFAULT '[]',
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "media_text_decisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "media_text_decisions_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "media_text_decisions_ingredientId_fkey"
    FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "media_text_decisions_org_ingredient_subject_key"
  ON "media_text_decisions"("organizationId", "ingredientId", "subjectKey");
