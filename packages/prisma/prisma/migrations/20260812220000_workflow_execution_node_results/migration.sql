-- Normalize per-node execution results out of workflow_executions.result JSON
-- and promote hot progress/ETA fields to scalars (#2512).

ALTER TABLE "workflow_executions"
  ADD COLUMN IF NOT EXISTS "progress" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "durationMs" INTEGER,
  ADD COLUMN IF NOT EXISTS "creditsUsed" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "failedNodeId" TEXT,
  ADD COLUMN IF NOT EXISTS "totalNodes" INTEGER,
  ADD COLUMN IF NOT EXISTS "estimatedDurationMs" INTEGER,
  ADD COLUMN IF NOT EXISTS "remainingDurationMs" INTEGER,
  ADD COLUMN IF NOT EXISTS "etaConfidence" TEXT,
  ADD COLUMN IF NOT EXISTS "etaCurrentPhase" TEXT,
  ADD COLUMN IF NOT EXISTS "etaUpdatedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "workflow_execution_node_results" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "progress" INTEGER,
    "retryCount" INTEGER,
    "creditsUsed" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workflow_execution_node_results_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "workflow_execution_node_results_executionId_nodeId_key"
  ON "workflow_execution_node_results" ("executionId", "nodeId");

CREATE INDEX IF NOT EXISTS "workflow_execution_node_results_organizationId_executionId_idx"
  ON "workflow_execution_node_results" ("organizationId", "executionId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'workflow_execution_node_results_executionId_fkey'
  ) THEN
    ALTER TABLE "workflow_execution_node_results"
      ADD CONSTRAINT "workflow_execution_node_results_executionId_fkey"
      FOREIGN KEY ("executionId") REFERENCES "workflow_executions"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Promote leftover JSON progress/ETA/outcome fields onto the new scalars.
UPDATE "workflow_executions"
SET
  "progress" = CASE
    WHEN jsonb_typeof(result) = 'object'
      AND jsonb_typeof(result->'progress') = 'number'
      THEN (result->>'progress')::int
    ELSE "progress"
  END,
  "durationMs" = CASE
    WHEN jsonb_typeof(result) = 'object'
      AND jsonb_typeof(result->'durationMs') = 'number'
      THEN (result->>'durationMs')::int
    ELSE "durationMs"
  END,
  "creditsUsed" = CASE
    WHEN jsonb_typeof(result) = 'object'
      AND jsonb_typeof(result->'creditsUsed') = 'number'
      THEN (result->>'creditsUsed')::int
    ELSE "creditsUsed"
  END,
  "failedNodeId" = CASE
    WHEN jsonb_typeof(result) = 'object'
      AND jsonb_typeof(result->'failedNodeId') = 'string'
      THEN result->>'failedNodeId'
    ELSE "failedNodeId"
  END,
  "estimatedDurationMs" = CASE
    WHEN jsonb_typeof(result) = 'object'
      AND jsonb_typeof(result->'metadata'->'eta'->'estimatedDurationMs') = 'number'
      THEN (result->'metadata'->'eta'->>'estimatedDurationMs')::int
    ELSE "estimatedDurationMs"
  END,
  "remainingDurationMs" = CASE
    WHEN jsonb_typeof(result) = 'object'
      AND jsonb_typeof(result->'metadata'->'eta'->'remainingDurationMs') = 'number'
      THEN (result->'metadata'->'eta'->>'remainingDurationMs')::int
    ELSE "remainingDurationMs"
  END,
  "etaConfidence" = CASE
    WHEN jsonb_typeof(result) = 'object'
      AND jsonb_typeof(result->'metadata'->'eta'->'etaConfidence') = 'string'
      THEN result->'metadata'->'eta'->>'etaConfidence'
    ELSE "etaConfidence"
  END,
  "etaCurrentPhase" = CASE
    WHEN jsonb_typeof(result) = 'object'
      AND jsonb_typeof(result->'metadata'->'eta'->'currentPhase') = 'string'
      THEN result->'metadata'->'eta'->>'currentPhase'
    ELSE "etaCurrentPhase"
  END,
  "etaUpdatedAt" = CASE
    WHEN jsonb_typeof(result) = 'object'
      AND jsonb_typeof(result->'metadata'->'eta'->'lastEtaUpdateAt') = 'string'
      THEN NULLIF(result->'metadata'->'eta'->>'lastEtaUpdateAt', '')::timestamp
    ELSE "etaUpdatedAt"
  END
WHERE jsonb_typeof(result) = 'object';

-- One child row per historical node result. Conflicts lose to the unique pair.
INSERT INTO "workflow_execution_node_results" (
  "id",
  "organizationId",
  "executionId",
  "nodeId",
  "nodeType",
  "status",
  "input",
  "output",
  "error",
  "startedAt",
  "completedAt",
  "progress",
  "retryCount",
  "creditsUsed",
  "createdAt",
  "updatedAt"
)
SELECT
  'wer_' || e.id || '_' || COALESCE(node_result->>'nodeId', ordinal::text),
  e."organizationId",
  e.id,
  COALESCE(NULLIF(node_result->>'nodeId', ''), 'node-' || ordinal::text),
  COALESCE(NULLIF(node_result->>'nodeType', ''), 'unknown'),
  COALESCE(NULLIF(node_result->>'status', ''), 'PENDING'),
  CASE
    WHEN jsonb_typeof(node_result->'input') = 'object' THEN node_result->'input'
    ELSE NULL
  END,
  CASE
    WHEN jsonb_typeof(node_result->'output') IN ('object', 'array') THEN node_result->'output'
    ELSE NULL
  END,
  NULLIF(node_result->>'error', ''),
  CASE
    WHEN jsonb_typeof(node_result->'startedAt') = 'string'
      THEN NULLIF(node_result->>'startedAt', '')::timestamp
    ELSE NULL
  END,
  CASE
    WHEN jsonb_typeof(node_result->'completedAt') = 'string'
      THEN NULLIF(node_result->>'completedAt', '')::timestamp
    ELSE NULL
  END,
  CASE
    WHEN jsonb_typeof(node_result->'progress') = 'number'
      THEN (node_result->>'progress')::int
    ELSE NULL
  END,
  CASE
    WHEN jsonb_typeof(node_result->'retryCount') = 'number'
      THEN (node_result->>'retryCount')::int
    ELSE NULL
  END,
  CASE
    WHEN jsonb_typeof(node_result->'creditsUsed') = 'number'
      THEN (node_result->>'creditsUsed')::int
    ELSE NULL
  END,
  e."createdAt",
  NOW()
FROM "workflow_executions" AS e
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN jsonb_typeof(e.result->'nodeResults') = 'array'
      THEN e.result->'nodeResults'
    ELSE '[]'::jsonb
  END
) WITH ORDINALITY AS nodes(node_result, ordinal)
ON CONFLICT ("executionId", "nodeId") DO NOTHING;
