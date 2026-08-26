-- Stable organization/brand attribution for agency cost reporting.
-- Null remains a first-class "Unattributed" bucket for org-wide generations.

ALTER TABLE "llm_vendor_costs"
  ADD COLUMN "brandId" TEXT;

ALTER TABLE "media_vendor_costs"
  ADD COLUMN "brandId" TEXT,
  ADD COLUMN "idempotencyKey" TEXT;

-- Historical media rows have an immutable ingredient lineage.
UPDATE "media_vendor_costs" AS cost
SET "brandId" = ingredient."brandId"
FROM "ingredients" AS ingredient
WHERE cost."brandId" IS NULL
  AND cost."ingredientId" = ingredient."id"
  AND cost."organizationId" = ingredient."organizationId";

-- Agent run scope is the strongest historical LLM attribution signal.
UPDATE "llm_vendor_costs" AS cost
SET "brandId" = run."brandId"
FROM "agent_runs" AS run
WHERE cost."brandId" IS NULL
  AND cost."runId" = run."id"
  AND cost."organizationId" = run."organizationId"
  AND run."brandId" IS NOT NULL;

-- Fall back to the persisted thread scope when no run was attached.
UPDATE "llm_vendor_costs" AS cost
SET "brandId" = thread."brandId"
FROM "agent_threads" AS thread
WHERE cost."brandId" IS NULL
  AND cost."threadId" = thread."id"
  AND cost."organizationId" = thread."organizationId"
  AND thread."brandId" IS NOT NULL;

-- Seed one stable idempotency key per historical generated ingredient. Any
-- pre-existing duplicate rows remain unkeyed rather than making the migration
-- destructive; every new write uses the unique key below.
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "organizationId", "ingredientId"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS row_number
  FROM "media_vendor_costs"
  WHERE "ingredientId" IS NOT NULL
)
UPDATE "media_vendor_costs" AS cost
SET "idempotencyKey" =
  'media:' || cost."organizationId" || ':' || cost."ingredientId"
FROM ranked
WHERE cost."id" = ranked."id"
  AND ranked.row_number = 1;

CREATE UNIQUE INDEX "media_vendor_costs_idempotencyKey_key"
  ON "media_vendor_costs" ("idempotencyKey");

CREATE INDEX "llm_vendor_costs_org_brand_deleted_created_at_idx"
  ON "llm_vendor_costs"
  ("organizationId", "brandId", "isDeleted", "createdAt" DESC);

CREATE INDEX "media_vendor_costs_org_brand_deleted_created_at_idx"
  ON "media_vendor_costs"
  ("organizationId", "brandId", "isDeleted", "createdAt" DESC);

ALTER TABLE "llm_vendor_costs"
  ADD CONSTRAINT "llm_vendor_costs_brand_tenant_fkey"
  FOREIGN KEY ("brandId", "organizationId")
  REFERENCES "brands" ("id", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "media_vendor_costs"
  ADD CONSTRAINT "media_vendor_costs_brand_tenant_fkey"
  FOREIGN KEY ("brandId", "organizationId")
  REFERENCES "brands" ("id", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
