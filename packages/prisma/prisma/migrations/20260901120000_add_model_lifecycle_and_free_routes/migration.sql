CREATE TYPE "ModelLifecycle" AS ENUM ('RECOMMENDED', 'AVAILABLE', 'LEGACY', 'RETIRED');

ALTER TABLE "models"
ADD COLUMN "lifecycle" "ModelLifecycle" NOT NULL DEFAULT 'AVAILABLE',
ADD COLUMN "isFree" BOOLEAN NOT NULL DEFAULT false;

UPDATE "models"
SET "lifecycle" = CASE
  WHEN ("isLegacy" = true OR "isDeprecated" = true)
    AND "succeededBy" IS NOT NULL
    AND "isActive" = false
    THEN 'RETIRED'::"ModelLifecycle"
  WHEN ("isLegacy" = true OR "isDeprecated" = true) AND "succeededBy" IS NOT NULL
    THEN 'LEGACY'::"ModelLifecycle"
  WHEN "isActive" = true AND ("isDefault" = true OR "isHighlighted" = true)
    THEN 'RECOMMENDED'::"ModelLifecycle"
  ELSE 'AVAILABLE'::"ModelLifecycle"
END;

-- Keep the historical projection fields aligned with lifecycle during the
-- cutover. Old deprecation rows without a valid successor remain Available;
-- an operator can choose a successor before moving them to Legacy.
UPDATE "models"
SET
  "isLegacy" = ("lifecycle" = 'LEGACY'::"ModelLifecycle"),
  "isDeprecated" = ("lifecycle" IN (
    'LEGACY'::"ModelLifecycle",
    'RETIRED'::"ModelLifecycle"
  )),
  "isDefault" = CASE
    WHEN "lifecycle" = 'RECOMMENDED'::"ModelLifecycle" THEN "isDefault"
    ELSE false
  END,
  "deprecatedAt" = CASE
    WHEN "lifecycle" IN (
      'LEGACY'::"ModelLifecycle",
      'RETIRED'::"ModelLifecycle"
    )
      THEN COALESCE("deprecatedAt", CURRENT_TIMESTAMP)
    ELSE NULL
  END;

UPDATE "models"
SET "isActive" = true
WHERE "lifecycle" = 'LEGACY'::"ModelLifecycle"
  AND ("isDiscovered" = false OR "reviewStatus" = 'approved');

UPDATE "models"
SET "isFree" = true
WHERE "key" = 'openrouter/free' OR "key" LIKE '%:free';

-- These two routes were previously represented as retired aliases. Restore
-- them as explicit operator-controlled routes without changing defaults.
UPDATE "models"
SET
  "lifecycle" = 'AVAILABLE'::"ModelLifecycle",
  "isActive" = true,
  "isDefault" = false,
  "isLegacy" = false,
  "isDeprecated" = false,
  "deprecatedAt" = NULL,
  "succeededBy" = NULL
WHERE "key" IN ('openrouter/auto', 'openrouter/free');

CREATE INDEX "models_lifecycle_category_active_deleted_idx"
ON "models"("lifecycle", "category", "isActive", "isDeleted");
