-- Terminal failed state for destination deliveries that hit the attempt cap (#5889).
-- Additive and nullable: no existing rows change.

ALTER TABLE "system_event_deliveries" ADD COLUMN "failedAt" TIMESTAMP(3);
