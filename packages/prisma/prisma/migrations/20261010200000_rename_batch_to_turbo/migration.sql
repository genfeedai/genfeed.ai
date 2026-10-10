-- #5936 Rename the Batch product to Turbo, as a hard cut (no compatibility
-- names). Every object is renamed in place; no row is copied, and the
-- migration aborts when any of the four tables changes row count.
--
-- Stored references that the application reads are rewritten in the same
-- transaction:
--   agent_messages.metadata      card types, review links, id keys
--   content_runs.config          review.batchId
--   posts."targetSettings"       generation.metadata.reviewBatchId
--   turbo_runs.items / config, turbo_run_items.data,
--   turbo_projects.settings / quote, turbo_project_items.idea / dispatch
--   organization_settings."moduleOverrides"   module id batch -> turbo
--   platform_settings.flags      batch_ideas / studio_batch keys
-- Integrity-protected history (workflow_versions, admission sources,
-- agent_transfers) is never rewritten. System workflows are registered in
-- code by canonical id, so old in-flight runs must be drained before deploy
-- (see the PR runbook).

CREATE TEMP TABLE "_turbo_rename_counts" ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM "batches") AS runs,
  (SELECT count(*) FROM "batch_items") AS run_items,
  (SELECT count(*) FROM "batch_projects") AS projects,
  (SELECT count(*) FROM "batch_project_items") AS project_items;

-- Enum types
ALTER TYPE "BatchStatus" RENAME TO "TurboRunStatus";
ALTER TYPE "BatchItemStatus" RENAME TO "TurboRunItemStatus";
ALTER TYPE "BatchProjectKind" RENAME TO "TurboProjectKind";
ALTER TYPE "BatchProjectStatus" RENAME TO "TurboProjectStatus";
ALTER TYPE "BatchProjectItemStatus" RENAME TO "TurboProjectItemStatus";

-- Tables
ALTER TABLE "batches" RENAME TO "turbo_runs";
ALTER TABLE "batch_items" RENAME TO "turbo_run_items";
ALTER TABLE "batch_projects" RENAME TO "turbo_projects";
ALTER TABLE "batch_project_items" RENAME TO "turbo_project_items";

-- Columns
ALTER TABLE "turbo_run_items" RENAME COLUMN "batchId" TO "turboRunId";
ALTER TABLE "turbo_projects" RENAME COLUMN "reviewBatchId" TO "reviewTurboRunId";
ALTER TABLE "turbo_project_items" RENAME COLUMN "reviewBatchId" TO "reviewTurboRunId";
ALTER TABLE "posts" RENAME COLUMN "reviewBatchId" TO "reviewTurboRunId";

-- Constraints (primary keys rename their backing index too)
ALTER TABLE "turbo_runs" RENAME CONSTRAINT "batches_pkey" TO "turbo_runs_pkey";
ALTER TABLE "turbo_runs" RENAME CONSTRAINT "batches_agentStrategyId_fkey" TO "turbo_runs_agentStrategyId_fkey";
ALTER TABLE "turbo_runs" RENAME CONSTRAINT "batches_brandId_fkey" TO "turbo_runs_brandId_fkey";
ALTER TABLE "turbo_runs" RENAME CONSTRAINT "batches_organizationId_fkey" TO "turbo_runs_organizationId_fkey";
ALTER TABLE "turbo_runs" RENAME CONSTRAINT "batches_userId_fkey" TO "turbo_runs_userId_fkey";

ALTER TABLE "turbo_run_items" RENAME CONSTRAINT "batch_items_pkey" TO "turbo_run_items_pkey";
ALTER TABLE "turbo_run_items" RENAME CONSTRAINT "batch_items_assigneeId_fkey" TO "turbo_run_items_assigneeId_fkey";
ALTER TABLE "turbo_run_items" RENAME CONSTRAINT "batch_items_batchId_fkey" TO "turbo_run_items_turboRunId_fkey";
ALTER TABLE "turbo_run_items" RENAME CONSTRAINT "batch_items_brandId_fkey" TO "turbo_run_items_brandId_fkey";
ALTER TABLE "turbo_run_items" RENAME CONSTRAINT "batch_items_organizationId_fkey" TO "turbo_run_items_organizationId_fkey";

ALTER TABLE "turbo_projects" RENAME CONSTRAINT "batch_projects_pkey" TO "turbo_projects_pkey";
ALTER TABLE "turbo_projects" RENAME CONSTRAINT "batch_projects_organizationId_fkey" TO "turbo_projects_organizationId_fkey";

ALTER TABLE "turbo_project_items" RENAME CONSTRAINT "batch_project_items_pkey" TO "turbo_project_items_pkey";
ALTER TABLE "turbo_project_items" RENAME CONSTRAINT "batch_project_items_organizationId_fkey" TO "turbo_project_items_organizationId_fkey";
ALTER TABLE "turbo_project_items" RENAME CONSTRAINT "batch_project_items_projectId_fkey" TO "turbo_project_items_projectId_fkey";

-- Indexes
ALTER INDEX "batches_deleted_settlement_shortfall_idx" RENAME TO "turbo_runs_deleted_settlement_shortfall_idx";
ALTER INDEX "batches_org_brand_deleted_created_at_idx" RENAME TO "turbo_runs_org_brand_deleted_created_at_idx";
ALTER INDEX "batches_org_deleted_created_at_idx" RENAME TO "turbo_runs_org_deleted_created_at_idx";
ALTER INDEX "batches_org_deleted_status_created_at_idx" RENAME TO "turbo_runs_org_deleted_status_created_at_idx";
ALTER INDEX "batch_items_batch_created_idx" RENAME TO "turbo_run_items_turbo_run_created_idx";
ALTER INDEX "batch_items_org_assignee_deleted_idx" RENAME TO "turbo_run_items_org_assignee_deleted_idx";
ALTER INDEX "batch_items_org_brand_status_review_created_idx" RENAME TO "turbo_run_items_org_brand_status_review_created_idx";
ALTER INDEX "batch_items_org_status_review_created_idx" RENAME TO "turbo_run_items_org_status_review_created_idx";
ALTER INDEX "batch_projects_organizationId_brandId_isDeleted_updatedAt_idx" RENAME TO "turbo_projects_organizationId_brandId_isDeleted_updatedAt_idx";
ALTER INDEX "batch_projects_status_isDeleted_updatedAt_idx" RENAME TO "turbo_projects_status_isDeleted_updatedAt_idx";
ALTER INDEX "batch_project_items_org_project_position_idx" RENAME TO "turbo_project_items_org_project_position_idx";
ALTER INDEX "batch_project_items_organizationId_reviewItemId_isDeleted_idx" RENAME TO "turbo_project_items_organizationId_reviewItemId_isDeleted_idx";

-- Stored references. Exact JSON tokens only: keys keep their quotes and
-- colon, values keep their quotes, so unrelated text never matches.
CREATE FUNCTION pg_temp.turbo_tokens(value jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT replace(replace(replace(replace(replace(replace(replace(replace(replace(
    value::text,
    '"batchId":', '"turboRunId":'),
    '"reviewBatchId":', '"reviewTurboRunId":'),
    '"batchProjectId":', '"turboProjectId":'),
    '"batchItemId":', '"turboRunItemId":'),
    '"batch_generation_result_card"', '"turbo_run_result_card"'),
    '"batch_generation_card"', '"turbo_run_card"'),
    '/publishing/review?batch=', '/publishing/review?run='),
    '/publishing/posts?batch=', '/publishing/posts?run='),
    '/studio/batch', '/studio/turbo')::jsonb
$$;

UPDATE "agent_messages" SET "metadata" = pg_temp.turbo_tokens("metadata")
WHERE "metadata" IS NOT NULL
  AND "metadata"::text ~ '"(batchId|reviewBatchId|batchProjectId|batchItemId)":|batch_generation|\?batch=|/studio/batch';
UPDATE "content_runs" SET "config" = pg_temp.turbo_tokens("config")
WHERE "config"::text ~ '"(batchId|reviewBatchId|batchProjectId|batchItemId)":';
UPDATE "posts" SET "targetSettings" = pg_temp.turbo_tokens("targetSettings")
WHERE "targetSettings" IS NOT NULL
  AND "targetSettings"::text ~ '"(batchId|reviewBatchId|batchProjectId|batchItemId)":';
UPDATE "turbo_runs" SET "items" = pg_temp.turbo_tokens("items"), "config" = pg_temp.turbo_tokens("config")
WHERE ("items"::text || "config"::text) ~ '"(batchId|reviewBatchId|batchProjectId|batchItemId)":';
UPDATE "turbo_run_items" SET "data" = pg_temp.turbo_tokens("data")
WHERE "data"::text ~ '"(batchId|reviewBatchId|batchProjectId|batchItemId)":';
UPDATE "turbo_projects" SET "settings" = pg_temp.turbo_tokens("settings"), "quote" = pg_temp.turbo_tokens("quote")
WHERE ("settings"::text || coalesce("quote"::text, '')) ~ '"(batchId|reviewBatchId|batchProjectId|batchItemId)":';
UPDATE "turbo_project_items" SET "idea" = pg_temp.turbo_tokens("idea"), "dispatch" = pg_temp.turbo_tokens("dispatch")
WHERE (coalesce("idea"::text, '') || coalesce("dispatch"::text, '')) ~ '"(batchId|reviewBatchId|batchProjectId|batchItemId)":';

-- Module preference: the batch module is the turbo module.
UPDATE "organization_settings"
SET "moduleOverrides" = ("moduleOverrides" - 'batch')
  || jsonb_build_object('turbo', "moduleOverrides" -> 'batch')
WHERE jsonb_typeof("moduleOverrides") = 'object' AND "moduleOverrides" ? 'batch';

-- Platform flags keep their stored values under the new keys.
UPDATE "platform_settings"
SET "flags" = ("flags" - 'batch_ideas')
  || jsonb_build_object('turbo_ideas', "flags" -> 'batch_ideas')
WHERE jsonb_typeof("flags") = 'object' AND "flags" ? 'batch_ideas';
UPDATE "platform_settings"
SET "flags" = ("flags" - 'studio_batch')
  || jsonb_build_object('studio_turbo', "flags" -> 'studio_batch')
WHERE jsonb_typeof("flags") = 'object' AND "flags" ? 'studio_batch';

DO $$
DECLARE
  before_counts RECORD;
BEGIN
  SELECT * INTO before_counts FROM "_turbo_rename_counts";
  IF before_counts.runs <> (SELECT count(*) FROM "turbo_runs")
    OR before_counts.run_items <> (SELECT count(*) FROM "turbo_run_items")
    OR before_counts.projects <> (SELECT count(*) FROM "turbo_projects")
    OR before_counts.project_items <> (SELECT count(*) FROM "turbo_project_items")
  THEN
    RAISE EXCEPTION 'Turbo rename changed row counts; aborting';
  END IF;
END $$;
