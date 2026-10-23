-- Bounded automatic retries of FAILED media delivery variants.
ALTER TABLE "media_delivery_variants" ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0;
