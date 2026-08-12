-- Promote hot filter fields out of JSON for BatchItem, ContentPlan,
-- ContentPlanItem, and Insight. One migration so the #2519 review lands
-- together. Sibling audit models (AdPerformance, Post, WorkflowExecution)
-- are intentionally untouched.

CREATE TYPE "BatchItemStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'SKIPPED'
);

ALTER TABLE "content_plans"
ADD COLUMN "executedCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "content_plans"
SET "executedCount" = COALESCE(
  CASE
    WHEN "config"->>'executedCount' ~ '^-?[0-9]+$'
    THEN ("config"->>'executedCount')::integer
    ELSE 0
  END,
  0
);

ALTER TABLE "content_plan_items"
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN "scheduledAt" TIMESTAMP(3);

UPDATE "content_plan_items"
SET
  "status" = COALESCE(NULLIF("data"->>'status', ''), 'pending'),
  "scheduledAt" = CASE
    WHEN NULLIF("data"->>'scheduledAt', '') IS NULL THEN NULL
    WHEN "data"->>'scheduledAt' ~ '^[0-9]{4}-'
    THEN ("data"->>'scheduledAt')::timestamp
    ELSE NULL
  END;

CREATE INDEX "content_plan_items_org_status_scheduled_idx"
ON "content_plan_items"("organizationId", "isDeleted", "status", "scheduledAt");

CREATE INDEX "content_plan_items_plan_scheduled_idx"
ON "content_plan_items"("planId", "isDeleted", "scheduledAt");

ALTER TABLE "insights"
ADD COLUMN "category" TEXT,
ADD COLUMN "isRead" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "isDismissed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "expiresAt" TIMESTAMP(3);

UPDATE "insights"
SET
  "category" = NULLIF("data"->>'category', ''),
  "isRead" = COALESCE(
    CASE
      WHEN "data"->>'isRead' IN ('true', 'false')
      THEN ("data"->>'isRead')::boolean
      ELSE false
    END,
    false
  ),
  "isDismissed" = COALESCE(
    CASE
      WHEN "data"->>'isDismissed' IN ('true', 'false')
      THEN ("data"->>'isDismissed')::boolean
      ELSE false
    END,
    false
  ),
  "expiresAt" = CASE
    WHEN NULLIF("data"->>'expiresAt', '') IS NULL THEN NULL
    WHEN "data"->>'expiresAt' ~ '^[0-9]{4}-'
    THEN ("data"->>'expiresAt')::timestamp
    ELSE NULL
  END;

CREATE INDEX "insights_org_active_created_at_idx"
ON "insights"(
  "organizationId",
  "isDeleted",
  "isRead",
  "isDismissed",
  "expiresAt",
  "createdAt" DESC
);

CREATE TABLE "batch_items" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "brandId" TEXT,
  "batchId" TEXT NOT NULL,
  "status" "BatchItemStatus" NOT NULL DEFAULT 'PENDING',
  "reviewDecision" "ReviewDecision",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "data" JSONB NOT NULL DEFAULT '{}',

  CONSTRAINT "batch_items_pkey" PRIMARY KEY ("id")
);

INSERT INTO "batch_items" (
  "id",
  "organizationId",
  "brandId",
  "batchId",
  "status",
  "reviewDecision",
  "createdAt",
  "updatedAt",
  "isDeleted",
  "data"
)
SELECT
  COALESCE(NULLIF(item->>'id', ''), gen_random_uuid()::text),
  batch."organizationId",
  batch."brandId",
  batch."id",
  CASE upper(COALESCE(item->>'status', ''))
    WHEN 'PENDING' THEN 'PENDING'::"BatchItemStatus"
    WHEN 'PROCESSING' THEN 'PROCESSING'::"BatchItemStatus"
    WHEN 'COMPLETED' THEN 'COMPLETED'::"BatchItemStatus"
    WHEN 'FAILED' THEN 'FAILED'::"BatchItemStatus"
    WHEN 'SKIPPED' THEN 'SKIPPED'::"BatchItemStatus"
    ELSE 'PENDING'::"BatchItemStatus"
  END,
  CASE
    WHEN lower(COALESCE(item->>'reviewDecision', '')) IN ('approved')
      THEN 'APPROVED'::"ReviewDecision"
    WHEN lower(COALESCE(item->>'reviewDecision', '')) IN ('rejected')
      THEN 'REJECTED'::"ReviewDecision"
    WHEN lower(COALESCE(item->>'reviewDecision', '')) IN (
      'request_changes',
      'request-changes',
      'requestchanges'
    )
      THEN 'REQUEST_CHANGES'::"ReviewDecision"
    WHEN upper(COALESCE(item->>'reviewDecision', '')) IN (
      'APPROVED',
      'REJECTED',
      'REQUEST_CHANGES'
    )
      THEN upper(item->>'reviewDecision')::"ReviewDecision"
    ELSE NULL
  END,
  COALESCE(
    CASE
      WHEN NULLIF(item->>'createdAt', '') IS NULL THEN NULL
      WHEN item->>'createdAt' ~ '^[0-9]{4}-'
      THEN (item->>'createdAt')::timestamp
      ELSE NULL
    END,
    batch."createdAt"
  ),
  CURRENT_TIMESTAMP,
  false,
  item
FROM "batches" AS batch
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN jsonb_typeof(batch."items") = 'array' THEN batch."items"
    ELSE '[]'::jsonb
  END
) AS item
WHERE jsonb_typeof(item) = 'object'
ON CONFLICT ("id") DO NOTHING;

CREATE INDEX "batch_items_org_status_review_created_idx"
ON "batch_items"(
  "organizationId",
  "isDeleted",
  "status",
  "reviewDecision",
  "createdAt" DESC
);

CREATE INDEX "batch_items_org_brand_status_review_created_idx"
ON "batch_items"(
  "organizationId",
  "brandId",
  "isDeleted",
  "status",
  "reviewDecision",
  "createdAt" DESC
);

CREATE INDEX "batch_items_batch_created_idx"
ON "batch_items"("batchId", "isDeleted", "createdAt");

ALTER TABLE "batch_items"
ADD CONSTRAINT "batch_items_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "batch_items"
ADD CONSTRAINT "batch_items_brandId_fkey"
FOREIGN KEY ("brandId") REFERENCES "brands"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "batch_items"
ADD CONSTRAINT "batch_items_batchId_fkey"
FOREIGN KEY ("batchId") REFERENCES "batches"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
