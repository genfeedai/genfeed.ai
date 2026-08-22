CREATE TABLE "notification_events" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "deduplicationKey" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "payload" JSONB NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_preferences" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT false,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_deliveries" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "skippedAt" TIMESTAMP(3),
  "providerMessageId" TEXT,
  "lastError" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_events_deduplicationKey_key"
ON "notification_events"("deduplicationKey");
CREATE INDEX "notification_events_org_key_occurred_idx"
ON "notification_events"("organizationId", "eventKey", "occurredAt" DESC);
CREATE INDEX "notification_events_source_idx"
ON "notification_events"("sourceType", "sourceId");

CREATE UNIQUE INDEX "notification_preferences_user_topic_channel_key"
ON "notification_preferences"("userId", "topic", "channel");
CREATE INDEX "notification_preferences_user_deleted_idx"
ON "notification_preferences"("userId", "isDeleted");

CREATE UNIQUE INDEX "notification_deliveries_idempotencyKey_key"
ON "notification_deliveries"("idempotencyKey");
CREATE UNIQUE INDEX "notification_deliveries_event_user_channel_key"
ON "notification_deliveries"("eventId", "userId", "channel");
CREATE INDEX "notification_deliveries_due_idx"
ON "notification_deliveries"("status", "nextAttemptAt", "isDeleted");
CREATE INDEX "notification_deliveries_org_user_created_idx"
ON "notification_deliveries"("organizationId", "userId", "createdAt" DESC);

ALTER TABLE "notification_events"
ADD CONSTRAINT "notification_events_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notification_preferences"
ADD CONSTRAINT "notification_preferences_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notification_deliveries"
ADD CONSTRAINT "notification_deliveries_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "notification_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notification_deliveries"
ADD CONSTRAINT "notification_deliveries_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notification_deliveries"
ADD CONSTRAINT "notification_deliveries_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve every existing opt-in before retiring the one-off settings column.
INSERT INTO "notification_preferences" (
  "id", "userId", "topic", "channel", "isEnabled", "isDeleted", "createdAt", "updatedAt"
)
SELECT
  'notif-pref-' || md5(settings."userId"),
  settings."userId",
  'workflow.status',
  'email',
  true,
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "settings" AS settings
INNER JOIN "users" AS users
  ON users."id" = settings."userId" AND users."isDeleted" = false
WHERE settings."isWorkflowNotificationsEmail" = true
  AND settings."isDeleted" = false
ON CONFLICT ("userId", "topic", "channel") DO UPDATE
SET "isEnabled" = true, "isDeleted" = false, "updatedAt" = CURRENT_TIMESTAMP;

ALTER TABLE "settings" DROP COLUMN "isWorkflowNotificationsEmail";
