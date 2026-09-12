-- #4672: replace the hidden `agent_threads.planModeEnabled` boolean with a
-- first-class `mode` string ('auto' | 'manual' | 'plan' — see
-- `AgentThreadMode` in @genfeedai/contracts), and add the per-user saved
-- default agent mode preference on `settings`.
--
-- Existing plan-mode threads keep working as `plan`; every other existing
-- thread had no auto/manual distinction before this migration, so it starts
-- at the same safe default ('manual') a never-configured user's new thread
-- would get.

BEGIN;

ALTER TABLE "agent_threads" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'manual';

UPDATE "agent_threads"
  SET "mode" = 'plan'
  WHERE "planModeEnabled" = true;

ALTER TABLE "agent_threads" DROP COLUMN "planModeEnabled";

ALTER TABLE "settings" ADD COLUMN "agentMode" TEXT NOT NULL DEFAULT 'manual';

COMMIT;
