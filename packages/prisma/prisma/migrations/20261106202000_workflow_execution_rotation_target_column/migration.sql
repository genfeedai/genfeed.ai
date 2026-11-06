-- Promote `result.metadata.contentRotationTargetKey` to a column. Each
-- campaign orchestration cycle counts the rotation targets of up to 1,000
-- recent campaign runs; it loaded every run's whole `result` to read this one
-- key. The key is written once, when the campaign orchestrator dispatches the
-- run, so it joins the insert-time promotion trigger from
-- 20261105090000_workflow_execution_metadata_columns. The next migration
-- backfills existing campaign runs.
--
-- Additive: a nullable column (metadata-only change), so the running release
-- keeps working while this applies.

ALTER TABLE "workflow_executions"
  ADD COLUMN IF NOT EXISTS "contentRotationTargetKey" TEXT;

CREATE OR REPLACE FUNCTION "promote_workflow_execution_metadata"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  metadata JSONB := CASE
    WHEN jsonb_typeof(NEW."result" -> 'metadata') = 'object'
      THEN NEW."result" -> 'metadata'
    ELSE '{}'::jsonb
  END;
BEGIN
  NEW."canonicalId" := "workflow_execution_metadata_text"(metadata, 'canonicalId');
  NEW."source" := "workflow_execution_metadata_text"(metadata, 'source');
  NEW."strategyId" := COALESCE(
    "workflow_execution_metadata_text"(metadata, 'strategyId'),
    "workflow_execution_metadata_text"(metadata, 'agentStrategyId')
  );
  NEW."threadId" := "workflow_execution_metadata_text"(metadata, 'threadId');
  NEW."dispatchClass" := "workflow_execution_metadata_text"(metadata, 'dispatchClass');
  NEW."dispatchId" := "workflow_execution_metadata_text"(metadata, 'dispatchId');
  NEW."campaignId" := "workflow_execution_metadata_text"(metadata, 'campaignId');
  NEW."isSystemAction" := COALESCE(metadata -> 'isSystemAction' = 'true'::jsonb, false);
  NEW."contentRotationTargetKey" := "workflow_execution_metadata_text"(metadata, 'contentRotationTargetKey');
  RETURN NEW;
END;
$$;
