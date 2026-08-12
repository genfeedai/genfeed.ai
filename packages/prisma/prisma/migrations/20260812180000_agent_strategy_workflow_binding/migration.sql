-- Promote agent → workflow binding out of config JSON into first-class columns.
-- workflowInputOverrides is a typed JSON array only: [{ "key", "value" }].

ALTER TABLE "agent_strategies"
  ADD COLUMN IF NOT EXISTS "preferredWorkflowId" TEXT,
  ADD COLUMN IF NOT EXISTS "preferredWorkflowTemplateId" TEXT,
  ADD COLUMN IF NOT EXISTS "workflowInputOverrides" JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Backfill from legacy config bag keys written by the first agent-workflow ship.
UPDATE "agent_strategies"
SET
  "preferredWorkflowId" = NULLIF(BTRIM(config ->> 'preferredWorkflowId'), ''),
  "preferredWorkflowTemplateId" = NULLIF(
    BTRIM(config ->> 'preferredWorkflowTemplateId'),
    ''
  )
WHERE
  (
    config ? 'preferredWorkflowId'
    OR config ? 'preferredWorkflowTemplateId'
  )
  AND (
    "preferredWorkflowId" IS NULL
    OR "preferredWorkflowTemplateId" IS NULL
  );

-- Map legacy free-object workflowInputDefaults → typed override list.
UPDATE "agent_strategies" AS s
SET "workflowInputOverrides" = mapped.overrides
FROM (
  SELECT
    id,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'key', entry.key,
            'value', entry.value
          )
        )
        FROM jsonb_each(config -> 'workflowInputDefaults') AS entry(key, value)
        WHERE jsonb_typeof(entry.value) IN ('string', 'number', 'boolean')
      ),
      '[]'::jsonb
    ) AS overrides
  FROM "agent_strategies"
  WHERE
    config ? 'workflowInputDefaults'
    AND jsonb_typeof(config -> 'workflowInputDefaults') = 'object'
) AS mapped
WHERE
  s.id = mapped.id
  AND (
    s."workflowInputOverrides" IS NULL
    OR s."workflowInputOverrides" = '[]'::jsonb
  )
  AND mapped.overrides <> '[]'::jsonb;

-- Strip promoted keys from config so there is one source of truth.
UPDATE "agent_strategies"
SET config = (config
  - 'preferredWorkflowId'
  - 'preferredWorkflowTemplateId'
  - 'workflowInputDefaults'
)
WHERE
  config ? 'preferredWorkflowId'
  OR config ? 'preferredWorkflowTemplateId'
  OR config ? 'workflowInputDefaults';

CREATE INDEX IF NOT EXISTS "agent_strategies_organizationId_preferredWorkflowId_idx"
  ON "agent_strategies" ("organizationId", "preferredWorkflowId");

CREATE INDEX IF NOT EXISTS "agent_strategies_organizationId_preferredWorkflowTemplateId_idx"
  ON "agent_strategies" ("organizationId", "preferredWorkflowTemplateId");
