-- Asset version lineage (#7395, #7397). Expand only: two nullable columns and
-- one partial index, no backfill. A link written before this migration keeps
-- `relationKind` NULL, which the reads treat as "lineage unavailable" instead
-- of guessing a version.

CREATE TYPE "IngredientRelationKind" AS ENUM ('VERSION', 'TRANSFORMATION', 'DERIVATIVE', 'SOURCE');

ALTER TABLE "ingredients"
  ADD COLUMN "relationKind" "IngredientRelationKind",
  ADD COLUMN "activeVersionId" TEXT;

-- A version family is read by walking down from its first asset, so only the
-- version-bearing links need the index.
CREATE INDEX "ingredients_version_parent_idx"
  ON "ingredients" ("parentId")
  WHERE "relationKind" IN ('VERSION', 'TRANSFORMATION');
