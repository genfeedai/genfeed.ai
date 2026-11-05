-- Backfill the promoted `workflow_executions` metadata columns (previous
-- migration) for rows created before the insert trigger existed.
--
-- `workflow_executions` is large and written constantly by running workflows,
-- so one table-wide UPDATE would hold every row lock until it committed and
-- stall those writes. This walks the primary key in batches of 2,000 and
-- commits after each one, so a running workflow waits at most one batch.
-- COMMIT inside DO is allowed only outside a transaction block: keep this as
-- the migration's only statement.
--
-- Idempotent: it recomputes the same values, so an interrupted run can simply
-- be applied again. `result -> 'metadata'` is read once per row. The walk stops
-- at the newest id present when it starts: rows inserted meanwhile are already
-- filled by the insert trigger, and chasing them could keep the loop running
-- for as long as workflows keep writing.
DO $$
DECLARE
  last_id TEXT := '';
  upper_bound TEXT;
  batch_ids TEXT[];
  batch_updated BIGINT;
  total_updated BIGINT := 0;
BEGIN
  SELECT max("id") INTO upper_bound FROM "workflow_executions";

  LOOP
    SELECT array_agg("id" ORDER BY "id")
    INTO batch_ids
    FROM (
      SELECT "id"
      FROM "workflow_executions"
      WHERE "id" > last_id
        AND "id" <= upper_bound
      ORDER BY "id"
      LIMIT 2000
    ) AS batch;

    EXIT WHEN batch_ids IS NULL;

    UPDATE "workflow_executions" AS execution
    SET (
      "canonicalId",
      "source",
      "strategyId",
      "threadId",
      "dispatchClass",
      "dispatchId",
      "campaignId",
      "isSystemAction"
    ) = (
      SELECT
        "workflow_execution_metadata_text"(m.metadata, 'canonicalId'),
        "workflow_execution_metadata_text"(m.metadata, 'source'),
        COALESCE(
          "workflow_execution_metadata_text"(m.metadata, 'strategyId'),
          "workflow_execution_metadata_text"(m.metadata, 'agentStrategyId')
        ),
        "workflow_execution_metadata_text"(m.metadata, 'threadId'),
        "workflow_execution_metadata_text"(m.metadata, 'dispatchClass'),
        "workflow_execution_metadata_text"(m.metadata, 'dispatchId'),
        "workflow_execution_metadata_text"(m.metadata, 'campaignId'),
        COALESCE(m.metadata -> 'isSystemAction' = 'true'::jsonb, false)
      FROM (SELECT execution."result" -> 'metadata' AS metadata) AS m
    )
    WHERE execution."id" = ANY(batch_ids)
      AND jsonb_typeof(execution."result" -> 'metadata') = 'object';

    GET DIAGNOSTICS batch_updated = ROW_COUNT;
    total_updated := total_updated + batch_updated;
    last_id := batch_ids[array_upper(batch_ids, 1)];
    COMMIT;
  END LOOP;

  INSERT INTO "data_backfills" ("id", "report")
  VALUES (
    'workflow_execution_metadata_columns_20261105',
    jsonb_build_object('executionsUpdated', total_updated)
  )
  ON CONFLICT ("id") DO UPDATE SET
    "completedAt" = CURRENT_TIMESTAMP,
    "report" = EXCLUDED."report";
END
$$;
