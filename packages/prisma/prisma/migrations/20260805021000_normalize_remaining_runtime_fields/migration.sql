ALTER TABLE "personas"
ADD COLUMN "isFleetCharacter" BOOLEAN NOT NULL DEFAULT false;

UPDATE "personas"
SET
  "isFleetCharacter" = COALESCE(
    CASE
      WHEN "config"->>'isFleetCharacter' IN ('true', 'false')
      THEN ("config"->>'isFleetCharacter')::boolean
      ELSE false
    END,
    false
  ),
  "config" = COALESCE("config", '{}'::jsonb) - 'isFleetCharacter';

CREATE INDEX "personas_organizationId_isDeleted_isFleetCharacter_idx"
ON "personas"("organizationId", "isDeleted", "isFleetCharacter");

ALTER TABLE "distributions"
ADD COLUMN "platform" TEXT;

UPDATE "distributions"
SET
  "platform" = "config"->>'platform',
  "config" = COALESCE("config", '{}'::jsonb) - 'platform';

CREATE INDEX "distributions_organizationId_platform_isDeleted_createdAt_idx"
ON "distributions"("organizationId", "platform", "isDeleted", "createdAt" DESC);

INSERT INTO "_task_linked_runs" ("A", "B")
SELECT DISTINCT linked_run."runId", task."id"
FROM "tasks" AS task
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE
    WHEN jsonb_typeof(task."config"->'linkedRunIds') = 'array'
    THEN task."config"->'linkedRunIds'
    ELSE '[]'::jsonb
  END
) AS linked_run("runId")
INNER JOIN "agent_runs" AS agent_run
  ON agent_run."id" = linked_run."runId"
ON CONFLICT DO NOTHING;

UPDATE "tasks"
SET "config" = COALESCE("config", '{}'::jsonb) - 'linkedRunIds'
WHERE "config" ? 'linkedRunIds';
