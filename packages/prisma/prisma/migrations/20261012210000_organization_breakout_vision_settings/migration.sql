-- Per-organization opt-ins for breakout responses, breakout auto-publish and brand vision
-- checks (#6526, #6727). All off by default: an organization owner or admin turns them on.
ALTER TABLE "organization_settings"
  ADD COLUMN "isBreakoutResponsesEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isBreakoutAutoPublishEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isBrandVisionChecksEnabled" BOOLEAN NOT NULL DEFAULT false;
