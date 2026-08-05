-- Canonicalize workspace task lifecycle values and remove the redundant
-- approved-output ID array in favor of the existing relation table.
ALTER TABLE "tasks" ALTER COLUMN "priority" DROP DEFAULT;
ALTER TABLE "tasks" ALTER COLUMN "priority" TYPE TEXT USING
  CASE
    WHEN "priority"::TEXT = 'URGENT' THEN 'critical'
    ELSE LOWER("priority"::TEXT)
  END;
ALTER TABLE "tasks" ALTER COLUMN "priority" SET DEFAULT 'medium';

UPDATE "tasks"
SET "status" = CASE LOWER("status")
  WHEN 'pending' THEN 'backlog'
  WHEN 'processing' THEN 'in_progress'
  WHEN 'completed' THEN 'done'
  ELSE LOWER("status")
END;
ALTER TABLE "tasks" ALTER COLUMN "status" SET DEFAULT 'backlog';

INSERT INTO "_task_approved_outputs" ("A", "B")
SELECT ingredient."id", task."id"
FROM "tasks" AS task
CROSS JOIN LATERAL UNNEST(COALESCE(task."approvedOutputIds", ARRAY[]::TEXT[])) AS output_id
JOIN "ingredients" AS ingredient ON ingredient."id" = output_id
ON CONFLICT DO NOTHING;

ALTER TABLE "tasks" DROP COLUMN "approvedOutputIds";
DROP TYPE IF EXISTS "TaskPriority";
DROP TYPE IF EXISTS "TaskStatus";

-- Align task-comment persistence with the public API contract.
ALTER TABLE "task_comments" RENAME COLUMN "content" TO "body";
ALTER TABLE "task_comments" RENAME COLUMN "authorId" TO "authorUserId";
ALTER TABLE "task_comments" ADD COLUMN "authorAgentId" TEXT;
UPDATE "task_comments" SET "body" = '' WHERE "body" IS NULL;
ALTER TABLE "task_comments" ALTER COLUMN "body" SET NOT NULL;
