ALTER TABLE "clip_projects"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN "progress" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "error" TEXT,
  ADD COLUMN "readyClipCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "failedClipCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "pendingClipCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "readiness" JSONB NOT NULL DEFAULT '{"state":"pending","terminal":false,"readyActions":[],"blockingReasons":[]}',
  ADD COLUMN "terminalAt" TIMESTAMP(3);

UPDATE "clip_projects"
SET
  "status" = COALESCE(NULLIF("config"->>'status', ''), "status"),
  "progress" = CASE
    WHEN ("config"->>'progress') ~ '^[0-9]+$' THEN ("config"->>'progress')::INTEGER
    ELSE "progress"
  END,
  "error" = COALESCE("config"->>'error', "error"),
  "readiness" = CASE
    WHEN jsonb_typeof("config"->'readiness') = 'object' THEN "config"->'readiness'
    WHEN COALESCE(NULLIF("config"->>'status', ''), "status") = 'completed' THEN '{"state":"ready","terminal":true,"readyActions":["download","edit","publish"],"blockingReasons":[]}'::JSONB
    WHEN COALESCE(NULLIF("config"->>'status', ''), "status") = 'failed' THEN '{"state":"failed","terminal":true,"readyActions":["retry"],"blockingReasons":["clip-project-failed"]}'::JSONB
    ELSE '{"state":"pending","terminal":false,"readyActions":[],"blockingReasons":[]}'::JSONB
  END,
  "terminalAt" = CASE
    WHEN COALESCE(NULLIF("config"->>'status', ''), "status") IN ('completed', 'failed') THEN "updatedAt"
    ELSE "terminalAt"
  END;

ALTER TABLE "clip_results"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN "isSelected" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "readiness" JSONB NOT NULL DEFAULT '{"state":"pending","terminal":false,"readyActions":[],"blockingReasons":[]}',
  ADD COLUMN "terminalAt" TIMESTAMP(3);

UPDATE "clip_results"
SET
  "status" = COALESCE(NULLIF("data"->>'status', ''), "status"),
  "isSelected" = CASE
    WHEN "data"->>'isSelected' IN ('true', 'false') THEN ("data"->>'isSelected')::BOOLEAN
    ELSE "isSelected"
  END,
  "readiness" = CASE
    WHEN jsonb_typeof("data"->'readiness') = 'object' THEN "data"->'readiness'
    WHEN COALESCE(NULLIF("data"->>'status', ''), "status") = 'completed' THEN '{"state":"ready","terminal":true,"readyActions":["download","edit","publish"],"blockingReasons":[]}'::JSONB
    WHEN COALESCE(NULLIF("data"->>'status', ''), "status") = 'failed' THEN '{"state":"failed","terminal":true,"readyActions":["retry"],"blockingReasons":["clip-result-failed"]}'::JSONB
    ELSE '{"state":"pending","terminal":false,"readyActions":[],"blockingReasons":[]}'::JSONB
  END,
  "terminalAt" = CASE
    WHEN COALESCE(NULLIF("data"->>'status', ''), "status") IN ('completed', 'failed') THEN "updatedAt"
    ELSE "terminalAt"
  END;

CREATE INDEX "clip_projects_organizationId_status_isDeleted_idx" ON "clip_projects"("organizationId", "status", "isDeleted");
CREATE INDEX "clip_results_organizationId_projectId_status_isDeleted_idx" ON "clip_results"("organizationId", "projectId", "status", "isDeleted");
