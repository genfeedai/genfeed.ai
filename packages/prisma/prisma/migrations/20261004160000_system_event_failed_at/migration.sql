-- Terminal failed state for system events that hit the event-level lease cap (#6110).
-- Additive and nullable: no existing rows change.

ALTER TABLE "system_event_webhooks" ADD COLUMN "failedAt" TIMESTAMP(3);
