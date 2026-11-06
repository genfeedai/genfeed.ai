-- Copy the trend fields that older rows kept only in `data` into the
-- `isCurrent`, `expiresAt`, `platform`, `topic` and `viralityScore` columns.
--
-- The trend writer has stored these fields as columns since the columns were
-- added, while the trend read queries still looked for them in `data`. Reads
-- now use the columns, so rows written before the columns existed need them
-- filled. A column that already holds a value is never overwritten, and a
-- value of the wrong JSON type is skipped (helpers from 20261106200000 and
-- 20261106203900). `expiresAt` is copied only from an ISO-8601 string or a
-- `$date` wrapper.
--
-- Walks the primary key in batches of 2,000 rows and commits after each one,
-- so a concurrent write waits at most one batch. The walk stops at the newest
-- id present when it starts: rows written meanwhile come from the writer,
-- which fills the columns itself. COMMIT inside DO is allowed only outside a
-- transaction block: keep this as the migration's only statement. `updatedAt`
-- is untouched. Idempotent.
DO $$
DECLARE
  last_id TEXT := '';
  upper_bound TEXT;
  batch_ids TEXT[];
  batch_updated BIGINT;
  total_updated BIGINT := 0;
BEGIN
  SELECT max("id") INTO upper_bound FROM "trends";

  LOOP
    SELECT array_agg("id" ORDER BY "id")
    INTO batch_ids
    FROM (
      SELECT "id"
      FROM "trends"
      WHERE "id" > last_id
        AND "id" <= upper_bound
      ORDER BY "id"
      LIMIT 2000
    ) AS batch;

    EXIT WHEN batch_ids IS NULL;

    UPDATE "trends" AS t
    SET
      "isCurrent" = COALESCE(
        t."isCurrent",
        CASE jsonb_typeof(t."data" -> 'isCurrent')
          WHEN 'boolean' THEN (t."data" -> 'isCurrent') = 'true'::jsonb
        END
      ),
      "expiresAt" = COALESCE(
        t."expiresAt",
        "jsonb_timestamp_at"(t."data", '{expiresAt}'),
        "jsonb_timestamp_at"(t."data", '{expiresAt,$date}')
      ),
      "platform" = COALESCE(t."platform", "jsonb_text_at"(t."data", '{platform}')),
      "topic" = COALESCE(t."topic", "jsonb_text_at"(t."data", '{topic}')),
      "viralityScore" = COALESCE(
        t."viralityScore",
        "jsonb_number_at"(t."data", '{viralityScore}')
      )
    WHERE t."id" = ANY(batch_ids)
      AND jsonb_typeof(t."data") = 'object'
      AND (
        (t."isCurrent" IS NULL AND jsonb_typeof(t."data" -> 'isCurrent') = 'boolean')
        OR (
          t."expiresAt" IS NULL
          AND COALESCE(
            "jsonb_timestamp_at"(t."data", '{expiresAt}'),
            "jsonb_timestamp_at"(t."data", '{expiresAt,$date}')
          ) IS NOT NULL
        )
        OR (t."platform" IS NULL AND jsonb_typeof(t."data" -> 'platform') = 'string')
        OR (t."topic" IS NULL AND jsonb_typeof(t."data" -> 'topic') = 'string')
        OR (t."viralityScore" IS NULL AND jsonb_typeof(t."data" -> 'viralityScore') = 'number')
      );

    GET DIAGNOSTICS batch_updated = ROW_COUNT;
    total_updated := total_updated + batch_updated;
    last_id := batch_ids[array_upper(batch_ids, 1)];
    COMMIT;
  END LOOP;

  INSERT INTO "data_backfills" ("id", "report")
  VALUES (
    'trend_columns_from_data_20261106',
    jsonb_build_object('trendsUpdated', total_updated)
  )
  ON CONFLICT ("id") DO UPDATE SET
    "completedAt" = CURRENT_TIMESTAMP,
    "report" = EXCLUDED."report";
END
$$;
