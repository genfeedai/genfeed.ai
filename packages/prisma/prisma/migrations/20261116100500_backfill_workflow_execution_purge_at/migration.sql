-- Give finished runs of background system workflows a purge time (#10382), so
-- the platform purge task can drain history nothing ever deleted.
--
-- A run is background when its workflow is a hidden system workflow (owned by
-- the system principal), no person or agent started it (not an `interactive`
-- dispatch), it carries no scrub-then-purge contract of its own, and its
-- canonical id is not one of the kept ids below. The kept ids mirror the
-- system workflow definitions declared `kept`; a spec fails when they drift.
-- Policy: purge 24 hours after success and 14 days after failure or
-- cancellation.
--
-- `workflow_executions` is large and written constantly by running workflows,
-- so one table-wide UPDATE would hold every row lock until it committed and
-- stall those writes. This walks the primary key in batches of 2,000 and
-- commits after each one, so a running workflow waits at most one batch.
-- COMMIT inside DO is allowed only outside a transaction block: keep this as
-- the migration's only statement.
--
-- Idempotent: it only touches rows that still have no `retentionPolicy`, so an
-- interrupted run can simply be applied again. The walk stops at the newest id
-- present when it starts: runs created meanwhile already carry their policy.
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
    SET
      "retentionPolicy" = 'background',
      "purgeAt" = COALESCE(execution."completedAt", execution."updatedAt")
        + CASE
            WHEN execution."status" = 'COMPLETED' THEN interval '24 hours'
            ELSE interval '14 days'
          END
    WHERE execution."id" = ANY(batch_ids)
      AND execution."retentionPolicy" IS NULL
      AND execution."purgeAt" IS NULL
      AND execution."purgeAfterHours" IS NULL
      AND execution."payloadScrubbedAt" IS NULL
      AND execution."scrubAllNodePayloads" = false
      AND execution."scrubNodeIds" = '{}'
      AND execution."isDeleted" = false
      AND execution."status" IN ('COMPLETED', 'FAILED', 'CANCELLED')
      AND COALESCE(execution."dispatchClass", '') <> 'interactive'
      AND NOT (
        COALESCE(execution."canonicalId", '') = ANY (ARRAY[
          'admin.announcement.broadcast',
          'agent.thread.input-response',
          'agent.thread.ui-action',
          'agent.turn.execute',
          'breakout.response.execute',
          'campaign.reply.preview',
          'insight.generation',
          'signup.prefill',
          'social-source.history-import',
          'social.timeline.native-action',
          'turbo.run',
          'voice.generate',
          'workflow.batch.execute',
          'youtube-source-to-library',
          'youtube-to-long-form-text'
        ])
        OR COALESCE(execution."canonicalId", '') LIKE ANY (ARRAY[
          'ads.bulk-upload%',
          'agent.tool.%',
          'article.%',
          'brand-remix.%',
          'clipper.%',
          'content.optimization.%',
          'content.turbo.%',
          'knowledge.source.%',
          'playground.video.extend.%',
          'skill.%',
          'social.inbox.outbound.%',
          'telegram.%',
          'turbo-project.idea.dispatch%',
          'twitter.pipeline.%',
          'visual-code.%',
          'workspace.task.%'
        ])
      )
      AND EXISTS (
        SELECT 1
        FROM "workflows" AS workflow
        WHERE workflow."id" = execution."workflowId"
          AND workflow."organizationId" = 'genfeed-public-tools'
      );

    GET DIAGNOSTICS batch_updated = ROW_COUNT;
    total_updated := total_updated + batch_updated;
    last_id := batch_ids[array_upper(batch_ids, 1)];
    COMMIT;
  END LOOP;

  INSERT INTO "data_backfills" ("id", "report")
  VALUES (
    'workflow_execution_purge_at_20261116',
    jsonb_build_object('executionsUpdated', total_updated)
  )
  ON CONFLICT ("id") DO UPDATE SET
    "completedAt" = CURRENT_TIMESTAMP,
    "report" = EXCLUDED."report";
END
$$;
