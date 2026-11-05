-- Promote the `workflows.metadata` keys that hot paths filter on to real
-- columns. Every customer workflow list hides system clones by
-- `metadata.systemWorkflow.kind`, workflow visibility checks read
-- `metadata.systemWorkflow.visibility`, the platform schedule sweep looks up
-- each due organization's install by `metadata.sourceTemplateId` or
-- `metadata.systemWorkflow.canonicalId` every minute, and template seeding and
-- install read the same keys. Each of those reads detoasted `metadata` for
-- every candidate row.
--
-- Unlike execution metadata, workflow metadata is rewritten after creation
-- (seed reconcile, system mirrors, tenant edits), so the trigger recomputes the
-- columns on INSERT and on every UPDATE of `metadata`. Every writer keeps them
-- in step without knowing about them, including the running release during the
-- deploy and raw-SQL migrations. The next migration backfills existing rows.
--
-- A value is copied only when the JSON holds a string: JSON path equality
-- never matched any other type, so the columns keep the old filters' semantics.
--
-- Additive: nullable columns (metadata-only change), so the running release
-- keeps working while this applies.

ALTER TABLE "workflows"
  ADD COLUMN IF NOT EXISTS "systemWorkflowKind" TEXT,
  ADD COLUMN IF NOT EXISTS "systemWorkflowCanonicalId" TEXT,
  ADD COLUMN IF NOT EXISTS "systemWorkflowVisibility" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceTemplateId" TEXT;

CREATE OR REPLACE FUNCTION "workflow_metadata_text"(metadata JSONB, path TEXT[])
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN jsonb_typeof(metadata #> path) = 'string' THEN metadata #>> path END
$$;

CREATE OR REPLACE FUNCTION "promote_workflow_metadata"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."systemWorkflowKind" := "workflow_metadata_text"(NEW."metadata", '{systemWorkflow,kind}');
  NEW."systemWorkflowCanonicalId" := "workflow_metadata_text"(NEW."metadata", '{systemWorkflow,canonicalId}');
  NEW."systemWorkflowVisibility" := "workflow_metadata_text"(NEW."metadata", '{systemWorkflow,visibility}');
  NEW."sourceTemplateId" := "workflow_metadata_text"(NEW."metadata", '{sourceTemplateId}');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "workflow_metadata_promotion" ON "workflows";
CREATE TRIGGER "workflow_metadata_promotion"
  BEFORE INSERT OR UPDATE OF "metadata" ON "workflows"
  FOR EACH ROW EXECUTE FUNCTION "promote_workflow_metadata"();
