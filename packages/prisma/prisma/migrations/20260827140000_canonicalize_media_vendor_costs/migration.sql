-- Preserve the earliest active media-cost row as the canonical historical
-- event and soft-delete later duplicates. The earlier attribution migration
-- assigned its idempotency key to this same survivor ordering.
WITH ranked_media_costs AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "organizationId", "ingredientId"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS row_number
  FROM "media_vendor_costs"
  WHERE "ingredientId" IS NOT NULL
    AND "isDeleted" = false
)
UPDATE "media_vendor_costs" AS cost
SET
  "isDeleted" = true,
  "updatedAt" = NOW()
FROM ranked_media_costs AS ranked
WHERE cost."id" = ranked."id"
  AND ranked.row_number > 1;
