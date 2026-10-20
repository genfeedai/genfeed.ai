-- The Messages badge counts unread conversations (`unreadCount > 0`, brand or
-- brandless, not archived) and is polled every minute from every open page.
-- No index covers `unreadCount`, so the count filtered a large share of the
-- organization's conversations. Index only conversations with unread messages;
-- that set is small. Build without blocking inbox writes; keep this as the
-- migration's only statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "social_conversations_unread_idx"
  ON "social_conversations" ("organizationId", "brandId")
  WHERE "unreadCount" > 0 AND "isDeleted" = false;
