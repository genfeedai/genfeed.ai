ALTER TABLE "organization_settings"
  ADD COLUMN "webhookEventTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "webhookDeliveryStatus" JSONB;
