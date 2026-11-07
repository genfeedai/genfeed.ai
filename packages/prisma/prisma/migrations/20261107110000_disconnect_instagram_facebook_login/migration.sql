-- #9582 hard cut: Instagram connects only through Instagram API with Unified
-- Login, and the Page-based Facebook Login path is gone from the API. A live
-- Instagram credential with no "externalBusinessId" is such a retired
-- connection; it is marked disconnected so the brand is asked to reconnect.
-- The token and account identity are kept, so a reconnect reuses the row.
-- The API also disconnects any such row it meets at runtime, which covers
-- rows written by the previous API during the rollout. Safe to replay.
UPDATE "credentials"
SET "isConnected" = false, "updatedAt" = now()
WHERE "platform" = 'INSTAGRAM'
  AND "externalBusinessId" IS NULL
  AND "isConnected" = true
  AND "isDeleted" = false;
