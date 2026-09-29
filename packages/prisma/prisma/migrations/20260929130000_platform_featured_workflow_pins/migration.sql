-- Admin-pinned Featured workflows (#5511). Additive: a defaulted column that
-- instances still on the previous release never read, so the migration can
-- run before the rollout.
ALTER TABLE "platform_settings"
  ADD COLUMN "featuredWorkflowIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
