ALTER TABLE platform_settings
  ADD COLUMN "imageCompressionQuality" INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN "paygFallbackCredits" INTEGER NOT NULL DEFAULT 1000,
  ADD COLUMN "linkedinTrendSourceUrls" TEXT;

ALTER TABLE platform_settings
  ADD COLUMN "agentContextCompressionModel" TEXT,
  ADD COLUMN "agentContextWindowSize" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "generationMaxTokens" INTEGER NOT NULL DEFAULT 4000,
  ADD COLUMN "typedDecisionTimeoutMs" INTEGER NOT NULL DEFAULT 800,
  ADD COLUMN "trainingCreditsCost" DOUBLE PRECISION NOT NULL DEFAULT 500,
  ADD COLUMN "customModelCreditsCost" DOUBLE PRECISION NOT NULL DEFAULT 5,
  ADD COLUMN "replicateModelHardware" TEXT NOT NULL DEFAULT 'gpu-t4',
  ADD COLUMN "replicateModelVisibility" TEXT NOT NULL DEFAULT 'private',
  ADD COLUMN "replicateTrainerModel" TEXT NOT NULL DEFAULT 'replicate/fast-flux-trainer:f463fbfc97389e10a2f443a8a84b6953b1058eafbf0c9af4d84457ff07cb04db',
  ADD COLUMN "replicateTargetFps" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "replicateTargetResolution" TEXT NOT NULL DEFAULT '1080p',
  ADD COLUMN "klingModel" TEXT NOT NULL DEFAULT 'kling-v2',
  ADD COLUMN "elevenlabsModel" TEXT,
  ADD COLUMN "murekaModel" TEXT NOT NULL DEFAULT 'mureka-9',
  ADD COLUMN "discordChannelIdDeployments" TEXT,
  ADD COLUMN "discordChannelIdPosts" TEXT,
  ADD COLUMN "discordChannelIdStudio" TEXT,
  ADD COLUMN "discordChannelIdUsers" TEXT,
  ADD COLUMN "discordChannelIdModels" TEXT,
  ADD COLUMN "discordBotAvatarUrl" TEXT,
  ADD COLUMN "discordWebhookNamePrefix" TEXT,
  ADD COLUMN "discordWebhookReason" TEXT,
  ADD COLUMN "emailFromAddress" TEXT,
  ADD COLUMN "emailReplyToAddress" TEXT;

ALTER TABLE system_event_webhooks ADD COLUMN "destinationsResolvedAt" TIMESTAMP(3);
CREATE TABLE system_notification_destinations (
  id TEXT PRIMARY KEY, label TEXT NOT NULL, provider TEXT NOT NULL,
  address TEXT, "webhookEncrypted" TEXT, "eventTypes" TEXT[] NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true, "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX system_notification_destinations_enabled_idx ON system_notification_destinations ("isDeleted", "isEnabled");
CREATE TABLE system_event_deliveries (
  id TEXT PRIMARY KEY,
  "eventId" TEXT NOT NULL REFERENCES system_event_webhooks(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "destinationId" TEXT NOT NULL REFERENCES system_notification_destinations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  attempts INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt" TIMESTAMP(3), "skippedAt" TIMESTAMP(3),
  "leaseToken" TEXT, "leaseUntil" TIMESTAMP(3),
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  UNIQUE ("eventId", "destinationId")
);
CREATE INDEX system_event_deliveries_due_idx ON system_event_deliveries ("isDeleted", "deliveredAt", "skippedAt", "nextAttemptAt");
