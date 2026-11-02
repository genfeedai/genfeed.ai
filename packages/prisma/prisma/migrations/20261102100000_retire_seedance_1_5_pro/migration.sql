-- Seedance 1.5 Pro was never offered (the import allow-list dropped it) and its
-- Replicate billing needs a resolver entry, so the discovered draft sits in the
-- pricing alert forever. Retire it once, with Seedance 2.5 as its successor.
-- Only the platform row is touched; a retired row never bills (dispatch
-- resolves its successor).
UPDATE "models"
SET "isActive" = false,
    "isDefault" = false,
    "lifecycle" = 'RETIRED'::"ModelLifecycle",
    "succeededBy" = 'bytedance/seedance-2.5',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'bytedance/seedance-1.5-pro'
  AND "organizationId" IS NULL
  AND "isDeleted" = false
  AND EXISTS (
    SELECT 1 FROM "models" AS successor
    WHERE successor."key" = 'bytedance/seedance-2.5'
      AND successor."organizationId" IS NULL
      AND successor."isDeleted" = false
  );
