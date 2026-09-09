CREATE TABLE "email_messages" (
  "id" TEXT NOT NULL PRIMARY KEY, "deliveryId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL, "userId" TEXT NOT NULL, "templateKey" TEXT NOT NULL,
  "goal" TEXT, "destinationUrl" TEXT NOT NULL, "clickTokenHash" TEXT NOT NULL,
  "recipientHash" TEXT, "providerMessageId" TEXT,
  "acceptedAt" TIMESTAMP(3), "deliveredAt" TIMESTAMP(3), "openedAt" TIMESTAMP(3),
  "clickedAt" TIMESTAMP(3), "bouncedAt" TIMESTAMP(3), "complainedAt" TIMESTAMP(3),
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "email_messages_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "notification_deliveries"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "email_messages_deliveryId_key" ON "email_messages"("deliveryId");
CREATE UNIQUE INDEX "email_messages_clickTokenHash_key" ON "email_messages"("clickTokenHash");
CREATE UNIQUE INDEX "email_messages_providerMessageId_key" ON "email_messages"("providerMessageId");
CREATE INDEX "email_messages_organizationId_userId_goal_clickedAt_idx" ON "email_messages"("organizationId", "userId", "goal", "clickedAt");
CREATE INDEX "email_messages_createdAt_templateKey_idx" ON "email_messages"("createdAt", "templateKey");
CREATE TABLE "email_conversions" (
  "id" TEXT NOT NULL PRIMARY KEY, "messageId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL, "userId" TEXT NOT NULL, "goal" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL, "occurredAt" TIMESTAMP(3) NOT NULL, "value" DOUBLE PRECISION,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_conversions_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "email_messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "email_conversions_organizationId_userId_goal_sourceId_key" ON "email_conversions"("organizationId", "userId", "goal", "sourceId");
CREATE INDEX "email_conversions_messageId_isDeleted_idx" ON "email_conversions"("messageId", "isDeleted");
CREATE TABLE "email_provider_events" (
  "id" TEXT NOT NULL PRIMARY KEY, "providerMessageId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL, "occurredAt" TIMESTAMP(3) NOT NULL, "processedAt" TIMESTAMP(3), "lastAttemptAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "email_provider_events_providerMessageId_processedAt_idx" ON "email_provider_events"("providerMessageId", "processedAt");
CREATE TABLE "email_suppressions" (
  "recipientHash" TEXT NOT NULL PRIMARY KEY, "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "articles" ADD COLUMN "generationCompletedAt" TIMESTAMP(3);

CREATE TABLE "email_clicks" (
  "id" TEXT NOT NULL PRIMARY KEY, "messageId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "email_clicks_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "email_messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "email_clicks_organizationId_userId_occurredAt_idx" ON "email_clicks"("organizationId", "userId", "occurredAt");
CREATE INDEX "email_clicks_messageId_occurredAt_idx" ON "email_clicks"("messageId", "occurredAt");

CREATE INDEX "email_provider_events_processedAt_lastAttemptAt_idx" ON "email_provider_events"("processedAt", "lastAttemptAt");

ALTER TABLE "credentials" ADD COLUMN "connectedAt" TIMESTAMP(3);
CREATE INDEX "credentials_organizationId_userId_connectedAt_idx" ON "credentials"("organizationId", "userId", "connectedAt");

CREATE TABLE "email_signal_checkpoints" (
  "id" TEXT NOT NULL PRIMARY KEY, "organizationId" TEXT NOT NULL, "stream" TEXT NOT NULL,
  "scannedThrough" TIMESTAMP(3) NOT NULL, "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "email_signal_checkpoints_organizationId_stream_key" ON "email_signal_checkpoints"("organizationId", "stream");
