-- Lifecycle marketing emails are cloud-only, but the schema stays in the OSS
-- database so replay-safe webhook handling and unsubscribe compliance use the
-- same source of truth in every deployed API.

CREATE TABLE "lifecycle_email_preferences" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "unsubscribeToken" TEXT NOT NULL,
  "marketingUnsubscribedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "lifecycle_email_preferences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lifecycle_email_deliveries" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "sequence" TEXT NOT NULL,
  "step" TEXT NOT NULL,
  "triggerKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'scheduled',
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3),
  "skippedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "lifecycle_email_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lifecycle_email_preferences_userId_key"
  ON "lifecycle_email_preferences"("userId");

CREATE UNIQUE INDEX "lifecycle_email_preferences_unsubscribeToken_key"
  ON "lifecycle_email_preferences"("unsubscribeToken");

CREATE UNIQUE INDEX "lifecycle_email_deliveries_unique_step"
  ON "lifecycle_email_deliveries"("userId", "sequence", "step", "triggerKey");

CREATE INDEX "lifecycle_email_deliveries_due_idx"
  ON "lifecycle_email_deliveries"("status", "scheduledFor");

CREATE INDEX "lifecycle_email_deliveries_trigger_idx"
  ON "lifecycle_email_deliveries"("triggerKey");

ALTER TABLE "lifecycle_email_preferences"
  ADD CONSTRAINT "lifecycle_email_preferences_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lifecycle_email_deliveries"
  ADD CONSTRAINT "lifecycle_email_deliveries_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
