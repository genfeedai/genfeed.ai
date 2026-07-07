-- Normalize workflows from brand M2M (`_workflow_brands`) to a single
-- org-scoped `workflows.brandId`.
--
-- Existing shared workflow links are preserved as independent workflow rows:
-- the source row keeps one primary brand, and every additional brand gets a
-- draft, unscheduled copy. This avoids hidden cross-brand edits and avoids
-- creating surprise new scheduled automations during migration.

ALTER TABLE "workflows" ADD COLUMN "brandId" TEXT;

WITH ranked_links AS (
  SELECT
    wf."id" AS workflow_id,
    wf."organizationId" AS workflow_org_id,
    wb."A" AS brand_id,
    b."organizationId" AS brand_org_id,
    ROW_NUMBER() OVER (
      PARTITION BY wf."id"
      ORDER BY
        CASE WHEN b."organizationId" = wf."organizationId" THEN 0 ELSE 1 END,
        wb."A"
    ) AS rank
  FROM "workflows" wf
  JOIN "_workflow_brands" wb ON wb."B" = wf."id"
  JOIN "brands" b ON b."id" = wb."A"
)
UPDATE "workflows" wf
SET "brandId" = ranked_links.brand_id
FROM ranked_links
WHERE ranked_links.workflow_id = wf."id"
  AND ranked_links.rank = 1
  AND ranked_links.brand_org_id = wf."organizationId";

WITH ranked_links AS (
  SELECT
    wf."id" AS workflow_id,
    wb."A" AS brand_id,
    b."organizationId" AS brand_org_id,
    ROW_NUMBER() OVER (
      PARTITION BY wf."id"
      ORDER BY
        CASE WHEN b."organizationId" = wf."organizationId" THEN 0 ELSE 1 END,
        wb."A"
    ) AS rank
  FROM "workflows" wf
  JOIN "_workflow_brands" wb ON wb."B" = wf."id"
  JOIN "brands" b ON b."id" = wb."A"
),
extra_links AS (
  SELECT
    ranked_links.*,
    'c' || substr(md5(ranked_links.workflow_id || ':' || ranked_links.brand_id || ':workflow-brand-one-to-one'), 1, 24) AS clone_id
  FROM ranked_links
  WHERE NOT (
    ranked_links.rank = 1
    AND ranked_links.brand_org_id = ranked_links.workflow_org_id
  )
)
INSERT INTO "workflows" (
  "id",
  "mongoId",
  "userId",
  "organizationId",
  "brandId",
  "label",
  "description",
  "steps",
  "nodes",
  "edges",
  "inputVariables",
  "config",
  "metadata",
  "recurrence",
  "lockedNodeIds",
  "status",
  "lifecycle",
  "isScheduleEnabled",
  "schedule",
  "timezone",
  "thumbnail",
  "thumbnailNodeId",
  "progress",
  "executionCount",
  "startedAt",
  "completedAt",
  "lastExecutedAt",
  "isDeleted",
  "createdAt",
  "updatedAt",
  "defaultRecurringBrandId"
)
SELECT
  extra_links.clone_id,
  NULL,
  wf."userId",
  extra_links.brand_org_id,
  extra_links.brand_id,
  CASE
    WHEN wf."label" IS NULL THEN NULL
    ELSE wf."label" || ' (Copy)'
  END,
  wf."description",
  wf."steps",
  wf."nodes",
  wf."edges",
  wf."inputVariables",
  wf."config",
  COALESCE(wf."metadata", '{}'::jsonb) ||
    jsonb_build_object(
      'duplicatedFromWorkflow',
      jsonb_build_object(
        'sourceWorkflowId', wf."id",
        'sourceBrandId', wf."brandId",
        'targetBrandId', extra_links.brand_id,
        'migration', 'workflow_brand_one_to_one'
      )
    ),
  wf."recurrence",
  wf."lockedNodeIds",
  'draft',
  wf."lifecycle",
  false,
  wf."schedule",
  wf."timezone",
  wf."thumbnail",
  wf."thumbnailNodeId",
  0,
  0,
  NULL,
  NULL,
  NULL,
  wf."isDeleted",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CASE
    WHEN wf."defaultRecurringBrandId" = extra_links.brand_id THEN extra_links.brand_id
    ELSE NULL
  END
FROM extra_links
JOIN "workflows" wf ON wf."id" = extra_links.workflow_id
WHERE NOT EXISTS (
  SELECT 1
  FROM "workflows" existing
  WHERE existing."id" = extra_links.clone_id
);

WITH ranked_links AS (
  SELECT
    wf."id" AS workflow_id,
    wf."organizationId" AS workflow_org_id,
    wb."A" AS brand_id,
    b."organizationId" AS brand_org_id,
    ROW_NUMBER() OVER (
      PARTITION BY wf."id"
      ORDER BY
        CASE WHEN b."organizationId" = wf."organizationId" THEN 0 ELSE 1 END,
        wb."A"
    ) AS rank
  FROM "workflows" wf
  JOIN "_workflow_brands" wb ON wb."B" = wf."id"
  JOIN "brands" b ON b."id" = wb."A"
),
extra_links AS (
  SELECT
    ranked_links.*,
    'c' || substr(md5(ranked_links.workflow_id || ':' || ranked_links.brand_id || ':workflow-brand-one-to-one'), 1, 24) AS clone_id
  FROM ranked_links
  WHERE NOT (
    ranked_links.rank = 1
    AND ranked_links.brand_org_id = ranked_links.workflow_org_id
  )
)
INSERT INTO "_workflow_tags" ("A", "B")
SELECT wt."A", extra_links.clone_id
FROM extra_links
JOIN "_workflow_tags" wt ON wt."B" = extra_links.workflow_id
ON CONFLICT DO NOTHING;

UPDATE "workflows"
SET "defaultRecurringBrandId" = NULL
WHERE "brandId" IS NULL
  AND "defaultRecurringBrandId" IS NOT NULL;

UPDATE "workflows"
SET "defaultRecurringBrandId" = "brandId"
WHERE "brandId" IS NOT NULL
  AND "defaultRecurringBrandId" IS NOT NULL
  AND "defaultRecurringBrandId" <> "brandId";

ALTER TABLE "brands"
ADD CONSTRAINT "brands_id_organizationId_key" UNIQUE ("id", "organizationId");

CREATE INDEX "workflows_organizationId_brandId_isDeleted_idx"
ON "workflows"("organizationId", "brandId", "isDeleted");

ALTER TABLE "workflows"
ADD CONSTRAINT "workflows_brandId_organizationId_fkey"
FOREIGN KEY ("brandId", "organizationId")
REFERENCES "brands"("id", "organizationId")
ON DELETE RESTRICT
ON UPDATE CASCADE;

DROP TABLE "_workflow_brands";
