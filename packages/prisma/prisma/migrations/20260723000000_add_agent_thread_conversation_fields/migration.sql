-- Persist the agent thread conversation fields the API, serializers and UI
-- already treat as first-class. They were only declared on the augmented
-- `AgentRoomDocument` interface, never migrated, so every write path that set
-- them (thread create, branch, PATCH /threads/:threadId) failed with
-- `Unknown argument planModeEnabled` at runtime.
--
-- All columns are nullable or carry a constant default, so PG11+ applies them
-- as catalog-only changes with no table rewrite and no long lock.

BEGIN;

ALTER TABLE "agent_threads"
  ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "planModeEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "requestedModel" TEXT,
  ADD COLUMN "runtimeKey" TEXT,
  ADD COLUMN "source" TEXT,
  ADD COLUMN "systemPrompt" TEXT,
  ADD COLUMN "memoryEntryIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "parentThreadId" TEXT;

COMMIT;
