-- Activity alert policy (#5197): a notification is an activity that needs
-- attention. Alerts are derived from activities in the same transaction, the
-- event links back to its activity, and channel deliveries (Discord, Telegram,
-- Slack, explicit email) replace the legacy Redis `notifications` publish.

-- Events: link to the source activity; platform (operator) events have no tenant.
ALTER TABLE "notification_events"
  ALTER COLUMN "organizationId" DROP NOT NULL,
  ADD COLUMN "activityId" TEXT;
ALTER TABLE "notification_events"
  ADD CONSTRAINT "notification_events_activityId_fkey"
  FOREIGN KEY ("activityId") REFERENCES "activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "notification_events_activity_idx" ON "notification_events"("activityId");

-- Deliveries: a channel delivery targets an explicit or operator destination
-- and carries its rendered message instead of a recipient user.
ALTER TABLE "notification_deliveries"
  ALTER COLUMN "userId" DROP NOT NULL,
  ALTER COLUMN "organizationId" DROP NOT NULL,
  ADD COLUMN "destination" TEXT,
  ADD COLUMN "message" JSONB;

-- Inbox items reference the activity they alert about.
ALTER TABLE "notification_inbox_items" ADD COLUMN "activityId" TEXT;
ALTER TABLE "notification_inbox_items"
  ADD CONSTRAINT "notification_inbox_items_activityId_fkey"
  FOREIGN KEY ("activityId") REFERENCES "activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "notification_inbox_activity_idx" ON "notification_inbox_items"("activityId");

-- One event vocabulary: event keys are ActivityKey values.
UPDATE "notification_events"
SET "eventKey" = CASE
  WHEN "eventKey" = 'workflow.execution.completed' AND "sourceType" = 'agent_run' THEN 'agent-run-completed'
  WHEN "eventKey" = 'workflow.execution.failed' AND "sourceType" = 'agent_run' THEN 'agent-run-failed'
  WHEN "eventKey" = 'workflow.execution.completed' THEN 'workflow-execution-completed'
  WHEN "eventKey" = 'workflow.execution.failed' THEN 'workflow-execution-failed'
  WHEN "eventKey" = 'agent.review.changed' THEN 'agent-review-changed'
  WHEN "eventKey" = 'agent.review.expired' THEN 'agent-review-expired'
  WHEN "eventKey" = 'agent.failure.delivery_failed' THEN 'agent-run-delivery-failed'
  WHEN "eventKey" = 'social.reply.received' THEN 'social-replies-received'
END
WHERE "eventKey" IN (
  'workflow.execution.completed',
  'workflow.execution.failed',
  'agent.review.changed',
  'agent.review.expired',
  'agent.failure.delivery_failed',
  'social.reply.received'
);

-- The bell materializes in-app deliveries only. Email, Telegram, Discord and
-- Slack deliveries never create inbox items; every alert that belongs in the
-- bell carries an explicit `in_app` delivery from the alert policy.
CREATE OR REPLACE FUNCTION materialize_notification_inbox_item() RETURNS TRIGGER LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 IF NEW."channel" = 'in_app' AND NEW."userId" IS NOT NULL AND NEW."organizationId" IS NOT NULL AND NOT NEW."isDeleted" THEN
  INSERT INTO "notification_inbox_items" ("id", "eventId", "activityId", "userId", "organizationId", "topic", "occurredAt", "createdAt", "updatedAt")
  SELECT 'inbox_' || NEW."id", NEW."eventId", e."activityId", NEW."userId", NEW."organizationId", NEW."topic", e."occurredAt", NEW."createdAt", CURRENT_TIMESTAMP
  FROM "notification_events" e
  JOIN "users" u ON u."id" = NEW."userId" AND NOT u."isDeleted"
  JOIN "organizations" o ON o."id" = NEW."organizationId" AND NOT o."isDeleted"
  WHERE e."id" = NEW."eventId" AND e."organizationId" = NEW."organizationId" AND NOT e."isDeleted"
  ON CONFLICT ("eventId", "userId") DO NOTHING;
 END IF;
 RETURN NEW;
END;
$$;
