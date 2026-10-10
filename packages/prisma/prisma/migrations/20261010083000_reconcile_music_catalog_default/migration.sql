-- Catalog activation changes apply only to new rows during normal seeding.
-- Retire the previous platform music default and activate its curated successor
-- once, preserving unrelated operator defaults and tenant-owned registry rows.
UPDATE "models"
SET "isActive" = false,
    "isDefault" = false,
    "lifecycle" = 'LEGACY'::"ModelLifecycle",
    "succeededBy" = 'fal-ai/lyria3/pro',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'meta/musicgen'
  AND "organizationId" IS NULL
  AND "isDeleted" = false;

UPDATE "models" AS target
SET "isActive" = true,
    "lifecycle" = 'RECOMMENDED'::"ModelLifecycle",
    "isDefault" = NOT EXISTS (
      SELECT 1 FROM "models" AS other
      WHERE other."category" = 'MUSIC'
        AND other."organizationId" IS NULL
        AND other."isDeleted" = false
        AND other."isDefault" = true
        AND other."key" <> target."key"
    ),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE target."key" = 'fal-ai/lyria3/pro'
  AND target."organizationId" IS NULL
  AND target."isDeleted" = false
  AND (target."isDiscovered" = false OR target."reviewStatus" = 'approved');
