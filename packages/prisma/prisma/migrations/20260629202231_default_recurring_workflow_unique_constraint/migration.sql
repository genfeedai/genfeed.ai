-- Enforce at-most-one default recurring workflow per (brand, contentType) (#892).
--
-- Background
-- ----------
-- The `ensureRecurringWorkflowForType` service runs inside a Serializable
-- transaction that re-checks for an existing workflow and, if absent, creates
-- one. Without a DB-level constraint, the P2002 catch in the service can never
-- fire — there is nothing preventing two concurrent transactions from each
-- committing a duplicate row even after a Serializable abort is retried.
--
-- Natural key
-- -----------
-- The service's in-transaction re-check is:
--   WHERE brands: { some: { id: brandId } }
--     AND organizationId = :organizationId
--     AND metadata->'defaultRecurringContent'->>'contentType' = :contentType
--     AND isDeleted = false
--
-- `brandId` lives in the `_workflow_brands` M2M join table (column A=brandId,
-- B=workflowId), not on `workflows` itself. A partial unique index spanning two
-- tables is not possible in Postgres. We therefore denormalize the brand identity
-- into a new nullable column `defaultRecurringBrandId` on `workflows` that is
-- set only for default-recurring system workflows (all others stay NULL). This
-- lets us express the constraint as a single-table partial unique index.
--
-- Safety against existing duplicates
-- ------------------------------------
-- Before creating the unique index we collapse any pre-existing duplicate
-- default-recurring rows by soft-deleting all but the oldest (lowest createdAt)
-- per natural key group. The backfill then sets `defaultRecurringBrandId` for
-- every surviving default-recurring row so the index can be built without
-- conflicts.
--
-- The migration is idempotent: the column addition uses IF NOT EXISTS phrasing
-- (via the nullable default), and the index creation is protected by a
-- DO $$…$$ block that skips it if the index already exists.

-- Step 1: Add the denormalized nullable column.
ALTER TABLE "workflows" ADD COLUMN IF NOT EXISTS "defaultRecurringBrandId" TEXT;

-- Step 2: Collapse pre-existing duplicates by soft-deleting all but the oldest
-- default-recurring workflow per (brandId, organizationId, contentType) group.
-- "Oldest" is defined as minimum createdAt; ties broken by minimum id (CUID
-- lexicographic order is creation-time order for same-millisecond ties).
WITH ranked AS (
  SELECT
    wf.id                                                                   AS workflow_id,
    wb."A"                                                                  AS brand_id,
    wf."organizationId",
    wf.metadata->>'defaultRecurringContent'->>'contentType'                 AS content_type,
    ROW_NUMBER() OVER (
      PARTITION BY wb."A", wf."organizationId",
                   wf.metadata->>'defaultRecurringContent'->>'contentType'
      ORDER BY wf."createdAt" ASC, wf.id ASC
    )                                                                       AS rn
  FROM "workflows" wf
  JOIN "_workflow_brands" wb ON wb."B" = wf.id
  WHERE wf."isDeleted" = false
    AND wf.metadata->>'taskType' = 'default-recurring-content'
    AND wf.metadata->'defaultRecurringContent'->>'contentType' IS NOT NULL
)
UPDATE "workflows"
SET    "isDeleted" = true,
       "updatedAt" = NOW()
FROM   ranked
WHERE  "workflows".id = ranked.workflow_id
  AND  ranked.rn > 1;

-- Step 3: Backfill `defaultRecurringBrandId` for every surviving (non-deleted)
-- default-recurring workflow using the brand linked via `_workflow_brands`.
-- When a workflow is (incorrectly) linked to multiple brands we take the
-- lexicographically smallest brand id for determinism; in practice system-
-- created default-recurring workflows are always linked to exactly one brand.
UPDATE "workflows" wf
SET    "defaultRecurringBrandId" = (
  SELECT MIN(wb."A")
  FROM   "_workflow_brands" wb
  WHERE  wb."B" = wf.id
)
WHERE  wf."isDeleted" = false
  AND  wf.metadata->>'taskType' = 'default-recurring-content'
  AND  wf.metadata->'defaultRecurringContent'->>'contentType' IS NOT NULL
  AND  wf."defaultRecurringBrandId" IS NULL;

-- Step 4: Create the partial unique index.
-- Skipped silently if it already exists (idempotent re-run safety).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'workflows_default_recurring_brand_org_type_uidx'
  ) THEN
    CREATE UNIQUE INDEX "workflows_default_recurring_brand_org_type_uidx"
      ON "workflows" (
        "defaultRecurringBrandId",
        "organizationId",
        (metadata->'defaultRecurringContent'->>'contentType')
      )
      WHERE "defaultRecurringBrandId" IS NOT NULL
        AND "isDeleted" = false;
  END IF;
END$$;
