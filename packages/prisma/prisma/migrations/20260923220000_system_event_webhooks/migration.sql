CREATE TABLE "system_event_webhooks" (
  "id" TEXT NOT NULL PRIMARY KEY, "type" TEXT NOT NULL, "payload" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL, "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt" TIMESTAMP(3), "leaseUntil" TIMESTAMP(3), "leaseToken" TEXT,
  "lastStatusCode" INTEGER, "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "system_event_webhooks_isDeleted_deliveredAt_nextAttemptAt_idx" ON "system_event_webhooks" ("isDeleted", "deliveredAt", "nextAttemptAt");

ALTER TABLE "system_event_webhooks" ADD COLUMN "skippedAt" TIMESTAMP(3);
CREATE TABLE "system_notification_settings" ("id" TEXT NOT NULL PRIMARY KEY, "enabled" BOOLEAN NOT NULL DEFAULT true, "eventTypes" TEXT[] NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL);
