-- Product feature switches move from env to the platform-settings singleton (#5407).
-- Column defaults equal the retired env defaults, so a fresh install behaves
-- exactly as an install that never set those variables.
ALTER TABLE "platform_settings"
  ADD COLUMN "isMediaPerceptionEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "mediaPerceptionFrameCount" INTEGER NOT NULL DEFAULT 6,
  ADD COLUMN "mediaPerceptionLookbackHours" INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN "mediaPerceptionVisionModel" TEXT,
  ADD COLUMN "mediaGateVisionMode" TEXT NOT NULL DEFAULT 'off',
  ADD COLUMN "mediaTextGateDecisionMode" TEXT NOT NULL DEFAULT 'off',
  ADD COLUMN "mediaTextGateMinConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
  ADD COLUMN "moderationMode" TEXT NOT NULL DEFAULT 'shadow',
  ADD COLUMN "moderationProvider" TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN "moderationThresholds" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "agentAutoRoutingDecisionMode" TEXT NOT NULL DEFAULT 'off',
  ADD COLUMN "modelDiscoveryDecisionMode" TEXT NOT NULL DEFAULT 'off',
  ADD COLUMN "modelDiscoveryMinConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
  ADD COLUMN "patternAnalyzerDecisionMode" TEXT NOT NULL DEFAULT 'shadow',
  ADD COLUMN "patternAnalyzerMinConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
  ADD COLUMN "replyBotIntentDecisionMode" TEXT NOT NULL DEFAULT 'off',
  ADD COLUMN "replyBotIntentMinConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
  ADD COLUMN "taskRoutingDecisionMode" TEXT NOT NULL DEFAULT 'shadow',
  ADD COLUMN "taskRoutingMinConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
  ADD COLUMN "untrustedContentDecisionMode" TEXT NOT NULL DEFAULT 'off',
  ADD COLUMN "untrustedContentMinConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.95,
  ADD COLUMN "isAgentContextCompressionEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "isAgentTokenStreamingEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "systemEventsEnabledAt" TIMESTAMP(3),
  ADD COLUMN "isEmailVerificationRequired" BOOLEAN NOT NULL DEFAULT false;

-- Carry the running deployment's values onto its existing singleton row.
-- A fresh database has no row yet and keeps the column defaults above.
--
-- Production ran with MEDIA_PERCEPTION_ENABLED=false and
-- BETTER_AUTH_REQUIRE_EMAIL_VERIFICATION=true; everything else at defaults.
-- System-event recording keeps its observation window: a deployment that
-- already recorded events starts from its earliest recorded event (never
-- earlier than the retired SYSTEM_EVENTS_ENABLED_AT, because events before it
-- were never recorded), and one that never recorded stays disabled.
UPDATE "platform_settings"
SET
  "isMediaPerceptionEnabled" = false,
  "isEmailVerificationRequired" = true,
  "systemEventsEnabledAt" = (
    SELECT MIN("occurredAt") FROM "system_event_webhooks"
  )
WHERE "key" = 'platform';
