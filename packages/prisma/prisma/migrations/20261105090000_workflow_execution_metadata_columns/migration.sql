-- Promote the identity keys that hot paths read from `result.metadata` to real
-- columns. The customer activity list, the agent thread snapshot poll, the
-- platform schedule sweep and the stale-PENDING reconciler all filtered on
-- `result #> '{metadata,…}'`, so every candidate row had its `result` blob
-- read and detoasted before Postgres could discard it. Three JSONB expression
-- indexes covered part of that; later migrations replace them with plain
-- column indexes.
--
-- The keys are set once, when the execution is created, and never change. A
-- BEFORE INSERT trigger copies them from `result.metadata`, so every writer
-- (the running release during the deploy, raw-SQL fixtures, future callers)
-- fills them without knowing about the columns. The next migration backfills
-- existing rows in committed batches.
--
-- A value is copied only when the JSON holds a string (or `true` for
-- `isSystemAction`): JSON path equality never matched any other type, so the
-- columns keep the old filters' semantics.
--
-- Additive: nullable columns and one constant-default boolean (metadata-only
-- changes), so the running release keeps working while this applies.

ALTER TABLE "workflow_executions"
  ADD COLUMN IF NOT EXISTS "canonicalId" TEXT,
  ADD COLUMN IF NOT EXISTS "source" TEXT,
  ADD COLUMN IF NOT EXISTS "strategyId" TEXT,
  ADD COLUMN IF NOT EXISTS "brandId" TEXT,
  ADD COLUMN IF NOT EXISTS "threadId" TEXT,
  ADD COLUMN IF NOT EXISTS "dispatchClass" TEXT,
  ADD COLUMN IF NOT EXISTS "dispatchId" TEXT,
  ADD COLUMN IF NOT EXISTS "campaignId" TEXT,
  ADD COLUMN IF NOT EXISTS "isSystemAction" BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION "workflow_execution_metadata_text"(metadata JSONB, key TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN jsonb_typeof(metadata -> key) = 'string' THEN metadata ->> key END
$$;

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
  NEW."brandId" := "workflow_execution_metadata_text"(metadata, 'brandId');
  NEW."threadId" := "workflow_execution_metadata_text"(metadata, 'threadId');
  NEW."dispatchClass" := "workflow_execution_metadata_text"(metadata, 'dispatchClass');
  NEW."dispatchId" := "workflow_execution_metadata_text"(metadata, 'dispatchId');
  NEW."campaignId" := "workflow_execution_metadata_text"(metadata, 'campaignId');
  NEW."isSystemAction" := COALESCE(metadata -> 'isSystemAction' = 'true'::jsonb, false);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "workflow_execution_metadata_promotion" ON "workflow_executions";
CREATE TRIGGER "workflow_execution_metadata_promotion"
  BEFORE INSERT ON "workflow_executions"
  FOR EACH ROW EXECUTE FUNCTION "promote_workflow_execution_metadata"();
