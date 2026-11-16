-- One-time cleanup of the workflow status notification backlog (#10384).
--
-- Every finished workflow run wrote an event and one email delivery, and the
-- delivery worker then marked that email `skipped` for the user who has the
-- channel off (about 219k rows on the hosted database). The daily retention
-- task removes such rows after 30 days; this migration removes the backlog now
-- instead of leaving it to the first retention runs.
--
-- Two passes, each in batches of 5,000 that commit one by one, so a concurrent
-- write waits at most one batch. COMMIT inside DO is allowed only outside a
-- transaction block: keep this as the migration's only statement.
--
-- 1. Skipped `workflow.status` email deliveries older than 30 days, the same
--    window the retention task applies to a delivery in a final state. A
--    delivery with a tracked `email_messages` row is never selected.
-- 2. Workflow execution events older than 30 days that no delivery and no
--    inbox item references any more. An event a user's bell still shows keeps
--    its inbox item and is left to the 90 day retention window.
--
-- Idempotent: an interrupted run can simply be applied again.
DO $$
DECLARE
  cutoff TIMESTAMP := (now() AT TIME ZONE 'UTC') - INTERVAL '30 days';
  batch_ids TEXT[];
  batch_deleted BIGINT;
  deliveries_deleted BIGINT := 0;
  events_deleted BIGINT := 0;
BEGIN
  LOOP
    SELECT array_agg("id")
    INTO batch_ids
    FROM (
      SELECT d."id"
      FROM "notification_deliveries" d
      WHERE d."topic" = 'workflow.status'
        AND d."channel" = 'email'
        AND d."status" = 'skipped'
        AND d."createdAt" < cutoff
        AND NOT EXISTS (
          SELECT 1 FROM "email_messages" m WHERE m."deliveryId" = d."id"
        )
      LIMIT 5000
    ) AS batch;

    EXIT WHEN batch_ids IS NULL;

    DELETE FROM "notification_deliveries" d
    WHERE d."id" = ANY(batch_ids)
      AND NOT EXISTS (
        SELECT 1 FROM "email_messages" m WHERE m."deliveryId" = d."id"
      );

    GET DIAGNOSTICS batch_deleted = ROW_COUNT;
    deliveries_deleted := deliveries_deleted + batch_deleted;
    COMMIT;

    -- A page that deletes nothing would be selected again forever.
    EXIT WHEN batch_deleted = 0;
  END LOOP;

  LOOP
    SELECT array_agg("id")
    INTO batch_ids
    FROM (
      SELECT e."id"
      FROM "notification_events" e
      WHERE e."sourceType" = 'workflow_execution'
        AND e."eventKey" IN (
          'workflow-execution-completed',
          'workflow-execution-failed',
          'workflow.execution.completed',
          'workflow.execution.failed'
        )
        AND e."occurredAt" < cutoff
        AND NOT EXISTS (
          SELECT 1 FROM "notification_deliveries" d WHERE d."eventId" = e."id"
        )
        AND NOT EXISTS (
          SELECT 1 FROM "notification_inbox_items" i WHERE i."eventId" = e."id"
        )
      LIMIT 5000
    ) AS batch;

    EXIT WHEN batch_ids IS NULL;

    DELETE FROM "notification_events" e
    WHERE e."id" = ANY(batch_ids)
      AND NOT EXISTS (
        SELECT 1 FROM "notification_deliveries" d WHERE d."eventId" = e."id"
      )
      AND NOT EXISTS (
        SELECT 1 FROM "notification_inbox_items" i WHERE i."eventId" = e."id"
      );

    GET DIAGNOSTICS batch_deleted = ROW_COUNT;
    events_deleted := events_deleted + batch_deleted;
    COMMIT;

    EXIT WHEN batch_deleted = 0;
  END LOOP;

  INSERT INTO "data_backfills" ("id", "report")
  VALUES (
    'purge_workflow_status_notification_rows_20261116',
    jsonb_build_object(
      'deliveriesDeleted', deliveries_deleted,
      'eventsDeleted', events_deleted
    )
  )
  ON CONFLICT ("id") DO UPDATE SET
    "completedAt" = CURRENT_TIMESTAMP,
    "report" = EXCLUDED."report";
END
$$;
