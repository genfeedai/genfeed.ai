-- Promote AgentCampaign scalar fields out of config JSON into first-class columns.
-- Fixes the status split-brain: the status column existed but was never written;
-- config.status held the truth while the column stayed at 'draft'.

ALTER TABLE "agent_campaigns"
  ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "endDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "creditsAllocated" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "creditsUsed" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "orchestrationEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "orchestrationIntervalHours" INTEGER,
  ADD COLUMN IF NOT EXISTS "nextOrchestratedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastOrchestratedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastOrchestrationSummary" TEXT;

-- Backfill scalars from config. Status: config wins (column was stuck on draft).
UPDATE "agent_campaigns"
SET
  "status" = COALESCE(
    NULLIF(BTRIM(config ->> 'status'), ''),
    "status",
    'draft'
  ),
  "startDate" = CASE
    WHEN config ->> 'startDate' ~ '^[0-9]{4}-'
    THEN (config ->> 'startDate')::timestamp
    ELSE "startDate"
  END,
  "endDate" = CASE
    WHEN config ->> 'endDate' ~ '^[0-9]{4}-'
    THEN (config ->> 'endDate')::timestamp
    ELSE "endDate"
  END,
  "creditsAllocated" = CASE
    WHEN config ->> 'creditsAllocated' ~ '^-?[0-9]+$'
    THEN (config ->> 'creditsAllocated')::integer
    ELSE "creditsAllocated"
  END,
  "creditsUsed" = CASE
    WHEN config ->> 'creditsUsed' ~ '^-?[0-9]+$'
    THEN (config ->> 'creditsUsed')::integer
    ELSE "creditsUsed"
  END,
  "orchestrationEnabled" = CASE
    WHEN lower(config ->> 'orchestrationEnabled') IN ('true', 'false')
    THEN (config ->> 'orchestrationEnabled')::boolean
    ELSE "orchestrationEnabled"
  END,
  "orchestrationIntervalHours" = CASE
    WHEN config ->> 'orchestrationIntervalHours' ~ '^-?[0-9]+$'
    THEN (config ->> 'orchestrationIntervalHours')::integer
    ELSE "orchestrationIntervalHours"
  END,
  "nextOrchestratedAt" = CASE
    WHEN config ->> 'nextOrchestratedAt' ~ '^[0-9]{4}-'
    THEN (config ->> 'nextOrchestratedAt')::timestamp
    ELSE "nextOrchestratedAt"
  END,
  "lastOrchestratedAt" = CASE
    WHEN config ->> 'lastOrchestratedAt' ~ '^[0-9]{4}-'
    THEN (config ->> 'lastOrchestratedAt')::timestamp
    ELSE "lastOrchestratedAt"
  END,
  "lastOrchestrationSummary" = COALESCE(
    NULLIF(config ->> 'lastOrchestrationSummary', ''),
    "lastOrchestrationSummary"
  )
WHERE
  config ? 'status'
  OR config ? 'startDate'
  OR config ? 'endDate'
  OR config ? 'creditsAllocated'
  OR config ? 'creditsUsed'
  OR config ? 'orchestrationEnabled'
  OR config ? 'orchestrationIntervalHours'
  OR config ? 'nextOrchestratedAt'
  OR config ? 'lastOrchestratedAt'
  OR config ? 'lastOrchestrationSummary';

-- One source of truth: strip promoted keys (+ brief, already on description).
UPDATE "agent_campaigns"
SET config = (config
  - 'status'
  - 'startDate'
  - 'endDate'
  - 'creditsAllocated'
  - 'creditsUsed'
  - 'orchestrationEnabled'
  - 'orchestrationIntervalHours'
  - 'nextOrchestratedAt'
  - 'lastOrchestratedAt'
  - 'lastOrchestrationSummary'
  - 'brief'
)
WHERE
  config ? 'status'
  OR config ? 'startDate'
  OR config ? 'endDate'
  OR config ? 'creditsAllocated'
  OR config ? 'creditsUsed'
  OR config ? 'orchestrationEnabled'
  OR config ? 'orchestrationIntervalHours'
  OR config ? 'nextOrchestratedAt'
  OR config ? 'lastOrchestratedAt'
  OR config ? 'lastOrchestrationSummary'
  OR config ? 'brief';

CREATE INDEX IF NOT EXISTS "agent_campaigns_isDeleted_orchestrationEnabled_status_nextOrchestratedAt_idx"
  ON "agent_campaigns" ("isDeleted", "orchestrationEnabled", "status", "nextOrchestratedAt");

CREATE INDEX IF NOT EXISTS "agent_campaigns_organizationId_isDeleted_status_nextOrchestratedAt_idx"
  ON "agent_campaigns" ("organizationId", "isDeleted", "status", "nextOrchestratedAt");
