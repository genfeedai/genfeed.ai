-- Every poll and redelivered webhook checks whether a comment is held for
-- human review. Only held activities carry the flag. Build without blocking
-- activity writes; keep this as the migration's only statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "bot_activities_intent_hold_idx"
  ON "bot_activities" ("organizationId", "triggerTweetId", "createdAt" DESC)
  WHERE "isIntentNeedsReview" = true AND "isDeleted" = false;
