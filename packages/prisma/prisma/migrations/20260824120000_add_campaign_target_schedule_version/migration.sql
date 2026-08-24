-- Versioned Scheduled Blast claims: a stale job must not match after
-- pause/cancel/reschedule. Historical rows default to 1 so immediate
-- PENDING targets keep working without a backfill.

ALTER TABLE "campaign_targets"
ADD COLUMN "scheduleVersion" INTEGER NOT NULL DEFAULT 1;
