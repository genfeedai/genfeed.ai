-- Backfill `contentRotationTargetKey` (previous migration) for campaign runs
-- written before the trigger copied it. Only campaign runs carry the key, so
-- only rows with a `campaignId` are touched.
--
-- Walks the primary key in batches of 2,000 rows and commits after each one,
-- so a concurrent write waits at most one batch. The walk stops at the newest
-- id present when it starts: rows written meanwhile are filled by the trigger.
-- COMMIT inside DO is allowed only outside a transaction block: keep this as
-- the migration's only statement. The promotion trigger fires on INSERT only,
-- so this sets the column directly. Idempotent.
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

    UPDATE "workflow_executions"
    SET "contentRotationTargetKey" = "workflow_execution_metadata_text"(
      "result" -> 'metadata',
      'contentRotationTargetKey'
    )
    WHERE "id" = ANY(batch_ids)
      AND "campaignId" IS NOT NULL
      AND jsonb_typeof("result" -> 'metadata') = 'object'
      AND "contentRotationTargetKey" IS DISTINCT FROM "workflow_execution_metadata_text"(
        "result" -> 'metadata',
        'contentRotationTargetKey'
      );

    GET DIAGNOSTICS batch_updated = ROW_COUNT;
    total_updated := total_updated + batch_updated;
    last_id := batch_ids[array_upper(batch_ids, 1)];
    COMMIT;
  END LOOP;

  INSERT INTO "data_backfills" ("id", "report")
  VALUES (
    'workflow_execution_rotation_target_20261106',
    jsonb_build_object('executionsUpdated', total_updated)
  )
  ON CONFLICT ("id") DO UPDATE SET
    "completedAt" = CURRENT_TIMESTAMP,
    "report" = EXCLUDED."report";
END
$$;
