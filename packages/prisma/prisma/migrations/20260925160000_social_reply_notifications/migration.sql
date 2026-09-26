-- Materialize inbox items for `social.reply` deliveries (new replies on a
-- recently published post). Body is identical to 20260905140000_notification_inbox;
-- only the topic list is extended.
CREATE OR REPLACE FUNCTION materialize_notification_inbox_item() RETURNS TRIGGER LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 IF NEW."topic" IN ('workflow.status', 'agent.status', 'social.reply') AND NOT NEW."isDeleted" THEN
  INSERT INTO "notification_inbox_items" ("id", "eventId", "userId", "organizationId", "topic", "occurredAt", "createdAt", "updatedAt")
  SELECT 'inbox_' || NEW."id", NEW."eventId", NEW."userId", NEW."organizationId", NEW."topic", e."occurredAt", NEW."createdAt", CURRENT_TIMESTAMP
  FROM "notification_events" e
  JOIN "users" u ON u."id" = NEW."userId" AND NOT u."isDeleted"
  JOIN "organizations" o ON o."id" = NEW."organizationId" AND NOT o."isDeleted"
  WHERE e."id" = NEW."eventId" AND e."organizationId" = NEW."organizationId" AND NOT e."isDeleted"
  ON CONFLICT ("eventId", "userId") DO NOTHING;
 END IF;
 RETURN NEW;
END;
$$;
