-- The review inbox lists the questions an agent run is waiting on. The question
-- itself stays in `data.pendingInputRequests`; this column marks which
-- snapshots hold one, so the inbox reads an index instead of scanning JSON.
ALTER TABLE "agent_thread_snapshots" ADD COLUMN "pendingInputAt" TIMESTAMP(3);

-- A request's createdAt is free JSON, so a value such as 2026-13-22T10:00:00Z
-- must read as "no time" instead of aborting the migration.
CREATE FUNCTION pg_temp.pending_input_time(value text) RETURNS timestamp AS $$
BEGIN
  RETURN value::timestamptz AT TIME ZONE 'UTC';
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Existing waiting threads: the oldest pending question's time, falling back to
-- the snapshot's last update when a request carries no valid createdAt.
UPDATE "agent_thread_snapshots" AS snapshot
SET "pendingInputAt" = COALESCE(
  (
    SELECT MIN(
      CASE
        WHEN request ->> 'createdAt' ~ '^\d{4}-\d{2}-\d{2}T'
          THEN pg_temp.pending_input_time(request ->> 'createdAt')
      END
    )
    FROM jsonb_array_elements(snapshot."data" -> 'pendingInputRequests') AS request
  ),
  snapshot."updatedAt"
)
WHERE jsonb_typeof(snapshot."data" -> 'pendingInputRequests') = 'array'
  AND jsonb_array_length(snapshot."data" -> 'pendingInputRequests') > 0
  AND snapshot."isDeleted" = false;

CREATE INDEX "agent_thread_snapshots_pending_input_idx"
  ON "agent_thread_snapshots" ("organizationId", "pendingInputAt")
  WHERE "pendingInputAt" IS NOT NULL AND "isDeleted" = false;
