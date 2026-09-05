CREATE TABLE "notification_inbox_items" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "eventId" TEXT NOT NULL REFERENCES "notification_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "organizationId" TEXT NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "topic" TEXT NOT NULL,
 "occurredAt" TIMESTAMP(3) NOT NULL,
 "readAt" TIMESTAMP(3),
 "isDeleted" BOOLEAN NOT NULL DEFAULT false,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "notification_inbox_event_user_key" ON "notification_inbox_items"("eventId", "userId");
CREATE INDEX "notification_inbox_history_idx" ON "notification_inbox_items"("organizationId", "userId", "isDeleted", "occurredAt" DESC, "id" DESC);
CREATE INDEX "notification_inbox_unread_idx" ON "notification_inbox_items"("organizationId", "userId", "isDeleted", "readAt");

-- Install before backfill so old producers remain compatible throughout rollout.
CREATE FUNCTION materialize_notification_inbox_item() RETURNS TRIGGER LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 IF NEW."topic" IN ('workflow.status', 'agent.status') AND NOT NEW."isDeleted" THEN
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
CREATE TRIGGER notification_delivery_inbox_insert AFTER INSERT ON "notification_deliveries"
 FOR EACH ROW EXECUTE FUNCTION materialize_notification_inbox_item();

-- Preserve historical recipients regardless of email preference or delivery result.
-- DISTINCT ON prevents multiple channels from multiplying recipient history.
INSERT INTO "notification_inbox_items" ("id", "eventId", "userId", "organizationId", "topic", "occurredAt", "createdAt", "updatedAt")
SELECT DISTINCT ON (d."eventId", d."userId")
 'inbox_' || d."id", d."eventId", d."userId", d."organizationId", d."topic", e."occurredAt", d."createdAt", CURRENT_TIMESTAMP
FROM "notification_deliveries" d
JOIN "notification_events" e ON e."id" = d."eventId" AND e."organizationId" = d."organizationId"
JOIN "users" u ON u."id" = d."userId"
JOIN "organizations" o ON o."id" = d."organizationId"
WHERE NOT d."isDeleted" AND NOT e."isDeleted" AND NOT u."isDeleted" AND NOT o."isDeleted"
 AND d."topic" IN ('workflow.status', 'agent.status')
ORDER BY d."eventId", d."userId", d."createdAt", d."id"
ON CONFLICT ("eventId", "userId") DO NOTHING;
