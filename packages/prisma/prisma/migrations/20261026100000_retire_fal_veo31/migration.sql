-- fal retires fal-ai/veo3.1 on 2026-11-17 and names no replacement endpoint.
-- google/veo-3.1 keeps its Replicate execution, so the fal registration and its
-- routing offer are switched off and the catalog seed no longer owns the row.
-- Offers are only deactivated: executionModelId is ON DELETE RESTRICT and the
-- logical model's own offer rows stay intact.
UPDATE "model_provider_offers"
SET "isActive" = false,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "executionModelId" IN (
    SELECT "id" FROM "models"
    WHERE "key" = 'fal-ai/veo3.1'
      AND "organizationId" IS NULL
  )
  AND "isActive" = true;

UPDATE "models"
SET "isDeleted" = true,
    "isActive" = false,
    "isDefault" = false,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'fal-ai/veo3.1'
  AND "organizationId" IS NULL
  AND "isDeleted" = false;
