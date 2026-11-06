-- Backfill the promoted `trending_hashtags` columns (previous migration) for rows
-- written before the trigger existed.
--
-- Walks the primary key in batches of 2,000 and commits after each one, so a
-- concurrent write waits at most one batch instead of a table-wide UPDATE
-- holding every row lock. The walk stops at the newest id present when it
-- starts: rows written meanwhile are filled by the trigger. COMMIT inside DO is
-- allowed only outside a transaction block: keep this as the migration's only
-- statement.
--
-- The UPDATE assigns `data` to itself, which fires the trigger, so the columns
-- are computed by the same function as every later write. `updatedAt` is
-- untouched. Idempotent: an interrupted run can simply be applied again.
DO $$
DECLARE
  last_id TEXT := '';
  upper_bound TEXT;
  batch_ids TEXT[];
  batch_updated BIGINT;
  total_updated BIGINT := 0;
BEGIN
  SELECT max("id") INTO upper_bound FROM "trending_hashtags";

  LOOP
    SELECT array_agg("id" ORDER BY "id")
    INTO batch_ids
    FROM (
      SELECT "id"
      FROM "trending_hashtags"
      WHERE "id" > last_id
        AND "id" <= upper_bound
      ORDER BY "id"
      LIMIT 2000
    ) AS batch;

    EXIT WHEN batch_ids IS NULL;

    UPDATE "trending_hashtags"
    SET "data" = "data"
    WHERE "id" = ANY(batch_ids)
      AND jsonb_typeof("data") = 'object';

    GET DIAGNOSTICS batch_updated = ROW_COUNT;
    total_updated := total_updated + batch_updated;
    last_id := batch_ids[array_upper(batch_ids, 1)];
    COMMIT;
  END LOOP;

  INSERT INTO "data_backfills" ("id", "report")
  VALUES (
    'trending_hashtag_data_columns_20261106',
    jsonb_build_object('hashtagsUpdated', total_updated)
  )
  ON CONFLICT ("id") DO UPDATE SET
    "completedAt" = CURRENT_TIMESTAMP,
    "report" = EXCLUDED."report";
END
$$;
