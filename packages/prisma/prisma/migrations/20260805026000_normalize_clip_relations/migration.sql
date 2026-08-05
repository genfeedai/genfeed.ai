ALTER TABLE "clip_projects" ADD COLUMN "userId" TEXT;
ALTER TABLE "clip_results" ADD COLUMN "userId" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "clip_projects" AS project
    WHERE NULLIF(project."config"->>'userId', '') IS NOT NULL
      AND NULLIF(project."config"->>'user', '') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "users" AS candidate
        WHERE NULLIF(project."config"->>'userId', '')
                IN (candidate."id", candidate."mongoId")
          AND NULLIF(project."config"->>'user', '')
                IN (candidate."id", candidate."mongoId")
      )
  ) THEN
    RAISE EXCEPTION
      'clip_projects contains conflicting config.userId and config.user references';
  END IF;
END $$;

WITH resolved_users AS (
  SELECT project."id" AS "projectId", MIN(candidate."id") AS "userId"
  FROM "clip_projects" AS project
  JOIN "users" AS candidate
    ON COALESCE(
      NULLIF(project."config"->>'userId', ''),
      NULLIF(project."config"->>'user', '')
    ) IN (candidate."id", candidate."mongoId")
  GROUP BY project."id"
  HAVING COUNT(*) = 1
)
UPDATE "clip_projects" AS project
SET "userId" = resolved_users."userId"
FROM resolved_users
WHERE project."id" = resolved_users."projectId";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "clip_projects" AS project
    WHERE COALESCE(
      NULLIF(project."config"->>'userId', ''),
      NULLIF(project."config"->>'user', '')
    ) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "users" AS candidate
        WHERE project."userId" = candidate."id"
          AND COALESCE(
            NULLIF(project."config"->>'userId', ''),
            NULLIF(project."config"->>'user', '')
          ) IN (candidate."id", candidate."mongoId")
      )
  ) THEN
    RAISE EXCEPTION
      'clip_projects contains unresolved or ambiguous user references';
  END IF;
END $$;

UPDATE "clip_projects"
SET "config" = COALESCE("config", '{}'::jsonb) - 'userId' - 'user'
WHERE "userId" IS NOT NULL
  AND ("config" ? 'userId' OR "config" ? 'user');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "clip_results" AS result
    WHERE NULLIF(result."data"->>'userId', '') IS NOT NULL
      AND NULLIF(result."data"->>'user', '') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "users" AS candidate
        WHERE NULLIF(result."data"->>'userId', '')
                IN (candidate."id", candidate."mongoId")
          AND NULLIF(result."data"->>'user', '')
                IN (candidate."id", candidate."mongoId")
      )
  ) THEN
    RAISE EXCEPTION
      'clip_results contains conflicting data.userId and data.user references';
  END IF;
END $$;

WITH resolved_users AS (
  SELECT result."id" AS "resultId", MIN(candidate."id") AS "userId"
  FROM "clip_results" AS result
  JOIN "users" AS candidate
    ON COALESCE(
      NULLIF(result."data"->>'userId', ''),
      NULLIF(result."data"->>'user', '')
    ) IN (candidate."id", candidate."mongoId")
  WHERE result."userId" IS NULL
  GROUP BY result."id"
  HAVING COUNT(*) = 1
)
UPDATE "clip_results" AS result
SET "userId" = resolved_users."userId"
FROM resolved_users
WHERE result."id" = resolved_users."resultId";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "clip_results" AS result
    WHERE COALESCE(
      NULLIF(result."data"->>'userId', ''),
      NULLIF(result."data"->>'user', '')
    ) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "users" AS candidate
        WHERE result."userId" = candidate."id"
          AND COALESCE(
            NULLIF(result."data"->>'userId', ''),
            NULLIF(result."data"->>'user', '')
          ) IN (candidate."id", candidate."mongoId")
      )
  ) THEN
    RAISE EXCEPTION
      'clip_results contains unresolved or ambiguous user references';
  END IF;
END $$;

UPDATE "clip_results"
SET "data" = COALESCE("data", '{}'::jsonb) - 'userId' - 'user'
WHERE "userId" IS NOT NULL
  AND ("data" ? 'userId' OR "data" ? 'user');

UPDATE "clip_results" AS result
SET "projectId" = project."id"
FROM "clip_projects" AS project
WHERE result."projectId" = project."mongoId"
  AND NOT EXISTS (
    SELECT 1
    FROM "clip_projects" AS canonical_project
    WHERE canonical_project."id" = result."projectId"
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "clip_results" AS result
    WHERE result."projectId" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "clip_projects" AS project
        WHERE project."id" = result."projectId"
      )
  ) THEN
    RAISE EXCEPTION 'clip_results contains unresolved project references';
  END IF;
END $$;

CREATE INDEX "clip_results_organizationId_isDeleted_createdAt_idx"
ON "clip_results"("organizationId", "isDeleted", "createdAt" DESC);

CREATE INDEX "clip_projects_userId_idx"
ON "clip_projects"("userId");

CREATE INDEX "clip_results_userId_idx"
ON "clip_results"("userId");

ALTER TABLE "clip_projects"
ADD CONSTRAINT "clip_projects_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE
NOT VALID;

ALTER TABLE "clip_results"
ADD CONSTRAINT "clip_results_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE
NOT VALID;

ALTER TABLE "clip_results"
ADD CONSTRAINT "clip_results_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "clip_projects"("id")
ON DELETE SET NULL ON UPDATE CASCADE
NOT VALID;
