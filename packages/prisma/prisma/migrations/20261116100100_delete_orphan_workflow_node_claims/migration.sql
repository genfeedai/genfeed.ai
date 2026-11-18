-- Delete `workflow_node_claims` whose workflow execution no longer exists
-- (#10383). Claims had no foreign key, so purging a run left its claims behind.
--
-- The table is large and written constantly by running workflows, so this walks
-- it in batches of 5,000 and commits after each one: a running workflow waits
-- at most one batch. COMMIT inside DO is allowed only outside a transaction
-- block: keep this as the migration's only statement.
--
-- Idempotent: a claim is deleted only while no execution row has its
-- `executionId`, so an interrupted run can simply be applied again.
DO $$
DECLARE
  batch_deleted BIGINT;
  total_deleted BIGINT := 0;
BEGIN
  LOOP
    DELETE FROM "workflow_node_claims"
    WHERE "id" IN (
      SELECT claim."id"
      FROM "workflow_node_claims" AS claim
      WHERE NOT EXISTS (
        SELECT 1
        FROM "workflow_executions" AS execution
        WHERE execution."id" = claim."executionId"
      )
      LIMIT 5000
    );

    GET DIAGNOSTICS batch_deleted = ROW_COUNT;
    total_deleted := total_deleted + batch_deleted;
    COMMIT;
    EXIT WHEN batch_deleted = 0;
  END LOOP;

  INSERT INTO "data_backfills" ("id", "report")
  VALUES (
    'workflow_node_claims_orphan_cleanup_20261116',
    jsonb_build_object('claimsDeleted', total_deleted)
  )
  ON CONFLICT ("id") DO UPDATE SET
    "completedAt" = CURRENT_TIMESTAMP,
    "report" = EXCLUDED."report";
END
$$;
