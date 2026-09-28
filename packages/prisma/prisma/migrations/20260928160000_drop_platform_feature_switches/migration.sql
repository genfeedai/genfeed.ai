-- Product feature switches are PostHog feature flags (#5468), not Platform
-- Settings columns. The switches added by 20260927200000_platform_feature_switches
-- are dropped; their production values are set on the PostHog flags before
-- this release deploys.
ALTER TABLE "platform_settings"
  DROP COLUMN "isMediaPerceptionEnabled",
  DROP COLUMN "mediaPerceptionFrameCount",
  DROP COLUMN "mediaPerceptionLookbackHours",
  DROP COLUMN "mediaPerceptionVisionModel",
  DROP COLUMN "mediaGateVisionMode",
  DROP COLUMN "mediaTextGateDecisionMode",
  DROP COLUMN "mediaTextGateMinConfidence",
  DROP COLUMN "moderationMode",
  DROP COLUMN "moderationProvider",
  DROP COLUMN "moderationThresholds",
  DROP COLUMN "agentAutoRoutingDecisionMode",
  DROP COLUMN "modelDiscoveryDecisionMode",
  DROP COLUMN "modelDiscoveryMinConfidence",
  DROP COLUMN "patternAnalyzerDecisionMode",
  DROP COLUMN "patternAnalyzerMinConfidence",
  DROP COLUMN "replyBotIntentDecisionMode",
  DROP COLUMN "replyBotIntentMinConfidence",
  DROP COLUMN "taskRoutingDecisionMode",
  DROP COLUMN "taskRoutingMinConfidence",
  DROP COLUMN "untrustedContentDecisionMode",
  DROP COLUMN "untrustedContentMinConfidence",
  DROP COLUMN "isAgentContextCompressionEnabled",
  DROP COLUMN "isAgentTokenStreamingEnabled",
  DROP COLUMN "systemEventsEnabledAt",
  DROP COLUMN "isEmailVerificationRequired";
